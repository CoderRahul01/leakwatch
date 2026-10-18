# Leakwatch: Product Requirements

> **Your ad account, watched every morning.** Drop in your ads report. Leakwatch finds the money
> that's leaking (the ad that spends but never sells, the audience that's tired of you, the link
> that's broken) and tells you in plain words what to pause, what to fix, and what it saves you.

**Status:** v0.1, Oct 18, 2026 · **Challenge:** Hacktoberfest Week 2 "Side Hustle" (due Oct 18, 11:59 PM PDT = Oct 19, 12:29 PM IST)
**Platform:** web app, desktop first (people read ad reports on a laptop), works on a phone for the morning check.

---

## 1. Problem

Millions of small businesses run their own Meta and Google ads: a bakery boosting Diwali boxes, a
D2C skincare brand, a yoga teacher filling a workshop, a freelancer running ads for three clients.
They spend **$300 to $5,000 a month**, with nobody watching the account full time.

- Money leaks quietly. An ad set spends ₹4,000 over a week with zero sales and nobody notices
  until the card bill arrives.
- Ads Manager shows 40 columns and explains none of them. "Frequency 4.2, CPM up 38%" means
  nothing to a bakery owner.
- The tools that do watch accounts (Madgicx, Revealbot/Bïrch, AdEspresso) start at **$49–$99 a
  month** and are priced as a share of ad spend. Reviewers say outright that at $500/month of ad
  spend the subscription eats the margin, and that small businesses should "use a spreadsheet."
- Agencies and freelancers sign NDAs. Pasting a client's revenue, margins and audiences into a
  closed chatbot is exactly what they promised not to do.

## 2. Who it's for

| Persona | Spend | What Leakwatch gives back |
|---|---|---|
| **Solo shop owner** (bakery, salon, boutique, D2C brand) | $300–1,500/mo | "Pause 'Lookalike 2%': ₹3,850 this week, 0 orders. Saves about ₹16k a month." |
| **Freelance media buyer** with 2–5 clients | $2k–20k/mo across clients | One morning list across all clients; a clean PDF to send each client |
| **Coach / creator** selling a course or workshop | $200–800 per launch | "Your ads stop working after 9 PM. Stop spending at night." |
| **Indie hacker** running a first campaign | $100–500 | "Your landing page returned an error for 2 days while you paid for 1,140 clicks." |

**First user for the build:** a real small advertiser we know (see `content/FIRST_USER.md`).

## 3. Principles
1. **Money first, metrics second.** Every finding is a rupee/dollar amount and one action. No
   charts you have to interpret.
2. **One minute to value.** No sign-up, no ad-account connection. Drop a file (or try the demo
   account) and see your leaks in under 10 seconds.
3. **Your numbers stay yours.** The file is read in your browser. Only a short summary of the leaks
   goes to an open model we run ourselves. Nothing is stored unless you save a watch.
4. **The model never does arithmetic.** Code finds and prices the leaks; the model only explains
   them and answers questions. Every number on screen comes from your file.
5. **Never a dead end.** If the model is busy, you still get every leak, explained by plain rules.
6. **Plain language.** No model names in the product. Partners credited in the footer and the post.

## 4. The loop

```
 MONDAY (or every morning on Pro)       READ (60 s)                     ACT
 ┌─────────────────────────┐   ┌────────────────────────────────┐   ┌─────────────────────────┐
 │ Export report from Ads  │   │ "₹9,420 of ₹31,200 leaked       │   │ Tick "Done" on a fix    │
 │ Manager (or it arrives  │──▶│  this week (30%)."              │──▶│ → Saved-money counter   │
 │ by email on Pro)        │   │ Leaks ranked by money, each     │   │   goes up next week     │
 │ → drop it on Leakwatch  │   │ with one action + "why"         │   │ Ask: "why was Tue bad?" │
 └─────────────────────────┘   └────────────────────────────────┘   └─────────────────────────┘
          ▲                                                                     │
          └──────── tomorrow's forecast: "these 2 ad sets will likely miss" ◀──────┘
```

## 5. Leak types (the detectors)

All computed in code from the report rows. Each produces: **money at risk this period**, an
**estimated monthly saving**, a **confidence** (high / medium) and **one action**.

| # | Leak | Rule (first version) | Action |
|---|---|---|---|
| L1 | **Spending, not selling** | Ad set/ad spent ≥ 2× target cost per result with 0 results | Pause it |
| L2 | **Cost per result too high** | Cost/result ≥ 1.8× account median over ≥ 3 days | Lower budget or pause |
| L3 | **Tired audience** | Frequency ≥ 3.5 and CTR down ≥ 25% vs its first days | New creative or wider audience |
| L4 | **Price spike** | CPM up ≥ 35% vs the ad set's 7-day median with flat results | Check audience overlap / pause for a day |
| L5 | **Dead hours** | Hours/days with ≥ 15% of spend and ≤ 5% of results (needs hour/day breakdown) | Schedule ads off those hours |
| L6 | **Broken link** | Landing URL returns 4xx/5xx or redirects to a different domain (checked live) | Fix the link, pause until fixed |
| L7 | **Clicks, no landing** | Link clicks ≫ landing-page views (< 50%) | Page is slow or broken on mobile |
| L8 | **Winners starved** | Best cost/result ad set gets < 15% of budget | Move budget from L1/L2 here |
| L9 | **Learning limbo** | Ad set edited often / < 50 results a week on a conversion goal | Merge ad sets or switch goal |

L8 is a *gain*, not a leak: shown as "money you could make" in green.

## 6. Features

### P0: by tonight (Oct 18, IST)
| # | Feature | Acceptance |
|---|---|---|
| P0-1 | **Landing** with one promise, a 3-step "how it works", privacy line, pricing, "Try the demo account" | Judges reach a leak list in one click |
| P0-2 | **Drop a report**: Meta Ads Manager CSV/XLSX export (Google Ads CSV next). Column auto-mapping across export languages/currencies; a tiny "map columns" fallback | Real exports from 2 accounts parse without editing |
| P0-3 | **Leak report**: headline (leaked amount and %), leaks L1–L4, L6–L8 ranked by money, each with action + "why we think so" (the exact rows) | Correct on the demo account and on the first user's real export |
| P0-4 | **Plain-words explanation** by the open model for each leak + a 3-line weekly summary; rules-only text if the model is unavailable | Model never changes a number (checked in code) |
| P0-5 | **Demo account**: a realistic 30-day D2C account (8 campaigns, 21 ad sets, 64 ads) with planted leaks | Loads in under 2 s |
| P0-6 | **Done / Snooze** per leak, saved locally; "Saved so far" counter | Persists on reload |

### P1: by tomorrow morning (what wins the categories)
| # | Feature | Acceptance |
|---|---|---|
| P1-1 | **Tomorrow's forecast** (TabPFN): per ad set, chance it misses the target cost per result tomorrow, from its daily rows + day of week + spend trend; plus anomaly flags on daily spend | Backtest on the demo and real account: hit-rate shown in the post |
| P1-2 | **Ask your account**: "Why did Tuesday cost so much?" answered only from the rows, with the rows shown as sources; says "Not in this report" otherwise | 12 test questions, no invented numbers |
| P1-3 | **Client PDF / share link**: one-page "This week in your ads" for agencies | Opens on a phone |
| P1-4 | **Pro checkout** (Dodo subscription) + sign-in with a 6-digit email code | Test purchase flips the plan |
| P1-5 | **Morning watch** (Pro): forward the scheduled Ads Manager email report to `you@in.leakwatch.tech` (or upload daily); email "3 leaks this morning, ₹2,140 at risk" | One real email received and parsed |
| P1-6 | **Model check** in Pulse: 30 labelled cases (leak explanations, Q&A) scored daily | Numbers in `content/numbers.md` |

### P2: if time allows
- Google Ads export; TikTok Ads export.
- Live connection via the Meta Marketing API (needs app review, so post-hackathon).
- Competitor ads glance (SerpApi Google Ads Transparency) on the leak "new creative" action.
- WhatsApp morning message.

### Non-goals (this week)
- Leakwatch never changes the ad account. It tells you; you click.
- No creative generation, no "AI writes your ads".
- No attribution modelling. We trust the results column the platform reports.

## 7. Plans

| | **Free** | **Pro, $19/month** (₹1,499) |
|---|---|---|
| Upload a report any time | ✓ | ✓ |
| Leaks shown | Top 3, with amounts | All, with "why" and the exact rows |
| Plain-words weekly summary | ✓ | ✓ |
| Tomorrow's forecast | — | ✓ |
| Ask your account | 3 questions per report | Unlimited |
| Morning watch by email (daily) | — | ✓ |
| Ad accounts | 1 | Up to 5 (freelancers, small agencies) |
| Client PDF / share link | — | ✓, with your logo |
| History and "Saved so far" across weeks | This device | Synced, every device |

**Why $19:** the cheapest watcher on the market is $49+ and scales with spend. If Leakwatch catches
one dead ad set a month, it pays for itself 5–20× at a $500/month spend. Running it costs us under
$0.30 per Pro user per month (open model on our own account), so $19 flat is a real business.
Annual: $190 (two months free). No lifetime plan: the morning watch has an ongoing cost.

## 8. Data

- **In the browser:** the uploaded file, parsed rows, computed leaks, Done/Snooze state (IndexedDB).
- **Sent to the server per report:** the leak list (names of ad sets, amounts, rule evidence), never
  the raw file. For Ask: only the rows the question needs.
- **Stored on the server (Pro only):** account email, plan, saved watches (encrypted at rest),
  daily report rows for forecasting, deleted on request in one click.

## 9. Success metrics
- **Time to first leak:** < 10 s from landing (demo) / < 60 s from export (real).
- **Accuracy:** every leak reproducible by hand from the rows (spot-checked on 2 real accounts).
- **First user:** one real advertiser uses it on their own account and acts on at least one leak.
- **Money found:** total "leaked this week" across real uploads, shown in Pulse.
- **Pulse:** uploads, leaks found, Done rate, Ask questions, Pro checkouts, credits left.

## 10. Risks
| Risk | Mitigation |
|---|---|
| Export formats differ (language, currency, column names, breakdowns) | Header synonyms table + "map columns" fallback; test with real exports |
| Report has no conversion column (traffic/awareness goals) | Switch to cost per click/landing view as the "result"; say so |
| Too little data for forecasts | Need ≥ 7 daily rows per ad set; otherwise "Forecast after 7 days" |
| Model invents a number | Numbers rendered from code only; model text is checked for digits not present in the evidence and falls back to rules |
| Free model rate limits | Credit guard + fallbacks (Workers AI → OpenRouter free → rules) |
