# Leakwatch: build status

Updated Oct 18, 2026. Read this first, then `CLAUDE.md` for the rules.

## Run it
```bash
npm install          # from repo root (npm workspaces: shared, web)
npm test             # 26 unit tests in shared/
npm run dev          # web on http://localhost:5173
npm run build        # web/dist
```
With no `VITE_API_URL` the web app runs in **preview mode**: sign-in codes show on screen, the
sample account stands in for Meta, checkout flips Pro on locally. Every preview shortcut is
labelled on screen. Set `VITE_API_URL` once `edge/` exists.

## Done
| Area | What | Where |
|---|---|---|
| Data model | Types for accounts, ads, insights, probes, leaks, actions, guards | `shared/src/types.ts` |
| Demo account | 8 campaigns, 24 ad sets, 70 ads, 30 days, planted leaks for every detector, phone-probe results | `shared/src/demo-account.ts` |
| Detectors | S1–S4, P1–P3, T1–T4, L1. Pure functions; page/tracking root causes suppress spend flags | `shared/src/detectors.ts` |
| Guards | 3 opt-in rules, pure evaluation | `shared/src/guards.ts` |
| Forecast | Transparent fallback (rolling 3-day cost vs target, ≥7 days only). TabPFN not wired | `shared/src/forecast.ts` |
| Ask | Grounded answers from rows, "not in your data" otherwise | `shared/src/ask.ts` |
| Model text guard | Digit check + rules fallback | `shared/src/explain.ts` |
| Live engine | Ticks demo, actions with stored previous state, Undo, verify, guards, events | `shared/src/sim.ts` |
| Tests | 26 vitest tests | `shared/test/` |
| Landing | Hero with floating leak tags, scroll chain story, loop, live preview, compare, people, connections, pricing, FAQ, footer with partners | `web/src/pages/Landing.tsx` |
| Auth UI | Email + 6-box code, resend timer, expiry, tries, paste | `web/src/pages/SignIn.tsx` |
| Connect UI | Meta permissions, account picker (disabled / view-only cases), first-check checklist | `web/src/pages/Connect.tsx` |
| App | Feed, leak detail drawer, confirm + Undo toast, verified fly-to-saved, pages + page check, guards, forecast, ask, activity, settings (Meta, Claude connector, morning email preview, plan, delete everything), Pro gating, banners (demo, preview, expired token, offline) | `web/src/app/` |
| Design system | Tokens, inset lighting, animated edge, chain, motion, reduced motion | `web/src/styles/` |
| Deploy config | Vercel: Root Directory `web`, SPA rewrite | `web/vercel.json` |

## Not done (in build order)
1. **Deploy web to Vercel**: import repo, Root Directory `web`, no env vars. Not done yet (no token in the build session).
2. **Mobile QA**: 390 px screenshots taken but not reviewed. Check feed, drawer sheet, chain vertical layout, tabs.
3. **`edge/` Cloudflare Worker `leakwatch-edge`** (nothing exists yet). Endpoints the web already calls (`web/src/lib/api.ts`):
   - `POST /auth/code {email}`, `POST /auth/verify {email, code}` → session cookie
   - `POST /meta/oauth/start` → `{redirect}`; callback stores token AES-GCM encrypted; `GET /accounts`
   - `POST /billing/checkout` → `{url}` (Dodo, $19/month) + signed webhook flips plan
   - `/mcp` Claude connector: tools `list_leaks`, `get_leak`, `ask`, `page_check`, `propose_pause` (never changes the account; user confirms in app)
   - Still to design: `/leaks`, `/actions` (pause / budget / undo via Meta API with previous state), `/explain` (Gemma on Workers AI, run `explanationFor` digit check), hourly cron sync → `detectLeaks`, daily verify + guards + morning email
   - `edge/sql/` migrations for Neon (tables listed in `docs/STACK.md`)
   - The web app still drives everything from `DemoEngine`; it needs a data source that reads from the API when `VITE_API_URL` is set.
4. **`jobs/` on Render**: Playwright phone probe producing `Probe` objects (rules in `docs/STACK.md`, REA notes), TabPFN forecast, daily model check.
5. **Sentry, Pulse views, morning email sending.**
6. **`e2e/`**: Playwright tests against production (demo loop: open leak → pause → undo → verified).
7. **Content** for the post (`../content/` in the private workspace).

## Known gaps / decisions
- Dark theme only (brand). Design brief asked for light + dark.
- Fonts: Space Grotesk (display), Inter 300 (body), JetBrains Mono (numbers), self-hosted via @fontsource.
- Demo day stops at 23:38 sim time and holds; no day rollover.
- Leak verification in the demo takes ~20 s (24 h in real accounts).
- Brand logos of partners are text only (no trademark artwork).
