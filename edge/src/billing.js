/**
 * Leakwatch Pro: a $19/month Dodo subscription. Checkout is Dodo's static link (no API key on the
 * server); the signed webhook turns Pro on and off. Signing in first is optional: the checkout carries
 * this browser's visitor id, and the webhook links it to the account for the email Dodo collected.
 */
import { q, one, logEvent } from './db.js'
import { HttpError, visitorOf } from './util.js'
import { accountOf, isPro } from './auth.js'

export const enabled = env => !!(env.DODO_PRODUCT_ID && env.DODO_WEBHOOK_SECRET)

export async function checkout(env, req) {
  if (!enabled(env)) throw new HttpError(503, 'Checkout opens very soon.', 'billing_off')
  const visitor = await visitorOf(req)
  const account = await accountOf(env, req)
  if (isPro(account)) throw new HttpError(400, 'You’re already on Pro.', 'already_pro')
  const base = env.DODO_CHECKOUT_BASE || 'https://checkout.dodopayments.com/buy'
  const params = new URLSearchParams({
    quantity: '1',
    redirect_url: `${env.PUBLIC_URL}/welcome-pro`,
    metadata_visitor_id: visitor
  })
  if (account) {
    params.set('metadata_account_id', account.id)
    params.set('email', account.email)
    params.set('disableEmail', 'true')
  }
  await logEvent(env, visitor, 'checkout_started', { signedIn: !!account })
  return { url: `${base}/${env.DODO_PRODUCT_ID}?${params}` }
}

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
const b64decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))

/** Standard Webhooks signature check (what Dodo uses): HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
export async function verify(env, raw, headers) {
  const id = headers.get('webhook-id'), ts = headers.get('webhook-timestamp'), sigs = headers.get('webhook-signature') || ''
  if (!id || !ts || !sigs) throw new Error('missing headers')
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new Error('stale')
  const secret = b64decode(String(env.DODO_WEBHOOK_SECRET).replace(/^whsec_/, ''))
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`)))
  if (!sigs.split(' ').some(s => { const [v, sig] = s.split(','); return v === 'v1' && sig === expected })) throw new Error('bad signature')
  return JSON.parse(raw)
}

const ON = ['subscription.active', 'subscription.renewed', 'subscription.plan_changed']
const OFF = ['subscription.expired', 'subscription.failed', 'subscription.on_hold']

/** Applies one webhook. Returns the new plan, or null when the event isn't about Pro. */
export async function handle(env, evt) {
  const t = evt?.type || '', d = evt?.data || {}
  const meta = d.metadata || {}
  const subscriptionId = d.subscription_id || null
  const email = String(d.customer?.email || '').trim().toLowerCase() || null
  if (d.product_id && env.DODO_PRODUCT_ID && d.product_id !== env.DODO_PRODUCT_ID) return null

  // find the account: metadata first, then the subscription we stored, then the checkout email
  let account = meta.account_id ? await one(env, 'SELECT id FROM accounts WHERE id = $1', [meta.account_id]) : null
  if (!account && subscriptionId) account = await one(env, 'SELECT id FROM accounts WHERE subscription_id = $1', [subscriptionId])
  if (!account && email && ON.includes(t)) {
    account = await one(env, `INSERT INTO accounts (id, email) VALUES ($1, $2)
      ON CONFLICT (email) DO UPDATE SET last_seen = now() RETURNING id`, [crypto.randomUUID(), email])
  }
  if (!account) return null
  if (meta.visitor_id) await q(env, 'UPDATE visitors SET account_id = $2 WHERE id = $1', [meta.visitor_id, account.id])

  const until = d.next_billing_date || null
  if (ON.includes(t)) {
    await q(env, `UPDATE accounts SET plan = 'pro', pro_until = $2, subscription_id = COALESCE($3, subscription_id),
      paid_at = COALESCE(paid_at, now()) WHERE id = $1`, [account.id, until, subscriptionId])
    if (t === 'subscription.active') await logEvent(env, meta.visitor_id || account.id, 'pro_started', { type: t })
    return 'pro'
  }
  if (t === 'subscription.cancelled') {
    // cancelled = no renewal; Pro stays until the paid month ends (pro_until)
    await q(env, 'UPDATE accounts SET pro_until = COALESCE($2, pro_until, now()) WHERE id = $1', [account.id, until])
    await logEvent(env, meta.visitor_id || account.id, 'pro_ended', { type: t })
    return 'pro'
  }
  if (OFF.includes(t)) {
    await q(env, `UPDATE accounts SET plan = 'free' WHERE id = $1`, [account.id])
    await logEvent(env, meta.visitor_id || account.id, 'pro_ended', { type: t })
    return 'free'
  }
  return null
}
