# Leakwatch

**Find where your ad money leaks, and stop it.** Leakwatch connects to your Meta ad account and
follows every ad from **spend → click → page → tracking → sale**. It puts a price on each break
(an ad set that never sells, a landing page that's slow on phones, a pixel that stopped sending
Purchase), fixes it with one tap and an undo, and checks the next day that the fix worked.

Built for small businesses and freelancers spending $300–$5,000 a month, for whom the existing
tools cost $49–$489 and stop at the click. Open models explain every leak.

> Status: in progress for the [Hacktoberfest Open-Source AI Challenge, Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).

## Docs
| Doc | What's inside |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Problem, the leak chain, detectors, features, plans, trust, risks |
| [docs/TEARDOWN.md](docs/TEARDOWN.md) | What existing tools do and miss (Meta rules, Bïrch, Madgicx, AdAmigo, Ryze, Opteo, Elevar…) |
| [docs/DESIGN_BRIEF.md](docs/DESIGN_BRIEF.md) | The design prompt: feel, the chain, 14 screens, components, motion |
| [docs/STACK.md](docs/STACK.md) | Architecture, the browser probe, where REA fits |

## Plans
**Free:** 1 account, daily check, every leak priced, one-tap fixes. **Pro, $19/month:** hourly
checks, daily page probes for every live ad, overnight guards, forecasts, Ask, 5 accounts.

## Built with
Gemma (open weights) on Cloudflare Workers AI · TabPFN-3.5 (Prior Labs) and Playwright on Render ·
Meta Marketing API · Neon · Dodo Payments · Sentry · REA for reverse engineering during the build.

## License
AGPL-3.0
