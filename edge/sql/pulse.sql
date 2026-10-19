-- Pulse contract v1.1 — Leakwatch. Read-only views; no ad data exists on the server.
-- Test runs (X-Leakwatch-Test with the cron secret) never show up here.
CREATE SCHEMA IF NOT EXISTS pulse;
DROP VIEW IF EXISTS pulse.users, pulse.events, pulse.presence, pulse.labels, pulse.kpis, pulse.funnel,
  pulse.revenue, pulse.credits, pulse.daily, pulse.real_visitors CASCADE;

CREATE OR REPLACE FUNCTION pulse.mask_email(e TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN e IS NULL THEN NULL ELSE left(split_part(e, '@', 1), 1) || '***@' || split_part(e, '@', 2) END $$;

CREATE OR REPLACE VIEW pulse.real_visitors AS
SELECT v.*, a.email, a.plan AS account_plan, a.paid_at
FROM visitors v LEFT JOIN accounts a ON a.id = v.account_id
WHERE NOT v.is_test AND NOT COALESCE(a.is_test, false);

CREATE OR REPLACE VIEW pulse.users AS
SELECT v.id, CASE WHEN v.email IS NOT NULL THEN pulse.mask_email(v.email) ELSE 'Visitor · ' || left(v.id, 6) END AS name,
       COALESCE(v.account_plan, 'free') AS plan, v.region, v.device, v.created_at, v.last_seen,
       v.account_id IS NOT NULL AS signed_in, pulse.mask_email(v.email) AS email, v.ref
FROM pulse.real_visitors v;

CREATE OR REPLACE VIEW pulse.events AS
SELECT e.user_id, e.name, e.ms, e.ok, e.created_at, e.props
FROM events e WHERE e.user_id IN (SELECT id FROM pulse.real_visitors);

CREATE OR REPLACE VIEW pulse.presence AS
SELECT p.user_id, p.view, p.subject, p.seen_at
FROM presence p WHERE p.user_id IN (SELECT id FROM pulse.real_visitors);

CREATE OR REPLACE VIEW pulse.labels AS
SELECT * FROM (VALUES
  ('event', 'visit', 'opened Leakwatch'),
  ('event', 'demo_opened', 'opened the live demo'),
  ('event', 'page_checked', 'checked a page on a phone'),
  ('event', 'page_issue_found', 'found a page problem'),
  ('event', 'report_imported', 'imported an Ads Manager export'),
  ('event', 'import_failed', 'had an export it couldn''t read'),
  ('event', 'leak_acted', 'acted on a leak'),
  ('event', 'explained', 'got a plain explanation'),
  ('event', 'watch_added', 'started watching a page'),
  ('event', 'watch_alert', 'was alerted about a page'),
  ('event', 'waitlist_joined', 'joined the Meta connect list'),
  ('event', 'signin_code_sent', 'asked for a sign-in code'),
  ('event', 'signed_in', 'signed in'),
  ('event', 'checkout_started', 'opened Pro checkout'),
  ('event', 'pro_started', 'started Pro'),
  ('event', 'pro_ended', 'ended Pro'),
  ('event', 'limit_hit', 'hit the free limit'),
  ('event', 'error', 'hit an error'),
  ('step', 'page_checked', 'Opening a page on a phone'),
  ('step', 'explained', 'Writing an explanation'),
  ('view', 'landing', 'reading the home page'),
  ('view', 'check', 'checking a page'),
  ('view', 'import', 'importing an export'),
  ('view', 'app', 'looking at their leaks'),
  ('view', 'demo', 'in the demo'),
  ('view', 'pricing', 'looking at pricing')
) AS t(kind, key, label);

CREATE OR REPLACE VIEW pulse.kpis AS
SELECT * FROM (
  SELECT 1 AS sort, 'Pages checked' AS label,
         (SELECT COUNT(*) FROM checks c WHERE c.visitor_id IN (SELECT id FROM pulse.real_visitors) OR c.source = 'watch')::numeric AS value,
         (SELECT COUNT(*) FROM checks WHERE created_at > now() - interval '24 hours') || ' today' AS hint
  UNION ALL
  SELECT 2, 'Page problems found', (SELECT COUNT(*) FROM checks WHERE state = 'issue')::numeric,
         round(100.0 * (SELECT COUNT(*) FROM checks WHERE state = 'issue') / GREATEST(1, (SELECT COUNT(*) FROM checks))) || '% of checks'
  UNION ALL
  SELECT 3, 'Reports imported', (SELECT COUNT(*) FROM pulse.events WHERE name = 'report_imported')::numeric,
         (SELECT COUNT(*) FROM pulse.events WHERE name = 'import_failed') || ' failed to read'
  UNION ALL
  SELECT 4, 'Pages watched', (SELECT COUNT(*) FROM watches)::numeric, 'by Pro accounts, daily'
) k;

CREATE OR REPLACE VIEW pulse.funnel AS
SELECT * FROM (
  SELECT 1 AS step, 'Opened Leakwatch' AS label, (SELECT COUNT(*) FROM pulse.real_visitors)::int AS users
  UNION ALL SELECT 2, 'Checked a page or opened the demo', (SELECT COUNT(DISTINCT user_id) FROM pulse.events WHERE name IN ('page_checked', 'demo_opened'))::int
  UNION ALL SELECT 3, 'Signed in', (SELECT COUNT(DISTINCT account_id) FROM pulse.real_visitors WHERE account_id IS NOT NULL)::int
  UNION ALL SELECT 4, 'Imported their account', (SELECT COUNT(DISTINCT user_id) FROM pulse.events WHERE name = 'report_imported')::int
  UNION ALL SELECT 5, 'Opened checkout', (SELECT COUNT(DISTINCT user_id) FROM pulse.events WHERE name = 'checkout_started')::int
  UNION ALL SELECT 6, 'Pays for Pro', (SELECT COUNT(*) FROM accounts WHERE plan = 'pro' AND NOT is_test)::int
) f;

CREATE OR REPLACE VIEW pulse.revenue AS
SELECT COUNT(*)::int AS paying, (COUNT(*) * 19)::numeric AS revenue_usd, 'USD'::text AS currency,
       COUNT(*) FILTER (WHERE paid_at > now() - interval '7 days')::int AS paying_7d
FROM accounts WHERE plan = 'pro' AND NOT is_test;

CREATE OR REPLACE VIEW pulse.credits AS
SELECT provider, label, remaining, unit, budget, updated_at FROM credits;

CREATE OR REPLACE VIEW pulse.daily AS
WITH days AS (SELECT d::date AS day FROM generate_series(current_date - 29, current_date, interval '1 day') d)
SELECT day, 'active' AS metric, 'Active people' AS label,
       (SELECT COUNT(DISTINCT user_id) FROM pulse.events e WHERE e.created_at::date = day)::int AS value FROM days
UNION ALL
SELECT day, 'new_users', 'New people', (SELECT COUNT(*) FROM pulse.real_visitors v WHERE v.created_at::date = day)::int FROM days
UNION ALL
SELECT day, 'series_a', 'Pages checked', (SELECT COUNT(*) FROM checks c WHERE c.created_at::date = day)::int FROM days
UNION ALL
SELECT day, 'series_b', 'Reports imported', (SELECT COUNT(*) FROM pulse.events e WHERE e.name = 'report_imported' AND e.created_at::date = day)::int FROM days;
