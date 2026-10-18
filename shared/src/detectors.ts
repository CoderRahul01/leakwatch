// Leak detectors. Pure functions over a Dataset. Every number a leak carries is computed here;
// the explanation model only ever rewrites the words around them.
//
// Order matters: page and tracking problems are root causes, so ad sets they explain are not
// flagged again as "spending, not selling" or "cost too high".

import type { AdSet, Dataset, DetectorId, InsightRow, Leak, Probe, Series, Step, SuggestedAction } from './types';
import { median, money, pct, round, shortDate, sum } from './util';

export interface DetectOptions {
  /** How much of the last day in the window has passed (0–1). Used to average per day fairly. */
  dayFraction?: number;
}

export const THRESHOLDS = {
  S1_spendMultiple: 2,
  S2_costMultiple: 1.8,
  S2_minDays: 3,
  S3_frequency: 3.5,
  S3_ctrDrop: 0.25,
  S4_cpmRise: 0.35,
  P2_loadMs: 4000,
  P2_landingRate: 0.6,
  T3_minResultsPerDay: 0.8,
  T3_clicksKept: 0.7,
  L1_maxShare: 0.15,
  L1_minResults: 5,
  L1_moveShare: 0.3,
} as const;

interface Agg {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  landingViews: number;
  results: number;
  revenue: number;
}

const empty = (): Agg => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, landingViews: 0, results: 0, revenue: 0 });

function add(a: Agg, r: InsightRow | Agg): Agg {
  a.spend += r.spend;
  a.impressions += r.impressions;
  a.reach += r.reach;
  a.clicks += r.clicks;
  a.landingViews += r.landingViews;
  a.results += r.results;
  a.revenue += r.revenue;
  return a;
}

/** Daily totals per ad set: map adSetId -> array aligned with dataset.dates. */
export function dailyByAdSet(ds: Dataset): Map<string, Agg[]> {
  const idx = new Map(ds.dates.map((d, i) => [d, i]));
  const out = new Map<string, Agg[]>();
  for (const s of ds.adSets) out.set(s.id, ds.dates.map(empty));
  for (const r of ds.insights) {
    const i = idx.get(r.date);
    const arr = out.get(r.adSetId);
    if (i === undefined || !arr) continue;
    add(arr[i], r);
  }
  return out;
}

function total(days: Agg[], from: number, to: number): Agg {
  const a = empty();
  for (let i = Math.max(0, from); i <= to && i < days.length; i++) add(a, days[i]);
  return a;
}

const cpa = (a: Agg) => (a.results > 0 ? a.spend / a.results : Infinity);
const cpm = (a: Agg) => (a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0);
const ctr = (a: Agg) => (a.impressions > 0 ? a.clicks / a.impressions : 0);
const freq = (a: Agg) => (a.reach > 0 ? a.impressions / a.reach : 0);

export function stripQuery(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

function registrableDomain(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.split('.').slice(-2).join('.');
  } catch {
    return url;
  }
}

function leakId(detector: DetectorId, adSetIds: string[], extra = ''): string {
  return `${detector}:${[...adSetIds].sort().join(',')}${extra ? ':' + extra : ''}`;
}

function series(label: string, dates: string[], values: number[], unit: Series['unit']): Series {
  return { label, dates, values: values.map((v) => round(v, unit === 'ratio' ? 4 : 0)), unit };
}

export function detectLeaks(ds: Dataset, opts: DetectOptions = {}): Leak[] {
  const cur = ds.account.currency;
  const m = (n: number) => money(n, cur);
  const daily = dailyByAdSet(ds);
  // The last day with any data. A fresh sync may not have today's rows yet.
  let last = ds.dates.length - 1;
  while (last > 0 && ![...daily.values()].some((d) => d[last].spend > 0)) last--;
  const frac = last === ds.dates.length - 1 ? Math.min(1, Math.max(0.05, opts.dayFraction ?? 1)) : 1;
  const byId = new Map(ds.adSets.map((s) => [s.id, s]));
  const active = ds.adSets.filter((s) => s.status === 'active');
  const name = (id: string) => byId.get(id)?.name ?? id;
  const names = (ids: string[]) =>
    ids.length === 1 ? `“${name(ids[0])}”` : ids.length === 2 ? `“${name(ids[0])}” and “${name(ids[1])}”` : `${ids.length} ad sets`;

  /** Days elapsed from index `from` to now, counting today by the fraction that has passed. */
  const elapsed = (from: number) => Math.max(frac, last - from + frac);

  const spendSince = (ids: string[], from: number) => sum(ids.map((id) => total(daily.get(id)!, from, last).spend));

  const leaks: Leak[] = [];
  const explained = new Set<string>();

  // ---------------------------------------------------------------- page + tracking (probe)
  const adsByUrl = new Map<string, Set<string>>();
  for (const ad of ds.ads) {
    const set = byId.get(ad.adSetId);
    if (!set || set.status !== 'active' || ad.status !== 'active') continue;
    const u = stripQuery(ad.landingUrl);
    if (!adsByUrl.has(u)) adsByUrl.set(u, new Set());
    adsByUrl.get(u)!.add(ad.adSetId);
  }
  const adIdsFor = (setIds: string[], url?: string) =>
    ds.ads.filter((a) => setIds.includes(a.adSetId) && (!url || stripQuery(a.landingUrl) === url)).map((a) => a.id);

  const landingRates = active
    .map((s) => total(daily.get(s.id)!, last - 6, last))
    .filter((a) => a.clicks > 0)
    .map((a) => a.landingViews / a.clicks);
  const typicalLanding = median(landingRates);

  for (const probe of ds.probes) {
    const setIds = [...(adsByUrl.get(probe.url) ?? [])];
    if (setIds.length === 0 || probe.state !== 'issue') continue;
    const sinceIdx = probe.issueSince ? Math.max(0, ds.dates.indexOf(probe.issueSince)) : Math.max(0, last - 6);
    const since = ds.dates[sinceIdx];
    const totalSince = spendSince(setIds, sinceIdx);
    const perDay = totalSince / elapsed(sinceIdx);
    const adIds = adIdsFor(setIds, probe.url);
    const base = { adSetIds: setIds, adIds, since, totalSince: round(totalSince), opportunity: false };
    const probeEvidence = (facts: { label: string; value: string }[]) => ({ kind: 'probe' as const, probeUrl: probe.url, facts });
    const pausable: SuggestedAction = { kind: 'pause', label: `Pause ${setIds.length === 1 ? 'the ad set' : setIds.length + ' ad sets'} until it's fixed`, adSetIds: setIds, changesAccount: true };
    const recheck = (label: string): SuggestedAction => ({ kind: 'recheck', label, adSetIds: setIds, changesAccount: false });

    const brokenStatus = probe.status !== null && probe.status >= 400;
    const offDomain = probe.finalUrl !== null && registrableDomain(probe.finalUrl) !== registrableDomain(probe.url);
    if (brokenStatus || offDomain) {
      leaks.push({
        ...base,
        id: leakId('P1', setIds),
        detector: 'P1',
        step: 'page',
        title: brokenStatus ? `Your ad sends people to a page that's gone (${probe.status})` : 'Your ad lands on a different website',
        summary: `${names(setIds)} ${setIds.length > 1 ? 'send' : 'sends'} paid clicks to ${shortPath(probe.url)}, which ${brokenStatus ? `returns ${probe.status}` : 'ends on another domain'} since ${shortDate(since)}. ${m(totalSince)} spent since then.`,
        perDay: round(perDay),
        confidence: 'high',
        evidence: probeEvidence([
          { label: 'Page status', value: String(probe.status) },
          { label: 'Broken since', value: shortDate(since) },
          { label: 'Spent since', value: m(totalSince) },
        ]),
        fixSteps: ['Restore the page, or point the ad at a live page.', 'Tap “Recheck page” and we open it again on a phone.', 'Turn the ad set back on once it loads.'],
        action: pausable,
      });
      setIds.forEach((id) => explained.add(id));
    }

    if (probe.loadMs !== null && probe.loadMs > THRESHOLDS.P2_loadMs) {
      const agg = total(mergeDays(setIds.map((id) => daily.get(id)!)), last - 6, last);
      const rate = agg.clicks > 0 ? agg.landingViews / agg.clicks : 0;
      if (rate < THRESHOLDS.P2_landingRate) {
        const lost = Math.max(0, 1 - rate / Math.max(rate, typicalLanding));
        leaks.push({
          ...base,
          id: leakId('P2', setIds),
          detector: 'P2',
          step: 'page',
          title: `Page takes ${(probe.loadMs / 1000).toFixed(1)} s on phones`,
          summary: `${shortPath(probe.url)} takes ${(probe.loadMs / 1000).toFixed(1)} s to load on a phone. Only ${pct(rate)} of paid clicks wait for it, against ${pct(typicalLanding)} on your other pages.`,
          perDay: round(perDay * lost),
          totalSince: round(totalSince * lost),
          confidence: 'high',
          evidence: probeEvidence([
            { label: 'Load time on a phone', value: `${(probe.loadMs / 1000).toFixed(1)} s` },
            { label: 'Clicks that reach the page', value: pct(rate) },
            { label: 'Your other pages', value: pct(typicalLanding) },
            { label: 'Paid clicks lost', value: pct(lost) },
          ]),
          fixSteps: ['Swap the hero video for an image under 300 KB.', 'Load chat and review widgets after the page is ready.', 'Tap “Recheck page” when it’s live.'],
          action: recheck('I made it faster, recheck'),
        });
        setIds.forEach((id) => explained.add(id));
      }
    }

    if (probe.tagsKept === false) {
      leaks.push({
        ...base,
        id: leakId('P3', setIds),
        detector: 'P3',
        step: 'click',
        title: 'A redirect drops your ad’s tags',
        summary: `The link in ${names(setIds)} goes through ${probe.redirects.length - 1} redirect and arrives without utm and fbclid, so sales from it can't be matched to the ad.`,
        perDay: round(perDay),
        confidence: 'high',
        evidence: probeEvidence([
          { label: 'Redirects', value: String(probe.redirects.length - 1) },
          { label: 'Tags after redirect', value: 'Lost' },
          { label: 'Spent since', value: m(totalSince) },
        ]),
        fixSteps: ['Link the ad straight to the final page, or', 'set the short link to pass the query string through.', 'Tap “Recheck page”.'],
        action: recheck('I fixed the link, recheck'),
      });
      setIds.forEach((id) => explained.add(id));
    }

    if (probe.status === 200 && probe.pixelIds.length === 0 && !probe.consentBanner) {
      leaks.push({
        ...base,
        id: leakId('T1', setIds),
        detector: 'T1',
        step: 'tracking',
        title: 'No pixel on the page your ads open',
        summary: `${shortPath(probe.url)} has no Meta pixel since ${shortDate(since)}, so ${names(setIds)} ${setIds.length > 1 ? 'are' : 'is'} optimising blind. ${m(totalSince)} spent since.`,
        perDay: round(perDay),
        confidence: 'high',
        evidence: probeEvidence([
          { label: 'Pixel requests seen', value: '0' },
          { label: 'Missing since', value: shortDate(since) },
          { label: 'Spent since', value: m(totalSince) },
        ]),
        fixSteps: ['Add the pixel to this page’s template (it was on the old one).', 'Fire Lead when the quiz is finished.', 'Tap “Recheck page”.'],
        action: recheck('I added the pixel, recheck'),
      });
      setIds.forEach((id) => explained.add(id));
    }

    const promoted = new Set(setIds.map((id) => byId.get(id)!.pixelId));
    if (probe.pixelIds.length > 0 && !probe.pixelIds.some((p) => promoted.has(p))) {
      leaks.push({
        ...base,
        id: leakId('T2', setIds),
        detector: 'T2',
        step: 'tracking',
        title: 'The page sends sales to a different pixel',
        summary: `${shortPath(probe.url)} fires pixel …${probe.pixelIds[0].slice(-4)}, but ${names(setIds)} ${setIds.length > 1 ? 'optimise' : 'optimises'} on …${[...promoted][0].slice(-4)}. Meta can't see these sales.`,
        perDay: round(perDay),
        confidence: 'high',
        evidence: probeEvidence([
          { label: 'Pixel on the page', value: `…${probe.pixelIds[0].slice(-4)}` },
          { label: 'Pixel the ad set uses', value: `…${[...promoted][0].slice(-4)}` },
          { label: 'Since', value: shortDate(since) },
        ]),
        fixSteps: [`Replace pixel …${probe.pixelIds[0].slice(-4)} with …${[...promoted][0].slice(-4)} on this page.`, 'Tap “Recheck page”.'],
        action: recheck('I swapped the pixel, recheck'),
      });
      setIds.forEach((id) => explained.add(id));
    }

    const seen = new Map<string, number>();
    for (const e of probe.events) if (!e.eventId) seen.set(e.name, (seen.get(e.name) ?? 0) + 1);
    const dupes = [...seen.keys()];
    if (dupes.length > 0) {
      const before = total(mergeDays(setIds.map((id) => daily.get(id)!)), Math.max(0, sinceIdx - 10), sinceIdx - 1);
      const after = total(mergeDays(setIds.map((id) => daily.get(id)!)), sinceIdx, last);
      const ratio = before.clicks > 0 && after.clicks > 0 && before.results > 0 ? (after.results / after.clicks) / (before.results / before.clicks) : 0;
      leaks.push({
        ...base,
        id: leakId('T4', setIds),
        detector: 'T4',
        step: 'tracking',
        title: 'Sales are being counted twice',
        summary: `${shortPath(probe.url)} sends ${dupes.join(' and ')} twice with no event ID. Since ${shortDate(since)} reported results per click are ${ratio ? ratio.toFixed(1) + '×' : 'well above'} what they were, so this ad set looks better than it is.`,
        perDay: round(perDay),
        confidence: 'medium',
        evidence: {
          kind: 'probe',
          probeUrl: probe.url,
          facts: [
            { label: 'Events sent twice', value: dupes.join(', ') },
            { label: 'Results per click vs before', value: ratio ? `${ratio.toFixed(1)}×` : '—' },
            { label: 'Since', value: shortDate(since) },
          ],
        },
        fixSteps: ['Remove the second pixel snippet (theme + app both add one).', 'Or send the same event ID from both.', 'Tap “Recheck page”.'],
        action: recheck('I removed the duplicate, recheck'),
      });
      setIds.forEach((id) => explained.add(id));
    }
  }

  // ---------------------------------------------------------------- T3: sales went silent
  const silent: { id: string; start: number }[] = [];
  for (const s of active) {
    if (explained.has(s.id)) continue;
    const days = daily.get(s.id)!;
    let start = last + 1;
    while (start - 1 >= 0 && days[start - 1].results === 0 && days[start - 1].spend > 0) start--;
    if (start > last - 1) continue; // need two zero days, today counts as one
    const before = total(days, Math.max(s.startDay, start - 10), start - 1);
    const beforeDays = start - Math.max(s.startDay, start - 10);
    if (beforeDays < 5) continue;
    const after = total(days, start, last);
    const beforeClicks = before.clicks / beforeDays;
    const afterClicks = after.clicks / elapsed(start);
    // A quiet spell only counts when it would be very unlikely by chance: at the old rate we'd
    // expect at least 3 sales in the silent days (a 5% chance of seeing none).
    const expectedSales = (before.results / beforeDays) * elapsed(start);
    if (
      before.results / beforeDays >= THRESHOLDS.T3_minResultsPerDay &&
      expectedSales >= 3 &&
      afterClicks >= THRESHOLDS.T3_clicksKept * beforeClicks
    ) {
      silent.push({ id: s.id, start });
    }
  }
  const groups = new Map<number, string[]>();
  for (const x of silent) {
    const key = [...groups.keys()].find((k) => Math.abs(k - x.start) <= 1) ?? x.start;
    groups.set(key, [...(groups.get(key) ?? []), x.id]);
  }
  for (const [startIdx, ids] of groups) {
    if (ids.length < 2) continue; // one ad set going quiet is S1's job; a whole group at once is tracking
    const merged = mergeDays(ids.map((id) => daily.get(id)!));
    const totalSince = spendSince(ids, startIdx);
    const since = ds.dates[startIdx];
    const before = total(merged, startIdx - 10, startIdx - 1);
    const beforePerDay = before.results / 10;
    leaks.push({
      id: leakId('T3', ids),
      detector: 'T3',
      step: 'tracking',
      opportunity: false,
      title: `Sales went silent on ${shortDate(since)}`,
      summary: `${ids.length} ad sets were getting about ${beforePerDay.toFixed(1)} sales a day, then 0 from ${shortDate(since)} while clicks held steady. That pattern is a tracking break, not a bad ad. ${m(totalSince)} spent since.`,
      adSetIds: ids,
      adIds: adIdsFor(ids),
      since,
      perDay: round(totalSince / elapsed(startIdx)),
      totalSince: round(totalSince),
      confidence: 'high',
      evidence: {
        kind: 'series',
        series: [
          series('Sales reported', ds.dates, merged.map((d) => d.results), 'count'),
          series('Link clicks', ds.dates, merged.map((d) => d.clicks), 'count'),
        ],
        changeIndex: startIdx,
        facts: [
          { label: 'Sales a day before', value: beforePerDay.toFixed(1) },
          { label: 'Sales since', value: '0' },
          { label: 'Clicks a day since', value: String(Math.round(total(merged, startIdx, last).clicks / elapsed(startIdx))) },
          { label: 'Spent since', value: m(totalSince) },
        ],
      },
      fixSteps: [
        'Open your checkout’s thank-you page and check the Purchase event still fires (an app update often removes it).',
        'In Events Manager, test a purchase and confirm it arrives.',
        'Tap “I fixed it” and we watch tomorrow’s sales.',
      ],
      action: { kind: 'mark-fixed', label: 'I fixed tracking, watch it', adSetIds: ids, changesAccount: false },
    });
    ids.forEach((id) => explained.add(id));
  }

  // ---------------------------------------------------------------- spend step
  const week = (id: string) => total(daily.get(id)!, last - 6, last);
  const objective = new Map(ds.campaigns.map((c) => [c.id, c.objective]));
  const objectiveOf = (s: AdSet) => objective.get(s.campaignId) ?? 'sales';
  // Leads and sales cost very different amounts, so each is compared only with its own kind.
  const typicalCpa = (s: AdSet) =>
    median(active.filter((o) => objectiveOf(o) === objectiveOf(s)).map((o) => week(o.id)).filter((a) => a.results > 0).map(cpa));

  for (const s of active) {
    if (explained.has(s.id)) continue;
    const days = daily.get(s.id)!;
    const w = week(s.id);
    const adIds = adIdsFor([s.id]);
    const target = ds.account.targetCost;

    // S1 spending, not selling
    if (w.results === 0 && w.spend >= THRESHOLDS.S1_spendMultiple * target) {
      let start = last;
      while (start - 1 >= s.startDay && days[start - 1].results === 0) start--;
      const totalSince = total(days, start, last).spend;
      leaks.push({
        id: leakId('S1', [s.id]),
        detector: 'S1',
        step: 'spend',
        opportunity: false,
        title: `“${s.name}” spends and never sells`,
        summary: `${m(totalSince)} spent since ${shortDate(ds.dates[start])} with 0 sales. Your target is ${m(target)} per sale.`,
        adSetIds: [s.id],
        adIds,
        since: ds.dates[start],
        perDay: round(totalSince / elapsed(start)),
        totalSince: round(totalSince),
        confidence: 'high',
        evidence: {
          kind: 'series',
          series: [series('Spend', ds.dates, days.map((d) => d.spend), 'money'), series('Sales', ds.dates, days.map((d) => d.results), 'count')],
          changeIndex: start,
          facts: [
            { label: 'Spent since', value: m(totalSince) },
            { label: 'Sales since', value: '0' },
            { label: 'Target per sale', value: m(target) },
          ],
        },
        fixSteps: ['Pause it. Its budget is better used on ad sets that sell.', 'If you want to keep testing, try a new creative before restarting.'],
        action: { kind: 'pause', label: 'Pause ad set', adSetIds: [s.id], changesAccount: true },
      });
      continue;
    }

    // S2 cost per result too high
    const activeDays = days.slice(last - 6).filter((d) => d.spend > 0).length;
    const medianCpa = typicalCpa(s);
    if (w.results > 0 && medianCpa > 0 && cpa(w) >= THRESHOLDS.S2_costMultiple * medianCpa && activeDays >= THRESHOLDS.S2_minDays) {
      const excess = w.spend - w.results * medianCpa;
      const cut = Math.round((s.dailyBudget * THRESHOLDS.L1_moveShare) / 10) * 10;
      leaks.push({
        id: leakId('S2', [s.id]),
        detector: 'S2',
        step: 'spend',
        opportunity: false,
        title: `“${s.name}” pays ${(cpa(w) / medianCpa).toFixed(1)}× more per sale`,
        summary: `Each sale costs ${m(cpa(w))} here, against ${m(medianCpa)} for your typical ad set. Over 7 days that's ${m(excess)} more than it should be.`,
        adSetIds: [s.id],
        adIds,
        since: ds.dates[last - 6],
        perDay: round(excess / elapsed(last - 6)),
        totalSince: round(excess),
        confidence: 'medium',
        evidence: {
          kind: 'series',
          series: [series('Cost per sale', ds.dates, days.map((d) => (d.results > 0 ? d.spend / d.results : 0)), 'money')],
          changeIndex: last - 6,
          facts: [
            { label: 'Cost per sale (7 days)', value: m(cpa(w)) },
            { label: 'Typical ad set', value: m(medianCpa) },
            { label: 'Extra paid (7 days)', value: m(excess) },
          ],
        },
        fixSteps: [`Cut the budget by ${m(cut)} a day.`, 'Move that money to your best ad set (see the green card).'],
        action: { kind: 'cut-budget', label: `Cut budget by ${m(cut)}/day`, adSetIds: [s.id], amount: cut, changesAccount: true },
      });
      continue;
    }

    // S3 tired audience
    const recent = total(days, last - 2, last);
    const firstIdx = Math.max(s.startDay, days.findIndex((d) => d.spend > 0));
    const early = total(days, firstIdx, firstIdx + 4);
    if (freq(recent) >= THRESHOLDS.S3_frequency && ctr(early) > 0 && ctr(recent) <= (1 - THRESHOLDS.S3_ctrDrop) * ctr(early)) {
      let start = last;
      while (start - 1 >= firstIdx && freq(days[start - 1]) >= THRESHOLDS.S3_frequency) start--;
      const drop = 1 - ctr(recent) / ctr(early);
      const totalSince = total(days, start, last).spend * drop;
      leaks.push({
        id: leakId('S3', [s.id]),
        detector: 'S3',
        step: 'spend',
        opportunity: false,
        title: `People have seen “${s.name}” too often`,
        summary: `The same people now see it ${freq(recent).toFixed(1)} times and clicks are down ${pct(drop)} from its first days. You pay the same for fewer clicks.`,
        adSetIds: [s.id],
        adIds,
        since: ds.dates[start],
        perDay: round(totalSince / elapsed(start)),
        totalSince: round(totalSince),
        confidence: 'medium',
        evidence: {
          kind: 'series',
          series: [
            series('Click rate', ds.dates, days.map((d) => ctr(d)), 'ratio'),
            series('Times seen', ds.dates, days.map((d) => freq(d)), 'ratio'),
          ],
          changeIndex: start,
          facts: [
            { label: 'Times seen (3 days)', value: freq(recent).toFixed(1) },
            { label: 'Click rate first days', value: pct(ctr(early), 2) },
            { label: 'Click rate now', value: pct(ctr(recent), 2) },
          ],
        },
        fixSteps: ['Swap in 2 fresh creatives.', 'Or widen the audience so new people see it.'],
        action: { kind: 'mark-fixed', label: 'I swapped the creative', adSetIds: [s.id], changesAccount: false },
      });
      continue;
    }

    // S4 price spike
    const prior = days.slice(Math.max(firstIdx, last - 8), last - 1).filter((d) => d.impressions > 0).map(cpm);
    if (prior.length >= 5) {
      const base = median(prior);
      let start = last + 1;
      while (start - 1 > firstIdx && cpm(days[start - 1]) >= (1 + THRESHOLDS.S4_cpmRise) * base) start--;
      if (start <= last) {
        const spike = total(days, start, last);
        const priorRes = total(days, last - 8, start - 1);
        const priorDays = Math.max(1, start - (last - 8));
        // Small accounts get a handful of sales a day, so allow one extra sale of noise.
        const resultsFlat = spike.results / elapsed(start) <= (priorRes.results / priorDays) * 1.25 + 1;
        if (resultsFlat) {
          const premium = spike.spend * (1 - base / cpm(spike));
          leaks.push({
            id: leakId('S4', [s.id]),
            detector: 'S4',
            step: 'spend',
            opportunity: false,
            title: `Ads on “${s.name}” got ${pct(cpm(spike) / base - 1)} pricier`,
            summary: `It costs ${m(cpm(spike))} to reach 1,000 people since ${shortDate(ds.dates[start])}, up from ${m(base)}, with no extra sales.`,
            adSetIds: [s.id],
            adIds,
            since: ds.dates[start],
            perDay: round(premium / elapsed(start)),
            totalSince: round(premium),
            confidence: 'medium',
            evidence: {
              kind: 'series',
              series: [series('Cost per 1,000 views', ds.dates, days.map((d) => cpm(d)), 'money')],
              changeIndex: start,
              facts: [
                { label: 'Usual cost per 1,000', value: m(base) },
                { label: 'Since the jump', value: m(cpm(spike)) },
                { label: 'Extra paid', value: m(premium) },
              ],
            },
            fixSteps: ['Pause for 24 hours; spikes like this usually pass.', 'We remind you to turn it back on.'],
            action: { kind: 'pause', label: 'Pause for 24 h', adSetIds: [s.id], changesAccount: true },
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------- L1: winners starved
  const flagged = new Set(leaks.flatMap((l) => l.adSetIds));
  const totalBudget = sum(active.map((s) => s.dailyBudget));
  const candidates = active
    .filter((s) => !flagged.has(s.id) && objectiveOf(s) === 'sales')
    .map((s) => ({ s, w: week(s.id) }))
    .filter((x) => x.w.results >= THRESHOLDS.L1_minResults && cpa(x.w) <= ds.account.targetCost)
    .sort((a, b) => cpa(a.w) - cpa(b.w));
  const winner = candidates[0];
  if (winner && totalBudget > 0 && winner.s.dailyBudget / totalBudget < THRESHOLDS.L1_maxShare) {
    // Take the money from the costliest ad set that still has budget to give.
    const donor =
      active
        .filter((s) => s.id !== winner.s.id && objectiveOf(s) === 'sales' && s.dailyBudget >= 100)
        .map((s) => ({ s, c: cpa(week(s.id)) }))
        .filter((x) => Number.isFinite(x.c) && x.c > 1.5 * ds.account.targetCost && !leaks.some((l) => l.step === 'tracking' && l.adSetIds.includes(x.s.id)))
        .sort((a, b) => b.c - a.c)[0]?.s ?? null;
    if (donor) {
      const dw = week(donor.id);
      const amount = Math.round((donor.dailyBudget * THRESHOLDS.L1_moveShare) / 10) * 10;
      const gain = amount * (1 - cpa(winner.w) / cpa(dw));
      const extraSales = (amount * 7) / cpa(winner.w) - (amount * 7) / cpa(dw);
      leaks.push({
        id: leakId('L1', [winner.s.id]),
        detector: 'L1',
        step: 'sale',
        opportunity: true,
        title: `Your best ad set gets ${pct(winner.s.dailyBudget / totalBudget)} of the budget`,
        summary: `“${winner.s.name}” sells at ${m(cpa(winner.w))} per sale. Moving ${m(amount)} a day from “${donor.name}” (${m(cpa(dw))} per sale) could bring about ${Math.round(extraSales)} more sales a week for the same spend.`,
        adSetIds: [winner.s.id],
        adIds: adIdsFor([winner.s.id]),
        since: ds.dates[last - 6],
        perDay: round(gain),
        totalSince: round(gain * 7),
        confidence: 'medium',
        evidence: {
          kind: 'series',
          series: [series('Sales', ds.dates, daily.get(winner.s.id)!.map((d) => d.results), 'count')],
          facts: [
            { label: 'Its cost per sale', value: m(cpa(winner.w)) },
            { label: 'Share of budget', value: pct(winner.s.dailyBudget / totalBudget) },
            { label: 'Move per day', value: m(amount) },
            { label: 'Extra sales a week', value: String(Math.round(extraSales)) },
          ],
        },
        fixSteps: [`Move ${m(amount)} a day from “${donor.name}” to “${winner.s.name}”.`, 'Big jumps restart learning, so we move 30% at a time.'],
        action: { kind: 'move-budget', label: `Move ${m(amount)}/day here`, adSetIds: [donor.id], toAdSetId: winner.s.id, amount, changesAccount: true },
      });
    }
  }

  return leaks.sort((a, b) => Number(a.opportunity) - Number(b.opportunity) || b.perDay - a.perDay);
}

function mergeDays(arrays: Agg[][]): Agg[] {
  if (arrays.length === 0) return [];
  return arrays[0].map((_, i) => arrays.reduce((acc, arr) => add(acc, arr[i]), empty()));
}

export function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.startsWith('go.') ? u.hostname + u.pathname : u.pathname;
  } catch {
    return url;
  }
}

/** The step of the chain each detector belongs to, for chips and the chain drawing. */
export const DETECTOR_STEP: Record<DetectorId, Step> = {
  S1: 'spend', S2: 'spend', S3: 'spend', S4: 'spend',
  P1: 'page', P2: 'page', P3: 'click',
  T1: 'tracking', T2: 'tracking', T3: 'tracking', T4: 'tracking',
  L1: 'sale',
};

export function probeFor(ds: Dataset, url: string): Probe | undefined {
  return ds.probes.find((p) => p.url === stripQuery(url));
}

export function adSetsFor(ds: Dataset, ids: string[]): AdSet[] {
  return ids.map((id) => ds.adSets.find((s) => s.id === id)).filter((s): s is AdSet => !!s);
}
