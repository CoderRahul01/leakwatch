/**
 * Leakwatch API — a Cloudflare Worker. Page checks in a real phone browser (Browser Rendering),
 * email-code accounts, Pro billing through Dodo, plain explanations from Gemma, the daily page watch
 * with email alerts, and events for Pulse. Ad data never comes here: reports are built in the browser.
 */
import { json, HttpError, body, visitorOf, isTest, ipOf, cleanUrl } from './util.js'
import { q, one, touchVisitor, logEvent } from './db.js'
import * as auth from './auth.js'
import * as billing from './billing.js'
import { mailReady, sendMail } from './email.js'
import { observe, classify } from './probe.js'
import { explain } from './explain.js'

// Fair use. Browser time is our scarcest credit: a daily budget with a 10% reserve only Pro can use.
const LIMITS = { free: { checks: 5, explains: 10, watches: 0 }, pro: { checks: 150, explains: 300, watches: 25 } }
const IP_CHECKS_PER_DAY = 15
const browserBudget = env => Number(env.BROWSER_DAILY_SECONDS || 540)

const EVENT_NAMES = new Set(['visit', 'demo_opened', 'report_imported', 'import_failed', 'leak_acted', 'heartbeat', 'limit_hit', 'error', 'upgrade_viewed'])

function cors(req, env) {
  const origin = req.headers.get('Origin') || ''
  const allowed = [env.PUBLIC_URL, ...(env.EXTRA_ORIGINS || '').split(',')].filter(Boolean)
  const ok = allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)
  return ok ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Leakwatch-Key, X-Leakwatch-Test',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  } : {}
}

async function usedToday(env, kind, { visitor, account }) {
  if (kind === 'checks') {
    const r = await one(env, `SELECT COUNT(*)::int AS n FROM checks WHERE created_at > now() - interval '1 day'
      AND source <> 'watch' AND (visitor_id = $1 OR ($2::uuid IS NOT NULL AND account_id = $2))`, [visitor, account?.id || null])
    return r.n
  }
  const r = await one(env, `SELECT COUNT(*)::int AS n FROM events WHERE name = 'explained' AND user_id = $1 AND created_at > now() - interval '1 day'`, [visitor])
  return r.n
}

async function browserSecondsToday(env) {
  const r = await one(env, `SELECT COALESCE(SUM(units), 0)::float AS s FROM credit_ledger WHERE kind = 'browser_seconds' AND created_at > date_trunc('day', now())`)
  return r.s
}

async function me(env, req) {
  const visitor = await visitorOf(req)
  let account = await auth.accountOf(env, req)
  let token = null
  // paid from this browser before signing in: the webhook linked it; hand this browser a session
  if (!account) {
    const v = await one(env, 'SELECT account_id FROM visitors WHERE id = $1', [visitor])
    if (v?.account_id) {
      token = await auth.newSession(env, v.account_id, visitor)
      account = await one(env, 'SELECT id, email, plan, pro_until, paid_at FROM accounts WHERE id = $1', [v.account_id])
    }
  }
  const plan = auth.isPro(account) ? 'pro' : 'free'
  const used = await usedToday(env, 'checks', { visitor, account })
  return {
    account: auth.publicAccount(account),
    token,
    checksLeft: Math.max(0, LIMITS[plan].checks - used),
    limits: LIMITS[plan],
    mail: mailReady(env),
    billing: billing.enabled(env)
  }
}

async function check(env, req, ctx) {
  const visitor = await visitorOf(req)
  const b = await body(req)
  const url = cleanUrl(b.url)
  const pixelId = /^\d{6,20}$/.test(String(b.pixelId || '').trim()) ? String(b.pixelId).trim() : null
  const source = b.source === 'report' ? 'report' : 'manual'
  const account = await auth.accountOf(env, req)
  const plan = auth.isPro(account) ? 'pro' : 'free'
  const test = isTest(req, env)
  if (!test) {
    const used = await usedToday(env, 'checks', { visitor, account })
    if (used >= LIMITS[plan].checks) {
      await logEvent(env, visitor, 'limit_hit', { what: 'checks', plan })
      throw new HttpError(429, plan === 'pro' ? 'You’ve checked 150 pages today. More tomorrow.' : `That’s your ${LIMITS.free.checks} free checks for today. Pro checks up to 150 pages a day and watches them for you.`, 'limit')
    }
    if (plan === 'free') {
      const ip = await one(env, `SELECT COUNT(*)::int AS n FROM checks WHERE ip = $1 AND created_at > now() - interval '1 day'`, [ipOf(req)])
      if (ip.n >= IP_CHECKS_PER_DAY) throw new HttpError(429, 'Lots of checks from this network today. Try again tomorrow, or go Pro.', 'limit')
    }
    const spent = await browserSecondsToday(env)
    const cap = browserBudget(env) * (plan === 'pro' ? 1 : 0.9)
    if (spent >= cap) {
      await logEvent(env, visitor, 'limit_hit', { what: 'browser', plan })
      throw new HttpError(503, 'Our phone checker is fully booked today. Try again tomorrow' + (plan === 'pro' ? '.' : ', or go Pro for priority.'), 'busy')
    }
  }
  const raw = await observe(env, url)
  ctx.waitUntil(q(env, `INSERT INTO credit_ledger (user_id, kind, units, note) VALUES ($1, 'browser_seconds', $2, $3)`, [visitor, (raw.browserMs || 0) / 1000, source]).catch(() => {}))
  if (raw.error === 'busy' || raw.error === 'launch') throw new HttpError(503, 'Our phone checker is busy. Try again in a minute.', 'busy')
  const { probe, findings } = classify(raw, { url, pixelId })
  await q(env, `INSERT INTO checks (visitor_id, account_id, url, state, probe, source, ip, ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [visitor, account?.id || null, probe.url, probe.state, JSON.stringify(probe), source, ipOf(req), raw.browserMs || null])
  await logEvent(env, visitor, 'page_checked', { state: probe.state, source }, raw.browserMs || null, !raw.error)
  if (probe.state === 'issue') await logEvent(env, visitor, 'page_issue_found', { ids: findings.map(f => f.id) })
  const used = test ? 0 : await usedToday(env, 'checks', { visitor, account })
  return { probe, findings, screenshot: raw.screenshot, checksLeft: Math.max(0, LIMITS[plan].checks - used) }
}

async function explainRoute(env, req) {
  const visitor = await visitorOf(req)
  const account = await auth.accountOf(env, req)
  const plan = auth.isPro(account) ? 'pro' : 'free'
  if (!isTest(req, env) && await usedToday(env, 'explains', { visitor }) >= LIMITS[plan].explains) return { text: null, engine: 'rules', limited: true }
  const leak = (await body(req)).leak || {}
  const clip = (s, n) => String(s || '').slice(0, n)
  const safe = {
    title: clip(leak.title, 200), summary: clip(leak.summary, 600), since: clip(leak.since, 20),
    facts: (Array.isArray(leak.facts) ? leak.facts : []).slice(0, 8).map(f => ({ label: clip(f?.label, 80), value: clip(f?.value, 80) })),
    fixSteps: (Array.isArray(leak.fixSteps) ? leak.fixSteps : []).slice(0, 5).map(s => clip(s, 200))
  }
  if (!safe.title || !safe.summary) throw new HttpError(400, 'Nothing to explain.', 'bad_leak')
  const t0 = Date.now()
  const out = await explain(env, safe)
  await logEvent(env, visitor, 'explained', { engine: out.engine }, Date.now() - t0, !!out.text)
  return out
}

async function watches(env, req, action) {
  const a = await auth.requireAccount(env, req)
  if (action === 'list') return { watches: await q(env, 'SELECT url, pixel_id AS "pixelId", last_state AS "lastState", last_checked AS "lastChecked" FROM watches WHERE account_id = $1 ORDER BY created_at', [a.id]) }
  if (!auth.isPro(a)) throw new HttpError(402, 'Daily page watch is part of Pro.', 'pro_only')
  const b = await body(req)
  const url = cleanUrl(b.url).replace(/\?.*$/, '')
  if (action === 'remove') {
    await q(env, 'DELETE FROM watches WHERE account_id = $1 AND url = $2', [a.id, url])
    return { ok: true }
  }
  const n = await one(env, 'SELECT COUNT(*)::int AS n FROM watches WHERE account_id = $1', [a.id])
  if (n.n >= LIMITS.pro.watches) throw new HttpError(400, `You’re watching ${LIMITS.pro.watches} pages, the most Pro allows. Remove one first.`, 'limit')
  const pixelId = /^\d{6,20}$/.test(String(b.pixelId || '')) ? String(b.pixelId) : null
  await q(env, `INSERT INTO watches (account_id, url, pixel_id, last_state) VALUES ($1, $2, $3, $4)
    ON CONFLICT (account_id, url) DO UPDATE SET pixel_id = COALESCE($3, watches.pixel_id)`, [a.id, url, pixelId, b.state || null])
  await logEvent(env, await visitorOf(req), 'watch_added')
  return { ok: true }
}

async function waitlist(env, req) {
  const visitor = await visitorOf(req)
  const email = String((await body(req)).email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new HttpError(400, 'That email doesn’t look right.', 'bad_email')
  await q(env, 'INSERT INTO waitlist (email) VALUES ($1) ON CONFLICT DO NOTHING', [email])
  await logEvent(env, visitor, 'waitlist_joined')
  return { ok: true }
}

async function events(env, req) {
  const visitor = await visitorOf(req)
  const b = await body(req)
  const name = String(b.name || '')
  if (!EVENT_NAMES.has(name)) return { ok: false }
  if (name === 'visit') {
    await touchVisitor(env, visitor, {
      test: isTest(req, env),
      device: /Mobi|Android|iPhone/i.test(req.headers.get('User-Agent') || '') ? 'phone' : 'desktop',
      region: req.cf?.country || null,
      ref: b.props?.ref ? String(b.props.ref).slice(0, 40) : null
    })
  } else {
    await q(env, 'UPDATE visitors SET last_seen = now() WHERE id = $1', [visitor])
  }
  const props = b.props && typeof b.props === 'object' ? Object.fromEntries(Object.entries(b.props).slice(0, 10).map(([k, v]) => [String(k).slice(0, 30), typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 80)])) : {}
  await logEvent(env, visitor, name, props)
  return { ok: true }
}

async function route(req, env, ctx) {
  const { pathname } = new URL(req.url)
  const p = pathname.replace(/^\/api/, '') || '/'
  const POST = req.method === 'POST'
  if (p === '/health') return { ok: true, db: !!env.DATABASE_URL, mail: mailReady(env), billing: billing.enabled(env) }
  if (p === '/me') return me(env, req)
  if (p === '/check' && POST) return check(env, req, ctx)
  if (p === '/explain' && POST) return explainRoute(env, req)
  if (p === '/events' && POST) return events(env, req)
  if (p === '/waitlist' && POST) return waitlist(env, req)
  if (p === '/auth/code' && POST) return auth.start(env, req)
  if (p === '/auth/verify' && POST) return auth.verify(env, req)
  if (p === '/auth/signout' && POST) return auth.signout(env, req)
  if (p === '/account/delete' && POST) return auth.remove(env, req)
  if (p === '/watch' && !POST) return watches(env, req, 'list')
  if (p === '/watch' && POST) return watches(env, req, 'add')
  if (p === '/watch/remove' && POST) return watches(env, req, 'remove')
  if (p === '/billing/checkout' && POST) return billing.checkout(env, req)
  throw new HttpError(404, 'Not found', 'not_found')
}

async function webhook(req, env) {
  const raw = await req.text()
  let evt
  try { evt = await billing.verify(env, raw, req.headers) } catch (e) { return json({ error: e.message }, 401) }
  const plan = await billing.handle(env, evt)
  return json({ ok: true, plan })
}

/** Daily: open every watched page again; email the owner when one starts leaking (or recovers). */
async function watchRun(env) {
  const due = await q(env, `SELECT w.id, w.url, w.pixel_id, w.last_state, w.last_alert, a.email, a.id AS account_id, a.plan, a.pro_until
    FROM watches w JOIN accounts a ON a.id = w.account_id
    WHERE w.last_checked IS NULL OR w.last_checked < now() - interval '20 hours'
    ORDER BY w.last_checked NULLS FIRST LIMIT 12`)
  for (const w of due) {
    if (!auth.isPro(w)) continue
    const raw = await observe(env, w.url)
    await q(env, `INSERT INTO credit_ledger (user_id, kind, units, note) VALUES ($1, 'browser_seconds', $2, 'watch')`, [w.account_id, (raw.browserMs || 0) / 1000])
    if (raw.error === 'busy' || raw.error === 'launch') break
    const { probe, findings } = classify(raw, { url: w.url, pixelId: w.pixel_id })
    await q(env, `INSERT INTO checks (account_id, url, state, probe, source, ms) VALUES ($1, $2, $3, $4, 'watch', $5)`, [w.account_id, probe.url, probe.state, JSON.stringify(probe), raw.browserMs || null])
    await q(env, 'UPDATE watches SET last_state = $2, last_checked = now() WHERE id = $1', [w.id, probe.state])
    const broke = probe.state === 'issue' && w.last_state !== 'issue'
    const healed = w.last_state === 'issue' && probe.state === 'ok'
    if ((broke || healed) && mailReady(env)) {
      const leaks = findings.filter(f => f.tone === 'leak')
      const subject = broke ? `Leak on ${probe.url.replace(/^https?:\/\//, '').slice(0, 60)}` : `Fixed: ${probe.url.replace(/^https?:\/\//, '').slice(0, 60)}`
      const lines = broke ? leaks.map(f => `• ${f.title}. ${f.detail}`) : ['The page is healthy again: it opens, keeps your tags and the pixel fires.']
      const link = `${env.PUBLIC_URL}/check?url=${encodeURIComponent(probe.url)}`
      await sendMail(env, {
        to: w.email, subject,
        text: `${broke ? 'Our daily phone check found a problem on a page your ads open:' : 'Good news from your daily page check:'}\n\n${probe.url}\n\n${lines.join('\n')}\n\nSee it: ${link}\n\n— Leakwatch`,
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b0f14">
          <p>${broke ? 'Our daily phone check found a problem on a page your ads open:' : 'Good news from your daily page check:'}</p>
          <p><b>${probe.url}</b></p><ul>${lines.map(l => `<li>${l.replace(/^• /, '')}</li>`).join('')}</ul>
          <p><a href="${link}">Open the check</a></p><p style="color:#5b6573;font-size:13px">Leakwatch · you get this because you watch this page on Pro.</p></div>`
      })
      await q(env, 'UPDATE watches SET last_alert = now() WHERE id = $1', [w.id])
      await logEvent(env, w.account_id, 'watch_alert', { broke })
    }
  }
  // credits card in Pulse: browser seconds left today
  const spent = await browserSecondsToday(env)
  await q(env, `INSERT INTO credits (provider, label, remaining, unit, budget, updated_at) VALUES ('browser', 'Phone checker (today)', $1, 'minutes_left', $2, now())
    ON CONFLICT (provider) DO UPDATE SET remaining = $1, budget = $2, updated_at = now()`, [Math.max(0, (browserBudget(env) - spent) / 60), browserBudget(env) / 60])
}

export default {
  async fetch(req, env, ctx) {
    const headers = cors(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    const { pathname } = new URL(req.url)
    if (pathname === '/api/billing/webhook' && req.method === 'POST') return webhook(req, env)
    if (!pathname.startsWith('/api/')) return json({ name: 'leakwatch-edge', ok: true }, 200, headers)
    try {
      return json(await route(req, env, ctx), 200, headers)
    } catch (e) {
      if (e instanceof HttpError) return json({ code: e.code || `http_${e.status}`, message: e.message }, e.status, headers)
      console.log('error', pathname, e.stack || e.message)
      return json({ code: 'server', message: 'Something went wrong on our side. Try again.' }, 500, headers)
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(watchRun(env).catch(e => console.log('watch run failed', e.message)))
  }
}
