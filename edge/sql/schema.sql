-- Leakwatch tables. Applied by `npm run migrate` (idempotent).
-- Ad data never comes here: reports are built in the browser from the person's own export.
-- We store accounts, page checks (URL + what a phone browser saw), the pages Pro watches, and events.

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',          -- free | pro
  pro_until TIMESTAMPTZ,
  subscription_id TEXT,
  paid_at TIMESTAMPTZ,
  is_test BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  ip TEXT,
  attempts INT NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_codes_email ON auth_codes (email, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  visitor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Anonymous visitors (sha256 of a random key the browser keeps), so free checks have a fair limit
-- and Pulse can count people before they sign in.
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ref TEXT,
  device TEXT,
  region TEXT,
  is_test BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checks (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  state TEXT NOT NULL,                        -- ok | issue | blocked | unconfirmed
  probe JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',      -- manual | report | watch
  ip TEXT,
  ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checks_visitor ON checks (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checks_account ON checks (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checks_ip ON checks (ip, created_at DESC);

-- Pages a Pro account asked us to open every day.
CREATE TABLE IF NOT EXISTS watches (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  pixel_id TEXT,
  last_state TEXT,
  last_checked TIMESTAMPTZ,
  last_alert TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, url)
);

-- People who want the direct Meta connection once Meta approves the app.
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  what TEXT NOT NULL DEFAULT 'meta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Standard tracking (Pulse contract). user_id = visitor id (or account id for server jobs).
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}',
  ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_created ON events (created_at DESC);
CREATE INDEX IF NOT EXISTS events_name ON events (name, created_at DESC);

CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY,
  view TEXT NOT NULL,
  subject TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,                         -- browser_seconds | model_calls
  units NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credits (
  provider TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  remaining NUMERIC,
  unit TEXT NOT NULL,
  budget NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
