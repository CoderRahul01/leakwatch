# Teardown: what exists today, and the hole in it

Researched Oct 18, 2026 from vendor pricing pages and comparison posts (prices as published in
Sept–Oct 2026). Goal: find what a small advertiser ($300–$5k/month) actually can't get.

## The leak chain

Money leaks at five steps. Every product below covers one or two of them.

```
 1 SPEND            2 CLICK → PAGE        3 SIGNAL               4 LEARNING            5 SALE
 ad sets that       slow / broken page,   pixel / CAPI event     Meta optimises on     sale happens but
 spend, not sell;   redirect drops UTMs,  missing, duplicated,   wrong or missing      never gets credited;
 tired audience;    wrong mobile layout   wrong pixel ID         data → worse buyers   or credited twice
 CPM spikes
```

## 1. Account watchers (step 1 only)

| Product | What it really does | Price | Gap for a small advertiser |
|---|---|---|---|
| **Meta automated rules** (free) | If-then rules evaluated on Meta's schedule; notify or act | Free | You must know which rules to write; 1 condition of each type per rule; no explanation, no post-click view |
| **Meta opportunity score** (free) | 0–100 score = how many of *Meta's* recommendations you applied | Free | Measures obedience to Meta, not money lost; reviewers say "a high score doesn't mean better results" |
| **Bïrch (ex-Revealbot)** | Rule engine every 15 min, Slack alerts, bulk launch | $49 / $99 (≤ $10k spend) | Rules you write yourself; "alerts you to threshold breaches but won't diagnose the root cause" |
| **Madgicx** | Meta-first AI audiences, creative analytics, automation | from ~$44, priced by spend + add-ons (tracking add-on $49) | Price grows with spend; at $500/mo spend "the subscription eats the margin" |
| **AdAmigo.ai** | AI media buyer: acts, creates ads, 24/7 anomaly detection | $98–$489 (Signals plan $99; full $349 per account) | Built for $5k+/mo; one-week calibration; black box |
| **Ryze AI** | Cross-platform AI that audits and executes with approval | $89 flat ($10/week trial plan) | Closest competitor. In-platform only; closed models |
| **Opteo** | Google Ads one-click recommendations, alerts | $129 / $249 / $499 | Google only |
| **AdEspresso, Adzooma, WASK, Optmyzr** | Testing, rules, % of spend pricing | $49–$299 or % of spend | Same step-1 focus; % of spend punishes growth |

## 2. Tracking fixers (step 3, Shopify only)

| Product | What it does | Price | Gap |
|---|---|---|---|
| **Elevar** | Server-side tracking + data layer for Shopify | paid tiers | Install-and-configure; tells you events, not money |
| **WeltPixel, eρ (Easy Pixels), Trackify, Stape** | Pixel + Conversions API apps, "monitors tracking 24/7" | free → $39/mo | Shopify/GTM only; none connect a broken event to the ad set it's costing |
| **Meta Events Manager diagnostics** (free) | Warnings about event match quality, duplicates | Free | Buried, jargon, no money attached, not per ad |

Real symptoms in the wild: "Pixel that worked for 3 years suddenly stopped sending Checkout and
Purchase" (Shopify Community), "only PageView and ViewContent fire; Purchase missing" (Shopify
Community, 798 views, no fix posted), "pixel stopped firing when Facebook changed how links open,
which kills tracking and sales" (r/selfpublish), "resetting Ads Manager is a bandaid if the root
event mapping is off" (r/FacebookAds).

## 3. Attribution suites (step 5)

Triple Whale (from ~$179/mo), Northbeam, Hyros (custom): built for brands spending $20k+.

## The hole

**No product watches the whole chain for one small advertiser and prices each break in money.**

- Account watchers see the spend but are blind after the click.
- Tracking apps see the events but not which ad set is burning money because of them.
- Both explain nothing in plain words, and the cheap end starts at $44–$49 plus spend-based pricing.

When step 3 breaks, step 1 looks like "my ads stopped working", and the owner pauses good ads or
raises budgets on bad ones. That's the expensive, invisible leak. Leakwatch is built around it.

## What we take, what we do differently

| Borrowed idea | From | Our version |
|---|---|---|
| Issue list ranked by severity | Sentry, Opteo improvements | Ranked by **money**, each with one action |
| Rules that act | Meta rules, Bïrch | **Guards** written for you, explained, with undo; you approve the first time |
| One-click apply | Opteo, Ryze | Pause / cut budget / move budget from the leak card |
| Tracking health | Elevar, Events Manager | A **real browser probe** of every live ad's landing URL, tied to that ad's spend |
| Anomaly detection | AdAmigo | TabPFN forecast + backtest number we publish |
| Flat price | Ryze ($89) | **$19 flat**, open model on our own account |
