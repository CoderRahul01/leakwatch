# Leakwatch: Product Requirements (v2, final)

> **Every rupee from ad to sale, watched.** Leakwatch connects to your ad account, follows each
> ad's path from spend → click → page → tracking → sale, and tells you where the money is leaking,
> what it's costing, and fixes it with one tap. Then it checks the next day that the fix worked.

**Status:** v2, Oct 18, 2026 (v1 "drop a CSV" replaced: too static) · **Challenge:** Hacktoberfest Week 2 "Side Hustle", due **Oct 19, 12:29 PM IST**
**Research:** [TEARDOWN.md](TEARDOWN.md) · **Platform:** web app, desktop first, phone for the morning check.

---

## 1. Problem

Small businesses spending **$300–$5,000 a month** on Meta ads lose money in two ways:

1. **Inside the account:** ad sets that spend and never sell, tired audiences, cost spikes.
   Watchers exist but cost $49–$489 and you write the rules yourself.
2. **After the click (the expensive, invisible one):** the landing page is slow or broken on
   phones, a redirect drops the ad's tags, the pixel stops sending Purchase. Meta now optimises on
   bad data, so it finds worse buyers. The owner sees "ads stopped working" and pauses good ads or
   raises budget on bad ones. Tracking apps exist (Shopify-only) but never say which ad it's costing.

Nobody watches the whole path for one small advertiser and puts a money figure on each break.

## 2. Who it's for

| Persona | What Leakwatch gives back |
|---|---|
| **Solo D2C / shop owner** ($300–1.5k/mo) | "Purchase stopped reaching Meta on Oct 14. Since then ₹11,200 spent on ads optimising blind. Fix: reconnect the pixel on your checkout." |
| **Freelance media buyer** (2–5 clients) | One morning list across clients, guards running overnight, a client report that shows money saved |
| **Coach / course creator** (launch bursts) | "Your sign-up page takes 7.8 s on phones. 41% of paid clicks leave before it loads." |
| **Indie hacker** (first $200 campaign) | "Your ad links to `/pricing?ref=…` which 404s since your last deploy." |

## 3. Principles
1. **Money first.** Every finding = an amount, a step in the chain, one action.
2. **Live, not a report.** It keeps watching; findings appear, get fixed, get verified.
3. **You stay in charge.** Nothing changes in your account without your tap, except guards you
   switched on yourself, and every change has an undo.
4. **The model never does arithmetic.** Code finds and prices leaks; the open model explains them
   and answers questions; every number on screen comes from the data.
5. **Value before trust.** A live demo account for anyone; connecting Meta is step two.
6. **Plain words.** No model names or jargon in the product UI.

## 4. The loop (dynamic)

```
   ┌──────── WATCH (hourly) ────────┐     ┌────── PINPOINT ──────┐     ┌──── STOP ────┐     ┌── IMPROVE / VERIFY ──┐
   │ Meta insights per ad, ad set    │     │ Leak card: step in   │     │ Pause, cut    │     │ Move budget to the    │
   │ Probe each live landing URL     │ ──▶ │ the chain, ₹ at risk │ ──▶ │ budget, or    │ ──▶ │ winners; next day:    │
   │ in a real phone browser (daily) │     │ per day, evidence,   │     │ fix the link; │     │ "Fixed ✓ — ₹2,300/wk  │
   │ Forecast tomorrow (TabPFN)      │     │ plain explanation    │     │ undo any time │     │ saved" or "still      │
   └─────────────────────────────────┘     └──────────────────────┘     └──────────────┘     │ leaking"             │
                 ▲                                                                           └──────────────────────┘
                 └────────────── Guards keep watching overnight (opt-in auto-pause) ◀──────────────────┘
```

## 5. Detectors (by step in the chain)

| Step | # | Leak | How we know | Fix offered |
|---|---|---|---|---|
| Spend | S1 | **Spending, not selling** | ≥ 2× target cost per result, 0 results | Pause (1 tap) |
| Spend | S2 | **Cost per result too high** | ≥ 1.8× account median, 3+ days | Cut budget 30% / pause |
| Spend | S3 | **Tired audience** | Frequency ≥ 3.5 and CTR down ≥ 25% vs first days | Swap creative / widen audience |
| Spend | S4 | **Price spike** | CPM up ≥ 35% vs 7-day median, results flat | Pause 24 h |
| Page | P1 | **Broken link** | Probe: 4xx/5xx, or ends on a different domain | Pause until fixed; recheck button |
| Page | P2 | **Slow on phones** | Probe: load > 4 s on a mid-range phone profile; paid clicks vs landing-page views < 60% | Fix list (largest files, blocking scripts) |
| Page | P3 | **Tags dropped** | Probe: `utm_*` / `fbclid` lost after redirects | Fix the redirect |
| Signal | T1 | **Pixel not on the page** | Probe: no request to `facebook.com/tr` with PageView | Install steps |
| Signal | T2 | **Wrong pixel** | Probe: pixel ID on page ≠ the ad set's promoted pixel | Swap the ID |
| Signal | T3 | **Sales went silent** | Insights: purchases/leads drop to ~0 while clicks stay steady (change point) | Check checkout tracking; we name the day it broke |
| Signal | T4 | **Counted twice** | Probe: duplicate events without a shared event ID; or results > clicks | Dedupe setting |
| Learning | L1 | **Winners starved** | Best cost/result ad set < 15% of budget | Move budget (1 tap) — shown green, as money you could make |
| Learning | L2 | **Stuck learning** | < 50 results/week on a conversion goal, frequent edits | Merge ad sets |

Money at risk = spend on the affected ads since the leak started (code, from insights). Saving
estimate = that daily amount × 30. Forecast (TabPFN): probability each ad set misses its target
cost tomorrow, from its last 14+ daily rows; shown only with ≥ 7 rows.

## 6. Features

### P0: demo-ready by tonight
| # | Feature | Acceptance |
|---|---|---|
| P0-1 | **Landing**: promise, the 5-step chain visual, "See a live demo account", "Connect Meta", pricing | Judge reaches leaks in one click |
| P0-2 | **Demo account (live)**: a simulated D2C account that ticks every few seconds, with planted leaks across all 4 steps; you can pause, fix, undo, and watch "verified" appear | Works without any login |
| P0-3 | **Connect Meta** (OAuth, dev-mode app, `ads_read` + `ads_management`): pick ad account; first sync of 30 days of daily insights per ad | Works on Rahul's and the first user's accounts |
| P0-4 | **Watch**: hourly cron sync; daily probe of each distinct live landing URL in a headless phone browser (status, redirects, load time, tags, pixel requests and event names) | Probe report stored per URL per day |
| P0-5 | **Leak feed**: ranked by ₹/day, grouped by step; leak card → detail with evidence (rows, probe trace, screenshot), plain explanation | Each leak reproducible by hand |
| P0-6 | **Stop**: Pause / cut budget / move budget via the API, with confirm and **Undo** (we store the previous state) | Real pause and undo on a test ad set |
| P0-7 | **Verify**: 24 h after a fix, recheck and mark "Fixed ✓ saved ₹x/week" or "Still leaking" | Saved-money counter updates |

### P1: by tomorrow morning
| # | Feature | Acceptance |
|---|---|---|
| P1-1 | **Guards** (opt-in rules written for you, e.g. "Pause any ad set that spends 2× target with no sale"); act overnight, log + undo | One guard fires on the demo and on a test ad set |
| P1-2 | **Forecast** (TabPFN-3.5) + published backtest hit-rate | Number in `content/numbers.md` |
| P1-3 | **Ask**: "Why did Tuesday cost so much?" grounded in rows + probe traces; "not in your data" when unknown | 12 test questions |
| P1-4 | **Morning email**: "3 leaks, ₹2,140/day at risk, 1 fix verified" | Real email received |
| P1-5 | **Pro checkout** (Dodo subscription, $19/month) + email code sign-in | Test purchase flips the plan |
| P1-6 | **Model check + Sentry traces + Pulse tab** | Numbers + screenshots for the post |

### P2: after the hackathon
CSV/XLSX upload for people who won't connect · Google Ads · Shopify/Razorpay orders to compare real
sales vs reported (step 5) · WhatsApp alerts · client report PDF · Meta app review to go public.

### Non-goals
No ad creation, no creative generation, no attribution modelling, no autonomous spending decisions
beyond guards the user switched on.

## 7. Plans

| | **Free** | **Pro, $19/month** (₹1,499) |
|---|---|---|
| Ad accounts | 1 | 5 (freelancers, small agencies) |
| Account check | Daily | Hourly |
| Landing-page probes | 3 URLs, weekly | Every live ad, daily, + recheck on demand |
| Leaks shown | All, with ₹ at risk | All + evidence, explanation, Ask |
| One-tap pause / budget / undo | ✓ | ✓ |
| Guards (overnight auto-pause) | — | ✓ |
| Fix verification + saved-money history | Last 7 days | Unlimited |
| Tomorrow's forecast | — | ✓ |
| Morning email | Weekly | Daily |

**Why $19:** cheapest watcher is $44–$49 and none look past the click; Ryze is $89. One caught
pixel break at $500/month spend pays for years of Pro. Our cost: open model on our own Workers AI
account + one browser probe per URL per day ≈ under $0.50 per Pro user per month.

## 8. Data and trust
- Meta token encrypted at rest (AES-GCM, key in Worker secrets); revoke in one click; we request
  only `ads_read` + `ads_management`.
- We store daily insight rows (for forecasts) and probe traces. No customer personal data; probes
  load public pages only, never submit forms or buy.
- The explanation model runs on open weights on our own account; your numbers never train anyone's model.
- "Delete everything" removes the token, rows and traces.

## 9. Success metrics
- Demo: first leak visible < 5 s; full loop (spot → pause → undo → verified) < 60 s.
- Real: first user connects, sees ≥ 1 true leak, acts on it; we report what happened.
- Pulse: connected accounts, leaks found (₹/day), actions taken, fixes verified, saved ₹, Pro checkouts.

## 10. Risks
| Risk | Mitigation |
|---|---|
| Meta app in dev mode: only people with an app role can connect | First user added as tester; demo account for everyone else; app review after |
| Wrong pause hurts a good ad | Confirm + undo; guards opt-in with conservative defaults; learning-phase ad sets excluded |
| Probe blocked by bot protection | Real browser, phone profile, retry; mark "couldn't check" rather than guess |
| Can't see Purchase on the page without buying | T3 uses the data (sales went silent while clicks steady); probe checks pixel presence + events up to the product page |
| Model invents a number | Numbers rendered from code; digits in model text checked against evidence; rules fallback |
| Rate limits | Credit guard + fallbacks (Workers AI → OpenRouter free → rules) |
