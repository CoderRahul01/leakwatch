# Leakwatch: Stack

Same shape as Memoria and Almanac: static frontend on Vercel, main API on a Cloudflare Worker,
slow jobs on Render, one Neon database, Dodo payments, Pulse analytics.

```
 Browser (Vercel)                 Cloudflare Worker `leakwatch-edge`                 Render `leakwatch-jobs` (Node + Python)
┌───────────────────────┐  API  ┌───────────────────────────────────────────┐ jobs ┌───────────────────────────────────────┐
│ Landing, demo (sim    │──────▶│ /auth (email code) /meta/oauth /accounts   │─────▶│ probe: Playwright, phone profile →    │
│ ticks in the browser),│       │ /leaks /actions (pause, budget, undo)      │      │  status, redirects, load, tags,       │
│ leak feed, detail,    │◀──────│ /explain /ask → Gemma (Workers AI)         │◀─────│  facebook.com/tr requests, screenshot │
│ guards, ask           │       │   → OpenRouter :free → rules               │      │ forecast: TabPFN-3.5 (Prior Labs API) │
└───────────────────────┘       │ cron hourly: sync Meta insights → detect   │      │ daily model check                     │
                                │ cron daily: queue probes, verify fixes,    │      └───────────────────────────────────────┘
                                │   guards, morning email                    │
                                └──────────────┬────────────────────────────┘
                                               ▼
                                Neon: accounts, meta_tokens (encrypted), ads, insights_daily,
                                probes, leaks, actions (with previous state), guards, events, pulse.*
```

## Choices
| Layer | Pick | Why |
|---|---|---|
| Ad data | Meta Marketing API (Graph v26): `/act_{id}/insights` level=ad, daily breakdown; `POST /{adset_id}` status/daily_budget for actions | Dev-mode app + standard access covers accounts where app-role users are admins |
| Detectors | Pure TypeScript functions, unit-tested against the demo dataset | Exact, explainable numbers |
| Probe | Playwright (Chromium, phone viewport + slow-4G throttling) on Render; records every request, filters pixel calls (`facebook.com/tr?id=…&ev=…`) | Real browser = what the customer sees; Render credits; long jobs |
| Explain / Ask | **Gemma 4 on Cloudflare Workers AI** (97.6% F1, 1.9 s in our Week 1 check) → Gemma `:free` on OpenRouter → rules | Open weights, our account, flat cost |
| Forecast | **TabPFN-3.5** via Prior Labs API on Render | Small tables ("24 ad sets × 30 days"), no training |
| Payments | Dodo subscription $19/month, signed webhook | Same as previous weeks, monthly |
| Tracing | Sentry agent tracing on /explain, /ask, probe | Latency, tokens, fallbacks |
| Analytics | Pulse contract views | One dashboard for every week |

## Where REA fits
REA ([morluto/rea](https://github.com/morluto/rea)) is an MCP for reverse-engineering apps and
websites (browser observation, HAR captures, JS bundle analysis). We use it **while building**, in
the agent session, to:
1. observe a healthy Shopify / WooCommerce checkout and record exactly what the Meta pixel sends
   (`fbevents.js` → `facebook.com/tr` params: `id`, `ev`, `eid` for dedup, `cd[...]`), and what a
   broken one looks like (no `ev=Purchase`, wrong `id`, double fire without `eid`);
2. reverse-engineer how redirects and link shorteners drop `fbclid` / `utm_*`;
3. turn those observations into the probe's rules (T1–T4, P1–P3) and fixtures for tests.

The production probe is our own Playwright job (REA runs locally inside an agent, not as a SaaS
backend). The REA session is shared in the post.

## Why not OpenCode Zen / free DeepSeek as the runtime
OpenCode Zen's free models (incl. DeepSeek V4 Flash Free) are on an OpenAI-compatible endpoint, but
the list changes, limits are per IP, and free traffic may be used for training — wrong for client ad
data. We use OpenCode as a coding agent only. HF Inference Endpoints bill per hour; Workers AI per request.

## First REA observation (Oct 18, 2026)
`rea capture-browser-scenario` (REA 6.5.0, headless, 390×844 phone viewport, 7 s, network events) on a
public Shopify store home page: 334 requests. The Meta pixel script (`connect.facebook.net/en_US/fbevents.js`)
and its config for one pixel ID loaded, plus Google Tag Manager and two Google Ads tags, but **no
`facebook.com/tr` PageView hit inside the window**. 35 requests aborted. This is the case the probe must
classify carefully before calling it a leak: consent gating, a delayed fire, or a real break. Rules
from this: wait for network idle + up to 15 s, record consent-banner presence, and report "pixel loaded,
no event seen" as its own state ("couldn't confirm"), not as "broken".
