// Ask: answers questions about the account from its own rows. Every number comes from the data.
// In production the open model phrases the answer from the same facts; this module is both the
// grounding step and the fallback. Anything it can't ground gets an honest "not in your data".

import type { Dataset, Leak } from './types';
import { dailyByAdSet } from './detectors';
import { money, shortDate, sum, weekday } from './util';

export interface AskAnswer {
  found: boolean;
  text: string;
  sources: { label: string; value: string }[];
}

export const ASK_SUGGESTIONS = [
  'Why did yesterday cost so much?',
  'Which ad set is my worst?',
  'Is my pixel working?',
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function findDay(q: string, dates: string[]): number | null {
  const last = dates.length - 1;
  if (/\btoday\b/.test(q)) return last;
  if (/\byesterday\b/.test(q)) return last - 1;
  const wd = WEEKDAYS.findIndex((w) => q.includes(w));
  if (wd >= 0) {
    for (let i = last - 1; i >= 0; i--) if (weekday(dates[i]).toLowerCase() === WEEKDAYS[wd]) return i;
  }
  const m = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (m) {
    const i = dates.findIndex((d) => shortDate(d).toLowerCase() === `${m[1]} ${Number(m[2])}`);
    if (i >= 0) return i;
  }
  return null;
}

export function ask(question: string, ds: Dataset, leaks: Leak[]): AskAnswer {
  const q = question.toLowerCase().trim();
  const cur = ds.account.currency;
  const m = (n: number) => money(n, cur);
  const daily = dailyByAdSet(ds);
  const last = ds.dates.length - 1;
  const name = (id: string) => ds.adSets.find((s) => s.id === id)?.name ?? id;
  const totalOn = (i: number) => {
    let spend = 0;
    let results = 0;
    for (const arr of daily.values()) {
      spend += arr[i].spend;
      results += arr[i].results;
    }
    return { spend, results };
  };

  if (!q) return { found: false, text: 'Ask about spend, sales, cost per sale, pages or tracking.', sources: [] };

  const day = findDay(q, ds.dates);

  // "Why did Tuesday cost so much?"
  if (day !== null && /(why|cost|expensive|spend|spent|so much|high)/.test(q)) {
    if (day < 0) return notInData();
    const d = totalOn(day);
    const prev = Array.from({ length: 7 }, (_, k) => day - 1 - k).filter((i) => i >= 0).map(totalOn);
    const avgSpend = prev.length ? sum(prev.map((p) => p.spend)) / prev.length : d.spend;
    const avgResults = prev.length ? sum(prev.map((p) => p.results)) / prev.length : d.results;
    const movers = ds.adSets
      .map((s) => {
        const arr = daily.get(s.id)!;
        const before = arr.slice(Math.max(0, day - 7), day);
        const base = before.length ? sum(before.map((x) => x.spend)) / before.length : 0;
        return { s, diff: arr[day].spend - base, results: arr[day].results, spend: arr[day].spend };
      })
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 2);
    const wasted = ds.adSets
      .map((s) => ({ s, row: daily.get(s.id)![day] }))
      .filter((x) => x.row.spend > 0 && x.row.results === 0)
      .sort((a, b) => b.row.spend - a.row.spend);
    const label = day === last ? 'Today so far' : day === last - 1 ? 'Yesterday' : `${weekday(ds.dates[day])} ${shortDate(ds.dates[day])}`;
    const cps = d.results ? m(d.spend / d.results) : 'no sales';
    const parts = [
      `${label} you spent ${m(d.spend)} for ${d.results} sales (${cps} each). The 7 days before averaged ${m(avgSpend)} for ${avgResults.toFixed(1)} sales.`,
    ];
    if (wasted.length) {
      parts.push(`${m(sum(wasted.map((w) => w.row.spend)))} of it went to ${wasted.length} ad sets with no sale, led by “${wasted[0].s.name}” (${m(wasted[0].row.spend)}).`);
    }
    if (movers[0] && movers[0].diff > 50) parts.push(`The biggest rise was “${movers[0].s.name}”, ${m(movers[0].diff)} above its usual day.`);
    return {
      found: true,
      text: parts.join(' '),
      sources: [
        { label: `Spend ${shortDate(ds.dates[day])}`, value: m(d.spend) },
        { label: `Sales ${shortDate(ds.dates[day])}`, value: String(d.results) },
        { label: '7-day average spend', value: m(avgSpend) },
        ...wasted.slice(0, 2).map((w) => ({ label: `${w.s.name} · no sale`, value: m(w.row.spend) })),
      ],
    };
  }

  // Worst / best ad set
  if (/(worst|best|top|winner|loser)/.test(q) && /(ad ?set|ad|campaign|audience)?/.test(q)) {
    const sales = new Set(ds.campaigns.filter((c) => c.objective === 'sales').map((c) => c.id));
    const rows = ds.adSets
      .filter((s) => sales.has(s.campaignId))
      .map((s) => {
        const w = daily.get(s.id)!.slice(last - 6);
        const spend = sum(w.map((x) => x.spend));
        const results = sum(w.map((x) => x.results));
        return { s, spend, results, cps: results ? spend / results : Infinity };
      })
      .filter((r) => r.spend > 0);
    const worstFirst = /(worst|loser)/.test(q);
    rows.sort((a, b) => (worstFirst ? b.cps - a.cps || b.spend - a.spend : a.cps - b.cps));
    const top = rows[0];
    if (!top) return notInData();
    const cps = Number.isFinite(top.cps) ? `${m(top.cps)} per sale` : 'no sales at all';
    return {
      found: true,
      text: `${worstFirst ? 'Your worst' : 'Your best'} ad set over the last 7 days is “${top.s.name}”: ${m(top.spend)} spent, ${top.results} sales, ${cps}. Your target is ${m(ds.account.targetCost)}.`,
      sources: rows.slice(0, 3).map((r) => ({
        label: r.s.name,
        value: Number.isFinite(r.cps) ? `${m(r.cps)}/sale` : `${m(r.spend)}, 0 sales`,
      })),
    };
  }

  // Pixel / tracking
  if (/(pixel|tracking|track|purchase event|conversion api|capi|events?)/.test(q)) {
    const t = leaks.filter((l) => l.step === 'tracking');
    const unconfirmed = ds.probes.filter((p) => p.state === 'unconfirmed').length;
    if (t.length === 0) {
      return { found: true, text: `No tracking problems right now. We checked ${ds.probes.length} pages${unconfirmed ? `; ${unconfirmed} we couldn't confirm because of a cookie banner` : ''}.`, sources: [] };
    }
    return {
      found: true,
      text: `${t.length} tracking ${t.length === 1 ? 'problem' : 'problems'}: ${t.map((l) => l.title.toLowerCase()).join('; ')}. Together about ${m(sum(t.map((l) => l.perDay)))} a day is spent with Meta optimising on wrong or missing sales.`,
      sources: t.map((l) => ({ label: l.title, value: `${m(l.perDay)}/day` })),
    };
  }

  // Spend totals
  if (/(how much|total|spent|spend)/.test(q)) {
    const n = /month|30/.test(q) ? 30 : 7;
    const idx = Array.from({ length: n }, (_, k) => last - k).filter((i) => i >= 0);
    const spend = sum(idx.map((i) => totalOn(i).spend));
    const results = sum(idx.map((i) => totalOn(i).results));
    return {
      found: true,
      text: `In the last ${n} days you spent ${m(spend)} and Meta reported ${results} sales and leads (${results ? m(spend / results) : '—'} each). Today is still running.`,
      sources: [
        { label: `Spend, ${n} days`, value: m(spend) },
        { label: `Results, ${n} days`, value: String(results) },
      ],
    };
  }

  // Leaks
  if (/(leak|losing|lose|waste|wasting|problem|wrong|issue)/.test(q)) {
    const open = leaks.filter((l) => !l.opportunity);
    if (!open.length) return { found: true, text: 'Nothing is leaking right now.', sources: [] };
    return {
      found: true,
      text: `${open.length} leaks, about ${m(sum(open.map((l) => l.perDay)))} a day. The biggest: ${open[0].title.toLowerCase()} (${m(open[0].perDay)} a day).`,
      sources: open.slice(0, 4).map((l) => ({ label: l.title, value: `${m(l.perDay)}/day` })),
    };
  }

  return notInData();
}

function notInData(): AskAnswer {
  return {
    found: false,
    text: "That's not in your data. I can answer about spend, sales, cost per sale, your landing pages and tracking over the last 30 days.",
    sources: [],
  };
}
