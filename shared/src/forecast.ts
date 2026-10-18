// Tomorrow's forecast. Production sends each ad set's last 14+ daily rows to TabPFN on the jobs
// service. This is the transparent fallback used by the demo and whenever that service is down:
// a recency-weighted share of recent days that missed the target. Never shown under 7 rows.

import type { Dataset, ForecastRow } from './types';
import { dailyByAdSet } from './detectors';
import { money, pct } from './util';

export const MIN_FORECAST_ROWS = 7;

export function forecast(ds: Dataset): ForecastRow[] {
  const daily = dailyByAdSet(ds);
  const last = ds.dates.length - 1;
  const target = ds.account.targetCost;
  const cur = ds.account.currency;
  const sales = new Set(ds.campaigns.filter((c) => c.objective === 'sales').map((c) => c.id));
  const out: ForecastRow[] = [];

  for (const s of ds.adSets) {
    if (s.status !== 'active' || !sales.has(s.campaignId)) continue;
    // Full days only: today is still running.
    const days = daily.get(s.id)!.slice(0, last).filter((d) => d.spend > 0).slice(-14);
    if (days.length < MIN_FORECAST_ROWS) {
      out.push({
        adSetId: s.id,
        rows: days.length,
        probability: null,
        verdict: 'not-enough-data',
        reasons: [`${days.length} of ${MIN_FORECAST_ROWS} days so far. We forecast once there's a week of data.`],
      });
      continue;
    }
    let w = 0;
    let missW = 0;
    let misses = 0;
    days.forEach((_, i) => {
      const weight = Math.pow(0.5, (days.length - 1 - i) / 4);
      // Small accounts get 0–2 sales a day, so each day is judged on a rolling 3-day cost per sale.
      const win = days.slice(Math.max(0, i - 2), i + 1);
      const spend = win.reduce((a, d) => a + d.spend, 0);
      const results = win.reduce((a, d) => a + d.results, 0);
      const missed = results === 0 ? spend > target : spend / results > target;
      if (missed) {
        missW += weight;
        misses++;
      }
      w += weight;
    });
    const p = Math.min(0.97, Math.max(0.03, missW / w));
    const half = Math.floor(days.length / 2);
    const cps = (xs: typeof days) => {
      const r = xs.reduce((a, d) => a + d.results, 0);
      return r > 0 ? xs.reduce((a, d) => a + d.spend, 0) / r : Infinity;
    };
    const early = cps(days.slice(0, half));
    const late = cps(days.slice(half));
    const reasons = [`Missed ${money(target, cur)} per sale on ${misses} of the last ${days.length} days`];
    if (Number.isFinite(early) && Number.isFinite(late)) {
      const change = late / early - 1;
      if (Math.abs(change) >= 0.1) reasons.push(`Cost per sale ${change > 0 ? 'up' : 'down'} ${pct(Math.abs(change))} in the second half`);
      else reasons.push('Cost per sale steady');
    } else if (!Number.isFinite(late)) {
      reasons.push('No sales in the last week');
    }
    out.push({
      adSetId: s.id,
      rows: days.length,
      probability: Math.round(p * 100) / 100,
      verdict: p >= 0.65 ? 'likely' : p >= 0.35 ? 'maybe' : 'fine',
      reasons,
    });
  }
  return out.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
}
