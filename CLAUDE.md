# Leakwatch: build handoff

Read first: `docs/PRODUCT.md` (what), `docs/DESIGN_BRIEF.md` (how it looks), `docs/STACK.md` (how
it's built), `docs/TEARDOWN.md` (why). Deadline: **Mon Oct 19, 12:29 PM IST** (Oct 18 11:59 PM PDT).

## Rules
- Plain language in the UI; no model names. Partners credited in the footer.
- Every number on screen is computed in code. The model only writes words; check its text for
  digits not present in the evidence and fall back to the rules sentence.
- Never change a real ad account without an explicit confirm (or a guard the user switched on), and
  always store the previous state so Undo works.
- Secrets never in git (`.env`, `.dev.vars` are ignored). Use `wrangler secret` and Render env.

## Layout (to create)
```
web/      Vite + React + TS, Vercel project `leakwatch` (Root: web, output dist)
edge/     Cloudflare Worker `leakwatch-edge` (API, cron, Gemma via Workers AI), sql/ migrations
jobs/     Render: probe (Playwright) + forecast (TabPFN) + model check
shared/   detectors.ts, demo-account.ts (simulated live account), types
e2e/      Playwright tests against production
```

## Build order
1. `shared/`: types, demo dataset generator (8 campaigns, 24 ad sets, 70 ads, 30 days, planted leaks
   for S1–S4, P1–P3, T1–T4, L1), detectors with unit tests.
2. `web/`: landing + demo account (simulated ticks client-side) + leak feed/detail/confirm/undo/verified.
   Ship to Vercel as soon as the demo works.
3. `edge/`: email-code auth, Meta OAuth + token encryption, sync, actions with undo, /explain, cron.
4. `jobs/`: probe service + forecast; wire to edge.
5. Guards, Ask, Dodo $19/month, Sentry, Pulse views, morning email.
6. E2E on production, then content (`../content/` in the private workspace).
