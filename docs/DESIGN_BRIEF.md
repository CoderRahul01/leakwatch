# Leakwatch: Design Brief

Use this file as the prompt for the design tool. Product context: [PRODUCT.md](PRODUCT.md).

## Feel
- **A calm money instrument, not a marketing dashboard.** Think a well-made bank statement crossed
  with Linear and Sentry's issue list: quiet, dense where it matters, one number that hits.
- **Money is the hero.** The biggest thing on any screen is an amount: "₹9,420 leaked this week".
- **Red is rare.** Neutral paper/ink base, one warm "leak" colour (amber-red) used only on money at
  risk, one green used only on money saved or gained. Everything else greyscale.
- **Plain words.** Every metric is a sentence. Numbers in a tabular mono font.
- **Light and dark** (auto). Desktop first (1280–1440 wide), fully usable at 390 wide.

## Brand
- Name: **Leakwatch**. Mark: a single drop inside a ring (a drop being watched), works at 16 px.
- Type: a grotesk for UI (Inter / Instrument Sans / Geist), a mono for numbers (JetBrains Mono /
  IBM Plex Mono / Geist Mono). One serif accent for the landing headline is allowed.
- Currency-aware: show ₹, $, €, £ as in the user's report.

## Screens
| # | Screen | Must show |
|---|---|---|
| 1 | **Landing** (desktop + mobile) | Headline "Find the ad money you're leaking." · sub "Drop your Ads Manager report. In 10 seconds you'll know what to pause, what to fix, and what it saves you." · big drop zone *on the landing itself* + "Try a demo account" · 3 steps (Export → Drop → Fix) · a real-looking leak card as the hero visual · privacy line "Your file is read in your browser." · pricing (Free / Pro $19) · footer credits partners |
| 2 | **Reading state** | File name, row count, "Checking 21 ad sets across 30 days…", a short checklist ticking through detectors (Spending, not selling ✓ · Tired audience ✓ · Links …). 2–5 seconds, must feel fast |
| 3 | **Leak report (home)** | Header: account name, date range, spend. Hero: "₹9,420 of ₹31,200 leaked this week (30%)" + "Fix these and save about ₹38k a month". Leak list ranked by money: each row = severity dot, plain title ("'Lookalike 2%' spent ₹3,850 and sold nothing"), amount at risk, action button ("Pause it"), Done / Snooze. A green "Money you could make" row for starved winners. Right rail (desktop): weekly summary (3 lines), Tomorrow's forecast, Ask box |
| 4 | **Leak detail** (side panel / sheet) | Why we think so: the exact rows as a small table, a tiny sparkline of the metric, the rule in one sentence, "How to do it in Ads Manager" steps (3 max), confidence chip, "Mark done" |
| 5 | **Tomorrow's forecast** | Per ad set: chance it misses your target tomorrow as a bar (e.g. 78%), "likely / maybe / fine", the 2 reasons. Explain "Based on its last 14 days" |
| 6 | **Ask your account** | One input with 3 suggested questions; answer card with source rows; honest "Not in this report" state |
| 7 | **Client report** (PDF / share link) | One page: this week's spend, leaked, saved, top 3 fixes, the agency's logo slot |
| 8 | **Pricing + checkout sheet** | Free vs Pro $19/month table; email code sign-in (6 boxes) before checkout |
| 9 | **Morning watch setup** (Pro) | Your forwarding address `rahul-7f2@in.leakwatch.tech` with copy button; 3 steps to schedule the report in Ads Manager; "Waiting for the first report…" state |
| 10 | **Empty / error states** | Wrong file ("This looks like a bank statement, not an ads report"), no conversions column, too little data for forecasts, model busy (rules still shown) |
| 11 | **Saved so far** | A single growing number "₹21,600 saved since Oct 12" + list of fixes you marked done |

## Components
- Leak row (severity dot · title · amount · action · done/snooze)
- Money hero (amount, % bar showing leaked vs working spend)
- Evidence table (compact, mono numbers, highlighted offending cell)
- Forecast bar
- Drop zone (idle / hover / reading / error)
- Plan card, email-code input, toast "Marked done. ₹3,850/week saved."

## Motion
- Numbers count up once on first render (300 ms). Leak rows stagger in (40 ms each).
- Done: row collapses, amount flies into the "Saved so far" counter.
- Respect reduced motion.

## References to borrow from
Sentry issues list (ranking + severity), Linear (density, calm), Mercury / Ramp (money as type),
Granola landing (calm product hero), Stripe Sigma empty states.
