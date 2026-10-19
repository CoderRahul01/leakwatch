/** Small helpers shared by every route. */
export const KEY_RE = /^[a-f0-9]{64}$/

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } })

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code }
}

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export const randomHex = (bytes = 32) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('')

export async function body(req) {
  try { return await req.json() } catch { return {} }
}

/** Which browser is calling: sha256 of the random key it keeps (`X-Leakwatch-Key`). */
export async function visitorOf(req) {
  const key = req.headers.get('X-Leakwatch-Key') || ''
  if (!KEY_RE.test(key)) throw new HttpError(401, 'Reload the page and try again.', 'no_visitor')
  return sha256(key)
}

/** Test runs carry the cron secret, so they stay out of Pulse and can read codes back. */
export const isTest = (req, env) => !!env.CRON_SECRET && req.headers.get('X-Leakwatch-Test') === env.CRON_SECRET

export const ipOf = req => req.headers.get('CF-Connecting-IP') || ''

/** Normalise what someone typed into a URL we can open: add https, drop fragments and spaces. */
export function cleanUrl(input) {
  let s = String(input || '').trim()
  if (!s) throw new HttpError(400, 'Paste the address of the page your ad opens.', 'bad_url')
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  let u
  try { u = new URL(s) } catch { throw new HttpError(400, 'That doesn’t look like a web address.', 'bad_url') }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new HttpError(400, 'That doesn’t look like a web address.', 'bad_url')
  // never point the check browser at private networks
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname) || u.hostname.endsWith('.internal') || u.hostname.endsWith('.local')) {
    throw new HttpError(400, 'We can only check public web pages.', 'bad_url')
  }
  u.hash = ''
  return u.toString()
}
