/**
 * Outgoing mail (sign-in codes, page alerts). Two routes, whichever is configured:
 * 1. `MAILER` service binding to almanac-edge's Mailer entrypoint (same verified Resend domain), or
 * 2. a `RESEND_API_KEY` secret + `EMAIL_FROM` on a domain verified in Resend.
 */
export const mailReady = env => !!(env.MAILER_ON === '1' && env.MAILER) || !!(env.RESEND_API_KEY && env.EMAIL_FROM)

export async function sendMail(env, { to, subject, text, html }) {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Leakwatch <${env.EMAIL_FROM}>`, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000)
    }).catch(() => null)
    if (r?.ok) return true
    console.log('resend failed', r?.status, r ? (await r.text()).slice(0, 200) : '')
  }
  if (env.MAILER_ON === '1' && env.MAILER) {
    try { return await env.MAILER.send({ app: 'Leakwatch', to, subject, text, html }) } catch (e) { console.log('mailer failed', e.message) }
  }
  return false
}
