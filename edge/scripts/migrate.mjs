// Applies sql/schema.sql then the Pulse views (sql/pulse.sql) to Neon, and re-grants the read-only Pulse login.
// Usage: DATABASE_URL=postgres://… npm run migrate   (reads .dev.vars when DATABASE_URL is unset)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
let url = process.env.DATABASE_URL
if (!url) {
  const env = fs.readFileSync(path.join(here, '../.dev.vars'), 'utf8')
  url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '')
}
if (!url) throw new Error('DATABASE_URL missing')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
for (const file of ['schema.sql', 'pulse.sql']) {
  await client.query(fs.readFileSync(path.join(here, '../sql', file), 'utf8'))
  console.log(`✓ ${file}`)
}
await client.query(`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulse_ro') THEN
    GRANT USAGE ON SCHEMA pulse TO pulse_ro;
    GRANT SELECT ON ALL TABLES IN SCHEMA pulse TO pulse_ro;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pulse TO pulse_ro;
  END IF;
END $$;`)
console.log('✓ pulse_ro grants')
await client.end()
