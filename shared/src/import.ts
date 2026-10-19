// Turns a Meta Ads Manager export (CSV, ad level, broken down by day) into a Dataset, in the browser.
// Ads Manager lets people pick their own columns, so headers are matched by meaning, not position.
// Nothing here leaves the device.

import type { Account, Ad, AdSet, Campaign, Currency, Dataset, InsightRow, Status } from './types';
import { median } from './util';

export class ImportError extends Error {
  constructor(public code: 'empty' | 'no_day' | 'no_spend' | 'no_names' | 'no_rows', message: string) {
    super(message);
  }
}

/** RFC 4180 CSV (quotes, doubled quotes, commas and newlines inside quotes). Also reads tab- or semicolon-separated. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? src.length : src.indexOf('\n'));
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

type Field = 'day' | 'start' | 'campaign' | 'adset' | 'ad' | 'adId' | 'adsetId' | 'campaignId' | 'spend' | 'impressions' | 'reach' | 'clicks' | 'allClicks' | 'landing' | 'purchases' | 'results' | 'leads' | 'revenue' | 'url' | 'budget' | 'delivery' | 'adsetDelivery';

const ALIASES: [Field, RegExp][] = [
  ['day', /^(day|date|reporting day)$/],
  ['start', /^reporting starts?$/],
  ['campaignId', /^campaign id$/],
  ['adsetId', /^ad set id$/],
  ['adId', /^ad id$/],
  ['campaign', /^campaign( name)?$/],
  ['adset', /^ad set( name)?$/],
  ['ad', /^ad( name)?$/],
  ['spend', /^(amount spent|spend|cost|amount spent \(.*\))$/],
  ['impressions', /^impressions$/],
  ['reach', /^reach$/],
  ['clicks', /^(link clicks|outbound clicks|unique link clicks)$/],
  ['allClicks', /^clicks( \(all\))?$/],
  ['landing', /^(landing page views|website landing page views)$/],
  ['purchases', /^(purchases|website purchases|meta pixel purchases|on-facebook purchases)$/],
  ['leads', /^(leads|website leads|meta leads|leads \(form\))$/],
  ['results', /^results$/],
  ['revenue', /^((website )?purchases? conversion value|purchase roas conversion value|conversion value|results value|website purchase conversion value)$/],
  ['url', /^(website url|link \(ad settings\)|link|destination url|landing page url|url|ad link)$/],
  ['budget', /^(ad set budget|budget|daily budget)$/],
  ['delivery', /^(delivery|ad delivery|delivery status|ad delivery status)$/],
  ['adsetDelivery', /^ad set delivery$/],
];

const CURRENCIES: Currency[] = ['INR', 'USD', 'EUR', 'GBP'];

function normHeader(h: string): { key: string; currency: string | null } {
  const raw = h.trim().toLowerCase();
  const cur = raw.match(/\(([a-z]{3})\)\s*$/);
  const key = raw.replace(/\s*\([a-z]{3}\)\s*$/, '').replace(/\s+/g, ' ').trim();
  return { key, currency: cur ? cur[1].toUpperCase() : null };
}

/** "1,234.50", "₹1 234", "" → number (0 for blank). */
export function num(v: string | undefined): number {
  if (!v) return 0;
  const s = v.replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  // 1.234,56 (European) vs 1,234.56
  const euro = /,\d{1,2}$/.test(s) && s.includes('.');
  const n = Number(euro ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Ads Manager dates: 2026-10-12, 12/10/2026 (day first), 10/12/2026 (month first, guessed by range), 12-Oct-2026. */
export function isoDate(v: string, monthFirst = false): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [d, mo] = monthFirst ? [b, a] : a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return null;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface ImportOptions {
  accountName?: string;
  /** What one sale (or lead) may cost. Defaults to the median cost per result across the window. */
  targetCost?: number;
  /** Used for ads whose rows carry no link. */
  fallbackUrl?: string;
  /** The pixel the account optimises on, if known (enables "wrong pixel" checks). */
  pixelId?: string;
  maxDays?: number;
}

export interface ImportSummary {
  rows: number;
  days: number;
  campaigns: number;
  adSets: number;
  ads: number;
  spend: number;
  results: number;
  urls: string[];
  missing: string[];
  resultLabel: 'purchases' | 'leads' | 'results';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';

export function importAdsManager(text: string, opts: ImportOptions = {}): { dataset: Dataset; summary: ImportSummary } {
  const table = parseCsv(text);
  if (table.length < 2) throw new ImportError('empty', 'This file is empty. Export the report again from Ads Manager.');
  // Some exports start with a title row; the header is the first row that names a spend column.
  const headerAt = table.findIndex((r) => r.some((h) => /amount spent|^spend$|^cost$/i.test(normHeader(h).key)));
  if (headerAt === -1) throw new ImportError('no_spend', 'We couldn’t find “Amount spent” in this file. Add that column in Ads Manager and export again.');
  const header = table[headerAt].map(normHeader);
  const col: Partial<Record<Field, number>> = {};
  const found: { currency: string | null } = { currency: null };
  header.forEach((h, i) => {
    for (const [f, re] of ALIASES) {
      if (col[f] === undefined && re.test(h.key)) {
        col[f] = i;
        if (f === 'spend' && h.currency) found.currency = h.currency;
        break;
      }
    }
  });
  const dayCol = col.day ?? col.start;
  if (dayCol === undefined) throw new ImportError('no_day', 'This export has no day column. In Ads Manager choose Breakdown → By time → Day, then export again.');
  if (col.adset === undefined && col.adsetId === undefined) throw new ImportError('no_names', 'We need the “Ad set name” column. Export at the ad level (the Ads tab) and try again.');

  const body = table.slice(headerAt + 1).filter((r) => r[dayCol] && !/^(total|results from)/i.test(r[0] ?? ''));
  const get = (r: string[], f: Field) => (col[f] === undefined ? '' : (r[col[f]!] ?? '').trim());
  // date order: if any first part is > 12 it's day-first; if any second part > 12 it's month-first
  const monthFirst = body.some((r) => { const m = get(r, dayCol === col.day ? 'day' : 'start').match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}$/); return !!m && Number(m[2]) > 12; });
  const dateOf = (r: string[]) => isoDate(r[dayCol], monthFirst);

  // Same day reported twice with "Reporting starts" = a whole-range export, not daily.
  const parsedDates = body.map(dateOf).filter((d): d is string => !!d);
  if (!parsedDates.length) throw new ImportError('no_day', 'We couldn’t read the dates. Export with Breakdown → By time → Day.');
  const uniqueDates = [...new Set(parsedDates)].sort();
  if (uniqueDates.length < 2) throw new ImportError('no_day', 'Every row has the same date, so this isn’t broken down by day. In Ads Manager choose Breakdown → By time → Day, then export again.');

  const maxDays = opts.maxDays ?? 30;
  const last = uniqueDates[uniqueDates.length - 1];
  const first = uniqueDates[0] > addDays(last, -(maxDays - 1)) ? uniqueDates[0] : addDays(last, -(maxDays - 1));
  const dates: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) dates.push(d);

  const resultField: Field = col.purchases !== undefined ? 'purchases' : col.leads !== undefined ? 'leads' : 'results';
  const campaigns = new Map<string, Campaign>();
  const adSets = new Map<string, AdSet & { _delivery: string; _budget: number }>();
  const ads = new Map<string, Ad>();
  const insights = new Map<string, InsightRow>();
  const missing = new Set<string>();
  if (col.clicks === undefined && col.allClicks === undefined) missing.add('Link clicks');
  if (col.landing === undefined) missing.add('Landing page views');
  if (col.url === undefined && !opts.fallbackUrl) missing.add('Website URL');
  if (col.purchases === undefined && col.leads === undefined && col.results === undefined) missing.add('Purchases or Results');

  for (const r of body) {
    const date = dateOf(r);
    if (!date || date < first || date > last) continue;
    const cName = get(r, 'campaign') || 'Campaign';
    const cId = get(r, 'campaignId') || `c-${slug(cName)}`;
    const sName = get(r, 'adset') || get(r, 'adsetId');
    const sId = get(r, 'adsetId') || `as-${slug(cName)}-${slug(sName)}`;
    const aName = get(r, 'ad') || sName;
    const aId = get(r, 'adId') || `ad-${sId}-${slug(aName)}`;
    if (!campaigns.has(cId)) campaigns.set(cId, { id: cId, name: cName, objective: resultField === 'leads' ? 'leads' : 'sales' });
    if (!adSets.has(sId)) adSets.set(sId, { id: sId, campaignId: cId, name: sName, status: 'active', dailyBudget: 0, pixelId: opts.pixelId ?? '', startDay: 0, _delivery: '', _budget: 0 });
    const s = adSets.get(sId)!;
    s._delivery ||= (get(r, 'adsetDelivery') || get(r, 'delivery')).toLowerCase();
    s._budget ||= num(get(r, 'budget'));
    const url = get(r, 'url') || opts.fallbackUrl || '';
    if (!ads.has(aId)) ads.set(aId, { id: aId, adSetId: sId, name: aName, status: 'active', landingUrl: url.startsWith('http') || !url ? url : `https://${url}` });
    const ad = ads.get(aId)!;
    if (!ad.landingUrl && url) ad.landingUrl = url.startsWith('http') ? url : `https://${url}`;
    const d = get(r, 'delivery').toLowerCase();
    if (d && /inactive|off|paused|not delivering|completed|deleted|archived/.test(d)) ad.status = 'paused';

    const key = `${date}|${aId}`;
    const row = insights.get(key) ?? { date, adId: aId, adSetId: sId, spend: 0, impressions: 0, reach: 0, clicks: 0, landingViews: 0, results: 0, revenue: 0 };
    row.spend += num(get(r, 'spend'));
    row.impressions += num(get(r, 'impressions'));
    row.reach += num(get(r, 'reach'));
    row.clicks += num(get(r, col.clicks !== undefined ? 'clicks' : 'allClicks'));
    row.landingViews += num(get(r, 'landing'));
    row.results += num(get(r, resultField));
    row.revenue += num(get(r, 'revenue'));
    insights.set(key, row);
  }
  const rows = [...insights.values()].filter((r) => r.spend > 0 || r.impressions > 0);
  if (!rows.length) throw new ImportError('no_rows', 'No spend in the last 30 days of this file.');
  // Without a landing-page-views column, assume every click landed (page checks still find slow pages).
  if (col.landing === undefined) for (const r of rows) r.landingViews = r.clicks;

  const idx = new Map(dates.map((d, i) => [d, i]));
  const lastIdx = dates.length - 1;
  for (const s of adSets.values()) {
    const mine = rows.filter((r) => r.adSetId === s.id);
    const firstSpend = Math.min(...mine.filter((r) => r.spend > 0).map((r) => idx.get(r.date)!));
    s.startDay = Number.isFinite(firstSpend) ? firstSpend : 0;
    const recent = new Map<number, number>();
    for (const r of mine) {
      const i = idx.get(r.date)!;
      if (i >= lastIdx - 6) recent.set(i, (recent.get(i) ?? 0) + r.spend);
    }
    const days = [...recent.values()].filter((v) => v > 0);
    s.dailyBudget = Math.round(s._budget || (days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0));
    const spentLately = [...recent.entries()].some(([i, v]) => i >= lastIdx - 1 && v > 0);
    if (/inactive|off|paused|not delivering|completed|deleted|archived/.test(s._delivery)) s.status = 'paused';
    else if (/active|learning|delivering/.test(s._delivery)) s.status = 'active';
    else s.status = spentLately ? 'active' : 'paused';
  }
  // ads in paused ad sets stop too; an ad with no spend in the last 2 days is treated as off
  for (const ad of ads.values()) {
    const s = adSets.get(ad.adSetId)!;
    if (s.status === 'paused') ad.status = 'paused';
    else if (!rows.some((r) => r.adId === ad.id && idx.get(r.date)! >= lastIdx - 1 && r.spend > 0)) ad.status = 'paused';
  }

  const totals = rows.reduce((a, r) => ({ spend: a.spend + r.spend, results: a.results + r.results, revenue: a.revenue + r.revenue }), { spend: 0, results: 0, revenue: 0 });
  const cpas = [...adSets.values()].map((s) => {
    const mine = rows.filter((r) => r.adSetId === s.id);
    const sp = mine.reduce((a, r) => a + r.spend, 0);
    const re = mine.reduce((a, r) => a + r.results, 0);
    return re > 0 ? sp / re : NaN;
  }).filter(Number.isFinite);
  const cur: Currency = CURRENCIES.includes(found.currency as Currency) ? (found.currency as Currency) : 'USD';
  const target = opts.targetCost && opts.targetCost > 0 ? opts.targetCost : Math.round(median(cpas) || (totals.results ? totals.spend / totals.results : 0) || 1);
  const account: Account = {
    id: `import-${slug(opts.accountName || 'account')}`,
    name: opts.accountName?.trim() || 'Your ad account',
    currency: cur,
    targetCost: target,
    avgOrderValue: totals.results > 0 && totals.revenue > 0 ? Math.round(totals.revenue / totals.results) : Math.round(target * 3),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const cleanSets: AdSet[] = [...adSets.values()].map(({ _delivery, _budget, ...s }) => {
    void _delivery; void _budget;
    return s;
  });
  const dataset: Dataset = { account, campaigns: [...campaigns.values()], adSets: cleanSets, ads: [...ads.values()], insights: rows, probes: [], dates };
  const urls = [...new Set(dataset.ads.filter((a) => a.status === 'active' && a.landingUrl).map((a) => a.landingUrl.split('?')[0]))];
  return {
    dataset,
    summary: {
      rows: rows.length, days: dates.length, campaigns: campaigns.size, adSets: adSets.size, ads: ads.size,
      spend: Math.round(totals.spend), results: Math.round(totals.results), urls, missing: [...missing],
      resultLabel: resultField === 'purchases' ? 'purchases' : resultField === 'leads' ? 'leads' : 'results',
    },
  };
}

/** A small export in Ads Manager's own format, built from the demo account (for "download a sample"). */
export function toAdsManagerCsv(ds: Dataset): string {
  const cur = ds.account.currency;
  const head = ['Day', 'Campaign name', 'Ad set name', 'Ad name', 'Ad delivery', `Amount spent (${cur})`, 'Impressions', 'Reach', 'Link clicks', 'Landing page views', 'Purchases', 'Purchases conversion value', 'Website URL'];
  const sets = new Map(ds.adSets.map((s) => [s.id, s]));
  const camps = new Map(ds.campaigns.map((c) => [c.id, c]));
  const adsById = new Map(ds.ads.map((a) => [a.id, a]));
  const q = (v: string | number) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [head.join(',')];
  for (const r of [...ds.insights].sort((a, b) => a.date.localeCompare(b.date))) {
    const ad = adsById.get(r.adId)!;
    const s = sets.get(r.adSetId)!;
    lines.push([r.date, camps.get(s.campaignId)!.name, s.name, ad.name, s.status === 'active' && ad.status === 'active' ? 'Active' : 'Inactive', r.spend, Math.round(r.impressions), Math.round(r.reach), Math.round(r.clicks), Math.round(r.landingViews), Math.round(r.results), r.revenue, ad.landingUrl].map(q).join(','));
  }
  return lines.join('\n');
}
