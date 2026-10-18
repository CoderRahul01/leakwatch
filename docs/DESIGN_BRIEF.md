# Leakwatch: Design Brief (v2)

Paste this file into the design tool as the prompt. Product: [PRODUCT.md](PRODUCT.md). Research: [TEARDOWN.md](TEARDOWN.md).

## One-line
A live monitor for a small business's ad money: Sentry's issue feed crossed with a bank app, where
every issue is an amount, a place in the ad → sale path, and a one-tap fix.

## Feel
- **Calm instrument, alive.** It's watching right now: a small pulsing "Watching · last check 4 min
  ago" status, numbers that tick, leaks that appear and resolve. Never a dashboard of 20 charts.
- **Money is the hero.** Biggest type on every screen is an amount (₹/day at risk, ₹ saved).
- **Colour has meaning only:** ink/paper neutrals; **leak** = warm amber-red (money at risk);
  **saved/gain** = green; **checking** = blue. Nothing else coloured.
- **Plain words.** Each metric is a sentence. Numbers in a tabular mono.
- Light + dark. Desktop first (1280–1440), fully usable at 390 wide.

## Brand
- **Leakwatch.** Mark: a drop inside a ring/eye, works at 16 px.
- UI: Geist / Inter / Instrument Sans. Numbers: Geist Mono / JetBrains Mono. Optional serif for the landing headline.
- Currency from the account (₹, $, €, £).

## The signature element: the chain
A horizontal 5-node path used everywhere: **Spend → Click → Page → Tracking → Sale**. Each node
shows health (green / amber / red / grey "not checked") and ₹ flowing through it. A leak is drawn
as a drip at the node where money escapes. On mobile it becomes a vertical stepper.

## Screens
| # | Screen | Must show |
|---|---|---|
| 1 | **Landing** | Headline "Find where your ad money leaks, and stop it." · sub "Leakwatch follows every ad from spend to sale, puts a price on each break, and fixes it with one tap. $19/month." · CTA **See a live demo account** + secondary **Connect Meta** · hero: the chain animating with one drip at "Tracking" ("Purchase stopped reaching Meta · ₹1,600/day") · 3 blocks: Watch / Pinpoint / Stop & verify · "vs $49–$489 tools that stop at the click" strip · pricing Free / Pro · trust line (read-only by default, undo everything, open model) |
| 2 | **Connect** | Meta button → choose ad account (list with spend last 30 d) → "First check running" checklist ticking: syncing 30 days · probing 6 landing pages · checking pixels · pricing leaks. ≤ 20 s feel |
| 3 | **Home: Leak feed** | Top: status pill "Watching · next check 12:00" + account switcher. Hero: "₹3,940/day leaking right now" with the chain showing where. Below: "₹21,600 saved since Oct 12" (green). Feed of leak cards ranked by ₹/day, filter chips by step. Right rail: Guards on/off, Tomorrow's forecast, Ask |
| 4 | **Leak card** (in feed) | Step chip ("Tracking") · severity dot · title in plain words ("Sales went silent on Oct 14") · ₹/day + since when · primary action button ("Pause 3 ad sets" / "Recheck page") · secondary "Why?" |
| 5 | **Leak detail** (side panel / full sheet on mobile) | The chain with the broken node highlighted · evidence: mini chart with the change point marked, the rows, or the **probe trace** (phone screenshot of the landing page, timeline of requests: page 200 → redirect → pixel PageView ✓ → ViewContent ✓ → Purchase ✗, load time) · plain explanation (3 lines) · fix steps (≤ 3) · confidence · actions |
| 6 | **Confirm + Undo** | Confirm sheet: "Pause 'Lookalike 2%'? It spent ₹3,850 this week with 0 sales." → toast "Paused · Undo" (10 s) → card moves to "Waiting to verify (24 h)" |
| 7 | **Verified** | Card state "Fixed ✓ — saving ₹550/day" with the amount flying into the Saved counter; or "Still leaking" with next step |
| 8 | **Guards** | List of plain-sentence rules with toggles ("Pause any ad set that spends 2× your target with no sale"), target cost input, activity log with undo per action |
| 9 | **Page check** (per landing URL) | Phone screenshot, load time bar vs 4 s, redirect chain, tags kept/lost, pixel ID + events seen, which live ads point here and their spend, "Recheck now" |
| 10 | **Forecast** | Per ad set: chance it misses target tomorrow (bar), likely/maybe/fine, 2 reasons, "based on last 14 days", backtest accuracy note |
| 11 | **Ask** | One input + 3 suggestions; answer with source rows / traces; honest "not in your data" |
| 12 | **Pricing + checkout** | Free vs Pro $19 table; email-code sign-in (6 boxes) before Dodo checkout |
| 13 | **Morning email** | Subject "3 leaks · ₹2,140/day at risk · 1 fix verified"; 3 rows + one button |
| 14 | **States** | Demo banner ("This is a demo account — numbers are simulated"), no leaks ("Nothing leaking. Last check 4 min ago." — calm, celebratory), probe blocked ("Couldn't check this page"), token expired, not enough days for forecast |

## Components
Chain (5 nodes, states, drip) · Status pill (watching/checking/paused) · Money hero (count-up) ·
Leak card (5 states: new, acting, waiting to verify, fixed, still leaking) · Evidence chart with
change point · Probe timeline (request rows with ✓/✗) · Phone screenshot frame · Confirm sheet ·
Undo toast · Guard row with toggle · Forecast bar · Plan card · 6-box code input.

## Motion
Status dot pulses (2 s). New leak slides into the feed with a short amber flash. Numbers count up
once. Fixed: card collapses and the amount flies into "Saved". Chain drip falls slowly at the
broken node. Respect reduced motion.

## References
Sentry issues (ranking, states), Linear (density, calm), Mercury / Ramp (money as type), Vercel
deployments (live status), Checkly / Better Stack (uptime checks, request timelines), Granola landing (calm hero).
