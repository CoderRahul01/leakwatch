# Leakwatch: Stack

Same shape as Memoria and Almanac (see the shared playbook): static frontend on Vercel, API on a
Cloudflare Worker, slow jobs on Render, one Neon database, Dodo for payments, Pulse for analytics.

```
 Browser (Vercel, static)                       Cloudflare Worker `leakwatch-edge`            Render `leakwatch-predict`
┌──────────────────────────────────┐  leaks   ┌──────────────────────────────────┐  rows  ┌───────────────────────────┐
│ Parse CSV/XLSX (Papa / SheetJS)  │────────▶│ /explain  → Gemma (Workers AI)    │──────▶│ TabPFN-3.5 (Prior Labs     │
│ Map columns, normalise currency  │         │   fallback OpenRouter free → rules│       │ API): miss-target forecast │
│ Detectors L1–L9 (pure functions) │◀────────│ /ask      → Gemma over given rows │◀──────│ + daily spend anomalies    │
│ Leak report, Done/Snooze (IDB)   │  text   │ /linkcheck → HEAD landing URLs    │       └───────────────────────────┘
│ Demo account (JSON, bundled)     │         │ /forecast → proxy to Render       │
└──────────────────────────────────┘         │ /auth, /billing (Dodo), /events   │──────▶ Neon (accounts, watches,
                                             │ email() handler: morning watch    │        events, Pulse views)
                                             └──────────────────────────────────┘
```

## Choices

| Layer | Pick | Why |
|---|---|---|
| Parsing | Papa Parse (CSV) + SheetJS (XLSX) in the browser | The file never leaves the laptop |
| Detectors | Plain TypeScript functions, unit-tested on the demo account | Numbers must be exact and explainable; no model does maths |
| Explanations + Ask | **Gemma 4 on Cloudflare Workers AI** (97.6% F1 / 1.9 s in our Week 1 check) → Gemma on OpenRouter `:free` → rules text | Open weights, runs on our own account, no per-seat API bill |
| Forecast + anomalies | **TabPFN-3.5** via the Prior Labs API on Render | Built for small tables like "21 ad sets × 30 days"; no training |
| Link check | Worker `fetch` with HEAD/GET, 3 s timeout | Catches the broken landing page |
| Morning watch | Cloudflare Email Routing → Worker `email()` handler on `in.leakwatch.tech` | Daily data without Meta app review |
| Payments | Dodo Payments subscription ($19/month), signed webhook | Same as previous weeks, now monthly |
| Analytics | Pulse contract views in Neon | One dashboard for every week |
| Tracing | Sentry agent tracing on /explain and /ask | Latency, tokens, fallbacks visible |

## Why not OpenCode Zen / free DeepSeek as the product's model?

OpenCode Zen does expose free models (DeepSeek V4 Flash Free among them) on an OpenAI-compatible
endpoint, so technically the app could call it. We use it as a **coding agent while building**, not
as the product's runtime, because:

- the free list changes without notice and is limited per IP, meant for trying the coding agent;
- free-period traffic may be used to improve the model, which breaks our "your ad data stays
  yours" promise to paying users;
- a paid product needs a model we control: Gemma on our own Workers AI account, with fallbacks.

DeepSeek stays an option as a fallback through OpenRouter's free tier if it scores well in the
model check. Hosting our own model on Hugging Face Inference Endpoints costs money per hour of
uptime; Workers AI bills per request and costs nothing at our volume.
