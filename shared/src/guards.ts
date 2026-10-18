import type { Dataset, Guard, Leak } from './types';
import { dailyByAdSet } from './detectors';
import { money } from './util';

export function defaultGuards(targetCost: number, currency: Dataset['account']['currency'] = 'INR'): Guard[] {
  return [
    {
      id: 'g-no-sale',
      enabled: false,
      rule: 'pause-no-sale',
      multiple: 2,
      sentence: `Pause any ad set that spends ${money(targetCost * 2, currency)} in a day with no sale`,
    },
    {
      id: 'g-cost-high',
      enabled: false,
      rule: 'pause-cost-high',
      multiple: 3,
      sentence: `Pause any ad set paying over ${money(targetCost * 3, currency)} per sale for 3 days`,
    },
    {
      id: 'g-broken-page',
      enabled: false,
      rule: 'pause-broken-page',
      multiple: 1,
      sentence: 'Pause ads the moment their page breaks, and tell me',
    },
  ];
}

export interface GuardHit {
  guardId: string;
  adSetId: string;
  reason: string;
}

/** Which ad sets each enabled guard would pause right now. Pure: the caller applies the pause. */
export function evaluateGuards(ds: Dataset, guards: Guard[], leaks: Leak[]): GuardHit[] {
  const hits: GuardHit[] = [];
  const daily = dailyByAdSet(ds);
  const last = ds.dates.length - 1;
  const target = ds.account.targetCost;
  const cur = ds.account.currency;
  const sales = new Set(ds.campaigns.filter((c) => c.objective === 'sales').map((c) => c.id));

  for (const g of guards) {
    if (!g.enabled) continue;
    for (const s of ds.adSets) {
      if (s.status !== 'active' || !sales.has(s.campaignId)) continue;
      const days = daily.get(s.id)!;
      if (g.rule === 'pause-no-sale') {
        const today = days[last];
        if (today.results === 0 && today.spend >= g.multiple * target) {
          hits.push({ guardId: g.id, adSetId: s.id, reason: `spent ${money(today.spend, cur)} today with 0 sales` });
        }
      } else if (g.rule === 'pause-cost-high') {
        const w = days.slice(last - 2);
        const spend = w.reduce((a, d) => a + d.spend, 0);
        const results = w.reduce((a, d) => a + d.results, 0);
        if (results > 0 && spend / results > g.multiple * target) {
          hits.push({ guardId: g.id, adSetId: s.id, reason: `paid ${money(spend / results, cur)} per sale over 3 days` });
        }
      }
    }
    if (g.rule === 'pause-broken-page') {
      for (const l of leaks) {
        if (l.detector !== 'P1') continue;
        for (const id of l.adSetIds) {
          const s = ds.adSets.find((x) => x.id === id);
          if (s?.status === 'active') hits.push({ guardId: g.id, adSetId: id, reason: 'its landing page is broken' });
        }
      }
    }
  }
  // One pause per ad set, first guard wins.
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(h.adSetId) ? false : (seen.add(h.adSetId), true)));
}
