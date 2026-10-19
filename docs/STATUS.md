# Leakwatch: build status

Updated **Oct 19, 2026, 23:30 IST**. Branch `wip/paid-launch`. Read this first, then `CLAUDE.md` for the rules.

## Goal right now
Launch Leakwatch publicly as a paid product: anyone can use it today (no Meta app review needed),
Pro at **$19/month** through Dodo, on **leakwatch.tech** (free first year via hacktoberfest.com/my/promos).

## The product, honestly (decided Oct 19)
Meta's direct connection needs Meta's app review, so v1 works for everyone without it:
1. **Free page check** (`/check`, no sign-up): paste the page an ad opens → a real phone browser
   (Cloudflare Browser Rendering) opens it with test utm/fbclid → status, redirects, time until main
   content shows (LCP on 4G), tags kept, Meta pixel IDs + events, consent banner, screenshot.
2. **Account report** (`/import`): upload an Ads Manager export (CSV, ad level, Breakdown → By time → Day).
   Parsed **in the browser** (`shared/src/import.ts`), landing pages checked via the API, all detectors
   run, leaks priced. Ad data never leaves the device. Fixes are done in Ads Manager and **verified on
   the next import** (`shared/src/report.ts` `ReportEngine`); page fixes are verified by a recheck.
3. **Direct Meta connect**: waitlist only (`POST /api/waitlist`) until Meta approves.
4. **Pro $19/mo**: daily watch of up to 25 pages with email alerts, 150 checks/day (free: 5), forecast,
   Ask, explanations. Guards need the direct connection → shown as "coming with Meta connect".

## Live
| What | Where |
|---|---|
| API worker `leakwatch-edge` | https://leakwatch-edge.rahulpandey-creates.workers.dev (`/api/health`) |
| Database | Neon project `leakwatch` (`curly-heart-07165495`), schema + Pulse views applied (`edge/sql`, `npm run migrate`) |
| Dodo product (live) | **Leakwatch Pro** `pdt_0Nq5oqvd3pMBsssodefKT`, $19/month · webhook → `/api/billing/webhook` |
| Worker secrets set | DATABASE_URL, CRON_SECRET, OPENROUTER_API_KEY, DODO_PRODUCT_ID, DODO_WEBHOOK_SECRET (local copy in `edge/.dev.vars`, git-ignored) |
| Web | **not deployed yet** (Vercel project `leakwatch` to create, Root `web`) |

Verified on production (Oct 19): page checks on 8 real stores (healthy, 404, slow, no pixel,
tag manager → "couldn't confirm", 429 → "couldn't check"); warm-browser reuse avoids the launch limit;
checkout link carries product + visitor; forged webhook → 401; signed `subscription.active` → Pro;
`/me` hands the paying browser a session; `subscription.expired` → free; account delete works.

## Done this session
- `edge/` worker: `src/index.js` (routes, limits, browser-time budget with 10% Pro reserve, hourly cron
  watch run + alert emails, Pulse credits), `auth.js` (email code), `billing.js` (Dodo), `probe.js`
  (phone probe + pure `classify()`), `explain.js` (Gemma on Workers AI → OpenRouter, digit check), `email.js`.
  Tests: `cd edge && npm test` (10 pass).
- `shared/`: `import.ts` (CSV → Dataset, tolerant headers, clear errors, sample export), `report.ts`
  (ReportEngine), detector fixes (T4 needs two un-mergeable copies; T2 skipped when the ad set's pixel
  is unknown). `npm test` → 35 pass.
- `web/src/lib`: `api.ts` rewritten for the real API (visitor key + Bearer token, `/api` same-origin),
  `session.ts` (token, plan, reportName), `report-store.ts`, `engine.tsx` (`EngineProvider make={…}`,
  `Engine = DemoEngine | ReportEngine`). `pages/SignIn.tsx` updated.

## Next (in order)
1. **Web typecheck is broken mid-refactor** (`npx tsc --noEmit -p web`). Finish:
   - `pages/Import.tsx` replacing `Connect.tsx` (reuse its CSS: connect-page, cstep, checklist): file
     input + how-to-export steps + options (name, target cost, fallback URL, pixel ID) + "download a
     sample" (`toAdsManagerCsv(createDemoWorld().dataset)`) + Meta waitlist box. On import: parse →
     `checkPage(url, {source:'report'})` for each URL up to `checksLeft` → `new ReportEngine(ds, previousMemory, {fresh:true})`
     → `saveReport` → `/app`.
   - `pages/Check.tsx` (`/check?url=`): input, result with screenshot (`<img>` in PhoneFrame when present),
     findings, `ProbeTimeline`, `LoadBar`; CTAs: watch daily (Pro, `addWatch`), import account.
   - `pages/WelcomePro.tsx` (`/welcome-pro`, Dodo redirect): poll `refreshMe()` until plan = pro.
   - `AppRoot`: account mode needs a stored report (not sign-in) → else `/import`;
     `make={() => new ReportEngine(stored.dataset, stored.memory)}` + `onChange` → `saveReport`.
   - `useLeakAction` confirm in report mode: "Do this in Ads Manager, then tap I did it; we confirm on
     your next import" (no "changes your Meta account now"). Recheck action → `checkPage` → `engine.applyProbe`.
   - `Shell`, `Settings` (plan, sign in/out, delete, re-import, watched pages; drop Meta/Claude/morning
     email stubs), `Pricing` (rows must match the real limits above), `Landing` CTAs (Check a page free /
     Try the demo / Import your account), `SiteChrome`, `LeakDetail` (`explainLeak` + `explanationFor`),
     `main.tsx` routes, `refreshMe()` + `track('visit')` on load.
2. Vercel: project `leakwatch`, Root `web`, `web/vercel.json` rewrite `/api/(.*)` →
   `https://leakwatch-edge.rahulpandey-creates.workers.dev/api/$1` before the SPA rewrite.
3. leakwatch.tech: claim at hacktoberfest.com/my/promos (needs Rahul's login), add to Vercel, set
   `PUBLIC_URL` var on the worker, update Dodo redirect.
4. Email: `MAILER_ON=1` once almanac-edge is deployed with the `Mailer` entrypoint (code committed in
   the almanac repo, `edge/src/email.js`; deploy was blocked by auto mode — needs Rahul's OK), **or** set
   `RESEND_API_KEY` + `EMAIL_FROM` secrets on leakwatch-edge. Until then sign-in shows "opens soon";
   paying still works (Pro attaches to the paying browser via `/me`).
5. Cloudflare **Workers Paid ($5/mo)** for more browser time (free = 10 min/day ≈ 40 checks), then raise
   `BROWSER_DAILY_SECONDS`.
6. Pulse: create `pulse_ro` with SQL (see `_shared/PLAYBOOK.md`), add to `PULSE_PROJECTS`.
7. E2E on production (Playwright): check → import sample → act → re-import → fixed; checkout opens.
8. Post + video + X/LinkedIn (in Rahul's voice, only after a yes).

## Known gaps / decisions
- Dark theme only (brand). Fonts self-hosted via @fontsource.
- Demo mode still ticks a simulated account; it stays as the "see it work in 30 seconds" path.
- Free limits: 5 checks/day per browser (15 per IP), 10 explanations/day. Pro: 150 checks, 300 explanations, 25 watched pages.
