/**
 * Sign-in with a 6-digit email code. No passwords. The browser keeps a long-lived session token
 * (only its hash is stored) and sends it as `Authorization: Bearer <token>`.
 */
import { q, one, logEvent } from './db.js'
import { HttpError, sha256, randomHex, body, visitorOf, isTest, ipOf } from './util.js'
import { sendMail, mailReady } from './email.js'

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i
const normal = e => String(e || '').trim().toLowerCase()
const code6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')

/** Pro is active while the subscription is paid, plus 3 days of grace for a late renewal. */
export const isPro = a => !!a && a.plan === 'pro' && (!a.pro_until || new Date(a.pro_until) > new Date(Date.now() - 3 * 86400_000))

export async function accountOf(env, req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([a-f0-9]{64})$/)
  if (!m) return null
  const row = await one(env, 'UPDATE sessions SET last_used = now() WHERE token_hash = $1 RETURNING account_id', [await sha256(m[1])])
  if (!row) return null
  return one(env, 'UPDATE accounts SET last_seen = now() WHERE id = $1 RETURNING id, email, plan, pro_until, paid_at', [row.account_id])
}

export async function requireAccount(env, req) {
  const a = await accountOf(env, req)
  if (!a) throw new HttpError(401, 'Sign in first.', 'signed_out')
  return a
}

export const publicAccount = a => a && { email: a.email, plan: isPro(a) ? 'pro' : 'free', proUntil: a.pro_until }

/** A session for an account, tied to this browser. */
export async function newSession(env, accountId, visitorId) {
  const token = randomHex(32)
  await q(env, 'INSERT INTO sessions (token_hash, account_id, visitor_id) VALUES ($1, $2, $3)', [await sha256(token), accountId, visitorId])
  if (visitorId) await q(env, 'UPDATE visitors SET account_id = $2 WHERE id = $1', [visitorId, accountId])
  return token
}

export async function start(env, req) {
  const visitor = await visitorOf(req)
  const email = normal((await body(req)).email)
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'That email doesn’t look right.', 'bad_email')
  const test = isTest(req, env)
  if (!mailReady(env) && !test) throw new HttpError(503, 'Email sign-in opens very soon. You can still check pages and import your account.', 'mail_off')
  const ip = ipOf(req)
  const recent = await one(env, `SELECT
      (SELECT COUNT(*) FROM auth_codes WHERE email = $1 AND created_at > now() - interval '1 hour')::int AS per_email,
      (SELECT COUNT(*) FROM auth_codes WHERE ip = $2 AND created_at > now() - interval '1 hour')::int AS per_ip`, [email, ip])
  if (recent.per_email >= 5 || recent.per_ip >= 20) throw new HttpError(429, 'Too many codes. Try again in an hour.', 'too_many')
  const code = code6()
  await q(env, `INSERT INTO auth_codes (email, code_hash, ip, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')`, [email, await sha256(`${email}:${code}`), ip])
  if (!test) {
    const sent = await sendMail(env, {
      to: email,
      subject: `${code} is your Leakwatch code`,
      text: `Your Leakwatch sign-in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.\n\n— Leakwatch, find where your ad money leaks`,
      html: `<div style="font-family:Inter,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0b0f14">
        <p style="font-size:15px">Your Leakwatch sign-in code</p>
        <p style="font-size:34px;letter-spacing:6px;font-family:ui-monospace,Menlo,monospace;margin:8px 0 16px">${code}</p>
        <p style="font-size:13px;color:#5b6573">It works for 10 minutes. If you didn't ask for it, ignore this email.</p></div>`
    })
    if (!sent) throw new HttpError(503, 'Couldn’t send the email. Try again in a minute.', 'mail_failed')
  }
  await logEvent(env, visitor, 'signin_code_sent')
  return test ? { ok: true, code } : { ok: true }
}

export async function verify(env, req) {
  const visitor = await visitorOf(req)
  const b = await body(req)
  const email = normal(b.email), code = String(b.code || '').replace(/\D/g, '')
  if (!EMAIL_RE.test(email) || code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code.', 'bad_code')
  const rows = await q(env, `SELECT id, code_hash, attempts FROM auth_codes
    WHERE email = $1 AND NOT used AND expires_at > now() ORDER BY created_at DESC LIMIT 5`, [email])
  if (!rows.length) throw new HttpError(400, 'That code expired. We can send a new one.', 'expired')
  if (rows.reduce((n, r) => n + r.attempts, 0) >= 5) throw new HttpError(429, 'Too many tries. Ask for a new code.', 'too_many')
  const hash = await sha256(`${email}:${code}`)
  if (!rows.some(r => r.code_hash === hash)) {
    await q(env, 'UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [rows[0].id])
    const left = 5 - rows.reduce((n, r) => n + r.attempts, 0) - 1
    throw new HttpError(400, `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`, 'wrong_code')
  }
  await q(env, 'UPDATE auth_codes SET used = true WHERE email = $1 AND NOT used', [email])
  const account = await one(env, `INSERT INTO accounts (id, email, is_test) VALUES ($1, $2, $3)
    ON CONFLICT (email) DO UPDATE SET last_seen = now(), is_test = accounts.is_test OR $3
    RETURNING id, email, plan, pro_until, (xmax = 0) AS created`, [crypto.randomUUID(), email, isTest(req, env)])
  const token = await newSession(env, account.id, visitor)
  await logEvent(env, visitor, 'signed_in', { new: account.created })
  return { token, account: publicAccount(account) }
}

export async function signout(env, req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([a-f0-9]{64})$/)
  if (m) await q(env, 'DELETE FROM sessions WHERE token_hash = $1', [await sha256(m[1])])
  return { ok: true }
}

/** Deletes the account and everything tied to it (sessions, watches); checks are kept without the link. */
export async function remove(env, req) {
  const a = await requireAccount(env, req)
  await q(env, 'DELETE FROM accounts WHERE id = $1', [a.id])
  return { ok: true }
}
