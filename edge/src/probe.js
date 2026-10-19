/**
 * The phone probe: opens a landing page the way a person tapping an ad does (phone screen, slow 4G,
 * a test utm + fbclid on the link) in Cloudflare Browser Rendering, and records what happened:
 * status, redirects, how long until the main content shows, whether the tags survived, which Meta
 * pixels loaded and which events they sent. Rules from our REA observation (docs/STACK.md): wait for
 * the network to settle, note a consent banner, and report "pixel loaded, no event seen" as
 * "couldn't confirm", never as broken.
 */
import puppeteer from '@cloudflare/puppeteer'

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
export const TEST_TAGS = { utm_source: 'leakwatch', utm_medium: 'paid_social', utm_campaign: 'page_check', fbclid: 'IwLeakwatchCheck01' }
export const SLOW_MS = 4000
const NAV_TIMEOUT = 25_000
const SETTLE_MS = 9_000
const EVENTS = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead', 'CompleteRegistration', 'Search', 'AddPaymentInfo', 'Contact', 'Subscribe'])
const CMP = /onetrust|cookiebot|cookielaw|usercentrics|didomi|iubenda|quantcast|trustarc|termly|cookieyes|osano|consentmanager|complianz/i
const TAG_MANAGER = /googletagmanager\.com\/gtm\.js|getelevar|segment\.com\/analytics|cdn\.segment|tealium|stape\.io|analyzify|littledata/i
const CHALLENGE = /just a moment|attention required|verify you are human|checking your browser|access denied|cf-chl|captcha|request unsuccessful/i

export function withTestTags(url) {
  const u = new URL(url)
  for (const [k, v] of Object.entries(TEST_TAGS)) u.searchParams.set(k, v)
  return u.toString()
}

/** Pixel hit → { id, ev, eid } from a facebook.com/tr request (GET query or POST form body). */
export function parsePixelHit(url, postData) {
  let u
  try { u = new URL(url) } catch { return null }
  if (!/(^|\.)facebook\.com$/.test(u.hostname) || !/^\/tr\/?$/.test(u.pathname)) return null
  const p = new URLSearchParams(u.search)
  if (postData && !p.get('ev')) {
    try { for (const [k, v] of new URLSearchParams(postData)) if (!p.has(k)) p.set(k, v) } catch { /* not a form body */ }
  }
  const id = p.get('id'), ev = p.get('ev')
  if (!id || !ev) return null
  return { id, ev, eid: p.get('eid') || undefined }
}

/** Pixel IDs whose config the page loaded (connect.facebook.net/signals/config/<id>). */
export function pixelConfigId(url) {
  const m = String(url).match(/connect\.facebook\.net\/signals\/config\/(\d{6,20})/)
  return m ? m[1] : null
}

export const registrableDomain = host => String(host).toLowerCase().replace(/^www\./, '').split('.').slice(-2).join('.')

/**
 * Turns raw observations into a Probe (shared/src/types.ts) plus plain findings. Pure, so it is
 * unit-tested without a browser.
 */
export function classify(raw, { url, pixelId = null, checkedAt = new Date().toISOString() } = {}) {
  const findings = []
  const pixelIds = [...new Set([...raw.configIds, ...raw.hits.map(h => h.id)])]
  const events = raw.hits.filter(h => EVENTS.has(h.ev)).map(h => ({ name: h.ev, pixelId: h.id, ...(h.eid ? { eventId: h.eid } : {}) }))
  const finalUrl = raw.finalUrl || null
  let tagsKept = null
  if (finalUrl && raw.status && raw.status < 400) {
    try {
      const f = new URL(finalUrl)
      tagsKept = f.searchParams.get('fbclid') === TEST_TAGS.fbclid && f.searchParams.get('utm_source') === TEST_TAGS.utm_source
    } catch { tagsKept = null }
  }
  const strip = s => { try { const u = new URL(s); u.search = ''; u.hash = ''; return u.toString() } catch { return s } }
  const probe = {
    url: strip(url),
    checkedAt,
    state: 'ok',
    status: raw.status ?? null,
    finalUrl: finalUrl ? strip(finalUrl) : null,
    redirects: raw.redirects.map(strip),
    loadMs: raw.loadMs ?? null,
    tagsKept,
    pixelIds,
    events,
    consentBanner: !!raw.consent,
    requests: raw.requests,
    note: undefined
  }

  if (raw.error || !raw.status) {
    probe.state = 'blocked'
    probe.note = raw.error === 'timeout' ? 'The page didn’t finish opening in 25 seconds.' : 'We couldn’t open the page.'
    findings.push({ id: 'P1', tone: 'leak', title: raw.error === 'timeout' ? 'The page didn’t open in 25 seconds' : 'We couldn’t open this page', detail: 'People tapping your ad likely hit the same wall. Open it on your phone to confirm.' })
    return { probe, findings }
  }
  if (raw.challenge || [401, 403, 429, 503].includes(raw.status)) {
    probe.state = 'blocked'
    probe.note = 'Bot protection stopped our check browser. Real visitors may be fine.'
    findings.push({ id: 'blocked', tone: 'idle', title: 'The site’s bot protection stopped our check', detail: 'This usually doesn’t affect people. If you can, allow our checker or check the page yourself.' })
    return { probe, findings }
  }

  if (raw.status >= 400) findings.push({ id: 'P1', tone: 'leak', title: `The page returns ${raw.status}`, detail: 'Everyone who taps the ad sees an error page. Pause the ads that use it until it’s back.' })
  else if (finalUrl && registrableDomain(new URL(finalUrl).hostname) !== registrableDomain(new URL(url).hostname)) {
    findings.push({ id: 'P1', tone: 'leak', title: 'The link ends on a different website', detail: `It lands on ${new URL(finalUrl).hostname}. If that isn’t yours, the ad is paying to send people away.` })
  }
  if (raw.loadMs && raw.loadMs > SLOW_MS) findings.push({ id: 'P2', tone: 'leak', title: `Main content shows after ${(raw.loadMs / 1000).toFixed(1)} s on a phone`, detail: 'Many people close the tab before 4 seconds. Shrink the hero image or video, and load chat and review widgets later.' })
  if (tagsKept === false) findings.push({ id: 'P3', tone: 'leak', title: 'Your ad’s tags are lost on the way', detail: `utm and fbclid didn’t reach the final page${raw.redirects.length > 1 ? ` after ${raw.redirects.length - 1} redirect${raw.redirects.length > 2 ? 's' : ''}` : ''}. Sales can’t be matched to the ad.` })

  const pageViews = events.filter(e => e.name === 'PageView')
  if (raw.status < 400) {
    if (pixelIds.length === 0) {
      if (raw.tagManager && !raw.consent) findings.push({ id: 'T1?', tone: 'warn', title: 'We couldn’t see a Meta pixel in the browser', detail: 'Your tag manager may load it later, or send events from your server (Conversions API). Check Events Manager to be sure.' })
      else if (raw.consent) findings.push({ id: 'T1?', tone: 'warn', title: 'No Meta pixel before the cookie banner is accepted', detail: 'That can be fine (consent first). Check the pixel fires after someone taps Accept.' })
      else findings.push({ id: 'T1', tone: 'leak', title: 'No Meta pixel on this page', detail: 'Meta can’t see visits or sales from this page, so it optimises your ads blind.' })
    } else if (pageViews.length === 0) {
      findings.push({ id: 'T1?', tone: 'warn', title: 'The pixel loaded but sent no PageView', detail: raw.consent ? 'A cookie banner may be holding it back until someone accepts.' : 'It may fire late or only after a tap. Check Events Manager’s test tool.' })
    }
    if (pixelId && pixelIds.length > 0 && !pixelIds.includes(pixelId)) {
      findings.push({ id: 'T2', tone: 'leak', title: 'The page uses a different pixel', detail: `It fires …${pixelIds[0].slice(-4)}, not your …${pixelId.slice(-4)}. Sales go to the wrong pixel.` })
    }
    const dupes = duplicateEventNames(events)
    if (dupes.length) findings.push({ id: 'T4', tone: 'leak', title: `${dupes.join(' and ')} sent twice`, detail: 'Two copies without a shared event ID, so Meta counts them twice and your results look better than they are.' })
  }

  const leaking = findings.some(f => f.tone === 'leak')
  probe.state = leaking ? 'issue' : findings.some(f => f.tone === 'warn') ? 'unconfirmed' : 'ok'
  if (!findings.length) findings.push({ id: 'ok', tone: 'saved', title: 'This page looks healthy', detail: `Opens in ${((raw.loadMs || 0) / 1000).toFixed(1)} s on a phone, keeps your tags, and the pixel sends PageView.` })
  return { probe, findings }
}

/** Same rule as shared/src/detectors.ts duplicateEvents. */
export function duplicateEventNames(events) {
  const groups = new Map(), counts = new Map()
  events.forEach((e, i) => {
    const k = `${e.pixelId}|${e.name}`
    counts.set(k, (counts.get(k) || 0) + 1)
    if (!groups.has(k)) groups.set(k, new Set())
    groups.get(k).add(e.eventId ?? `none${i}`)
  })
  return [...new Set([...groups].filter(([k, ids]) => counts.get(k) >= 2 && ids.size >= 2).map(([k]) => k.split('|')[1]))]
}

const short = u => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 40) : '') } catch { return String(u).slice(0, 50) } }

/** Reuses an idle warm browser session when there is one; new launches are limited per minute. */
async function openBrowser(env) {
  const sessions = await puppeteer.sessions(env.BROWSER).catch(() => [])
  for (const s of sessions.filter(x => !x.connectionId)) {
    try { return await puppeteer.connect(env.BROWSER, s.sessionId) } catch { /* taken meanwhile: try the next */ }
  }
  let lastErr
  for (let i = 0; i < 3; i++) {
    try { return await puppeteer.launch(env.BROWSER, { keep_alive: 120_000 }) } catch (e) {
      lastErr = e
      if (!/limit|429|rate/i.test(e.message)) break
      await new Promise(r => setTimeout(r, 4000 * (i + 1)))
    }
  }
  throw lastErr
}

/** Opens the page in a real browser. Returns raw observations for classify(). */
export async function observe(env, url) {
  const t0 = Date.now()
  const raw = { status: null, finalUrl: null, redirects: [], loadMs: null, hits: [], configIds: [], consent: false, tagManager: false, challenge: false, requests: [], error: null, screenshot: null }
  let browser
  try {
    browser = await openBrowser(env)
  } catch (e) {
    console.log('browser launch failed', e.message)
    raw.error = /limit|429|quota|rate/i.test(e.message) ? 'busy' : 'launch'
    return raw
  }
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await page.setUserAgent(UA)
    // a mid-range phone on ordinary 4G (~10 Mbps, 70 ms): pessimistic lab throttling flagged healthy shops as slow
    try { await page.emulateNetworkConditions({ download: (10 * 1024 * 1024) / 8, upload: (3 * 1024 * 1024) / 8, latency: 70 }) } catch { /* not supported: unthrottled */ }
    await page.evaluateOnNewDocument(() => {
      window.__lw = { lcp: 0 }
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lw.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch { /* old browser */ }
    })
    const scripts = []
    let tNav = Date.now()
    page.on('request', r => {
      const u = r.url()
      const hit = parsePixelHit(u, r.postData?.())
      if (hit) {
        raw.hits.push(hit)
        raw.requests.push({ at: Date.now() - tNav, kind: 'pixel', label: `${hit.ev} sent to pixel …${hit.id.slice(-4)}${hit.eid ? '' : ' (no event ID)'}`, ok: true })
      }
      const cfg = pixelConfigId(u)
      if (cfg && !raw.configIds.includes(cfg)) raw.configIds.push(cfg)
      if (CMP.test(u)) raw.consent = true
      if (TAG_MANAGER.test(u)) raw.tagManager = true
    })
    page.on('response', r => {
      const u = r.url(), rt = r.request().resourceType()
      if (rt === 'script' && /fbevents\.js/.test(u)) raw.requests.push({ at: Date.now() - tNav, kind: 'script', label: 'Meta pixel script loaded', status: r.status(), ok: r.status() < 400 })
      else if (rt === 'script') scripts.push({ at: Date.now() - tNav, u, status: r.status() })
    })

    let res = null
    tNav = Date.now()
    try {
      res = await page.goto(withTestTags(url), { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    } catch (e) {
      if (/timeout/i.test(e.message)) raw.error = 'timeout'
      else { raw.error = 'navigation'; console.log('goto failed', e.message) }
    }
    if (res) {
      const chain = res.request().redirectChain()
      raw.redirects = [...chain.map(c => c.url()), res.url()]
      chain.forEach((c, i) => raw.requests.push({ at: 0, kind: 'redirect', label: `Redirect ${i + 1}: ${short(c.url())}`, status: c.response()?.status(), ok: true }))
      raw.status = res.status()
      raw.requests.unshift({ at: Date.now() - tNav, kind: 'document', label: `Page: ${short(res.url())}`, status: res.status(), ok: res.status() < 400 })
      // let late pixels and consent tools fire
      try { await page.waitForNetworkIdle({ idleTime: 1500, timeout: SETTLE_MS }) } catch { /* busy page: keep what we have */ }
      raw.finalUrl = page.url()
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        const text = (document.body?.innerText || '').slice(0, 20000)
        return { lcp: window.__lw?.lcp || 0, dcl: nav ? nav.domContentLoadedEventEnd : 0, load: nav ? nav.loadEventEnd : 0, title: document.title, text }
      }).catch(() => null)
      if (m) {
        raw.loadMs = Math.round(m.lcp || m.dcl || m.load) || null
        if (/\b(cookies?|consent)\b/i.test(m.text) && /\b(accept|agree|allow|got it)\b/i.test(m.text)) raw.consent = true
        if (CHALLENGE.test(m.title) || (raw.status >= 403 && CHALLENGE.test(m.text.slice(0, 2000)))) raw.challenge = true
        raw.requests.push({ at: raw.loadMs || 0, kind: 'other', label: 'Main content visible', ok: (raw.loadMs || 0) <= SLOW_MS })
      }
      const slowest = scripts.filter(s => s.at > 1500).sort((a, b) => b.at - a.at).slice(0, 3)
      for (const s of slowest) raw.requests.push({ at: s.at, kind: 'script', label: `Script: ${short(s.u)}`, status: s.status, ok: s.status < 400 })
      raw.requests.sort((a, b) => a.at - b.at)
      try { raw.screenshot = 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 50, encoding: 'base64' })) } catch { /* optional */ }
    }
  } finally {
    raw.browserMs = Date.now() - t0
    // keep the browser warm for the next check (new launches are rate-limited); close only our tab
    await Promise.all((await browser.pages().catch(() => [])).map(pg => pg.close().catch(() => {})))
    browser.disconnect()
  }
  return raw
}
