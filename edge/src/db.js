/** Neon Postgres over HTTP. Schema lives in ../sql and is applied by `npm run migrate`. */
import { neon } from '@neondatabase/serverless'

let cached = null
export function db(env) {
  if (!env.DATABASE_URL) return null
  if (!cached || cached.url !== env.DATABASE_URL) cached = { url: env.DATABASE_URL, sql: neon(env.DATABASE_URL) }
  return cached.sql
}

export async function q(env, text, params = []) {
  const sql = db(env)
  if (!sql) throw new Error('no database')
  return sql.query(text, params)
}

export const one = async (env, text, params) => (await q(env, text, params))[0] || null

export async function touchVisitor(env, id, { test = false, device = null, region = null, ref = null } = {}) {
  await q(env, `INSERT INTO visitors (id, is_test, device, region, ref) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET last_seen = now(), is_test = visitors.is_test OR $2,
      device = COALESCE($3, visitors.device), region = COALESCE($4, visitors.region), ref = COALESCE(visitors.ref, $5)`,
  [id, test, device, region, ref])
}

export async function logEvent(env, userId, name, props = {}, ms = null, ok = true) {
  try {
    if (name === 'heartbeat') {
      await q(env, `INSERT INTO presence (user_id, view, subject) VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET view = $2, subject = $3, seen_at = now()`,
      [userId, String(props.view || '').slice(0, 40), props.subject ? String(props.subject).slice(0, 80) : null])
      return
    }
    await q(env, 'INSERT INTO events (user_id, name, props, ms, ok) VALUES ($1, $2, $3, $4, $5)', [userId, name, JSON.stringify(props || {}), ms, ok])
  } catch (e) { console.log('event log failed', e.message) }
}
