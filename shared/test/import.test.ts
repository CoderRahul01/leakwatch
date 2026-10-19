import { describe, expect, test } from 'vitest';
import {
  createDemoWorld, detectLeaks, duplicateEvents, importAdsManager, ImportError, isoDate, num, parseCsv,
  ReportEngine, toAdsManagerCsv, type Probe,
} from '../src';

const TODAY = new Date('2026-10-18T06:00:00Z');
const demo = () => createDemoWorld(TODAY).dataset;

describe('csv', () => {
  test('quotes, commas, newlines, BOM, tabs', () => {
    expect(parseCsv('﻿a,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    expect(parseCsv('a\tb\r\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a;b\n"multi\nline";2')).toEqual([['a', 'b'], ['multi\nline', '2']]);
  });

  test('numbers and dates the way Ads Manager writes them', () => {
    expect(num('1,234.50')).toBe(1234.5);
    expect(num('₹ 980')).toBe(980);
    expect(num('1.234,56')).toBe(1234.56);
    expect(num('')).toBe(0);
    expect(isoDate('2026-10-12')).toBe('2026-10-12');
    expect(isoDate('25/10/2026')).toBe('2026-10-25');
    expect(isoDate('10/25/2026')).toBe('2026-10-25');
  });
});

describe('import', () => {
  test('a demo export round-trips into the same leaks for spend and tracking', () => {
    const ds = demo();
    const { dataset, summary } = importAdsManager(toAdsManagerCsv(ds), { accountName: 'Kora', targetCost: ds.account.targetCost });
    expect(summary.days).toBe(new Set(ds.insights.map((r) => r.date)).size); // the demo has no rows for today until it starts ticking
    expect(summary.adSets).toBe(24);
    expect(summary.missing).toEqual([]);
    expect(dataset.account.currency).toBe('INR');
    expect(Math.abs(summary.spend - ds.insights.reduce((a, r) => a + r.spend, 0))).toBeLessThan(5);
    const want = new Set(detectLeaks({ ...ds, probes: [] }).map((l) => l.detector).filter((d) => d.startsWith('S') || d === 'L1'));
    const got = new Set(detectLeaks(dataset).map((l) => l.detector));
    for (const d of want) expect(got.has(d), `missing ${d}`).toBe(true);
    expect(summary.urls.length).toBeGreaterThan(5);
  });

  test('explains what is wrong with the file', () => {
    expect(() => importAdsManager('')).toThrow(ImportError);
    expect(() => importAdsManager('Campaign name,Ad set name\nA,B')).toThrow(/Amount spent/);
    expect(() => importAdsManager('Ad set name,Amount spent (USD)\nB,10')).toThrow(/By time → Day/);
    expect(() => importAdsManager('Reporting starts,Ad set name,Amount spent (USD)\n2026-10-01,B,10\n2026-10-01,C,4')).toThrow(/same date/);
  });

  test('works with a minimal export and fills what it can', () => {
    const csv = ['Day,Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Link clicks,Results', '2026-10-10,C,S,A,20,1000,30,2', '2026-10-11,C,S,A,22,1100,31,1'].join('\n');
    const { dataset, summary } = importAdsManager(csv, { fallbackUrl: 'shop.example.com/x' });
    expect(dataset.account.currency).toBe('USD');
    expect(summary.resultLabel).toBe('results');
    expect(dataset.ads[0].landingUrl).toBe('https://shop.example.com/x');
    expect(summary.missing).toContain('Landing page views');
    expect(dataset.insights[0].landingViews).toBe(30);
  });
});

describe('report engine', () => {
  const imported = () => importAdsManager(toAdsManagerCsv(demo()), { targetCost: demo().account.targetCost }).dataset;

  test('acting waits for the next import, which confirms or not', () => {
    const e = new ReportEngine(imported(), null, { fresh: true });
    const leak = e.getSnapshot().leaks.find((l) => l.action.changesAccount)!;
    const rec = e.act(leak.id)!;
    expect(rec).toBeTruthy();
    expect(e.getSnapshot().leaks.find((l) => l.id === leak.id)!.state).toBe('verifying');
    expect(e.getSnapshot().leaks.find((l) => l.id === leak.id)!.note).toMatch(/next import/);

    // same data again: still leaking
    const again = new ReportEngine(imported(), e.memory, { fresh: true });
    expect(again.getSnapshot().leaks.find((l) => l.id === leak.id)!.state).toBe('still-leaking');

    // data without that ad set's spend: fixed, and the saving counts
    const next = imported();
    next.insights = next.insights.filter((r) => !leak.adSetIds.includes(r.adSetId));
    const after = new ReportEngine(next, e.memory, { fresh: true });
    const s = after.getSnapshot();
    expect(s.leaks.find((l) => l.id === leak.id)!.state).toBe('fixed');
    expect(s.savedPerDay).toBeGreaterThan(0);
  });

  test('undo puts the leak back', () => {
    const e = new ReportEngine(imported(), null, { fresh: true });
    const leak = e.getSnapshot().leaks[0];
    const rec = e.act(leak.id)!;
    expect(e.undo(rec.id)).toBe(true);
    expect(e.getSnapshot().leaks.find((l) => l.id === leak.id)!.state).toBe('new');
  });

  test('a recheck that finds the page healthy marks the page leak fixed', () => {
    const ds = imported();
    const url = ds.ads.find((a) => a.status === 'active')!.landingUrl.split('?')[0];
    const broken: Probe = { url, checkedAt: new Date().toISOString(), state: 'issue', status: 404, finalUrl: url, redirects: [url], loadMs: 900, tagsKept: null, pixelIds: [], events: [], consentBanner: false, requests: [] };
    const e = new ReportEngine(ds, null, { fresh: true });
    e.setProbes([broken]);
    const p1 = e.getSnapshot().leaks.find((l) => l.detector === 'P1')!;
    expect(p1).toBeTruthy();
    // in report mode the page leak is fixed on the site, then rechecked
    e.act(p1.id);
    e.applyProbe({ ...broken, state: 'ok', status: 200, tagsKept: true, pixelIds: ['1'], events: [{ name: 'PageView', pixelId: '1' }] });
    expect(e.getSnapshot().leaks.find((l) => l.id === p1.id)?.state).toBe('fixed');
  });
});

test('duplicate events need two copies Meta cannot merge', () => {
  expect(duplicateEvents([{ name: 'PageView', pixelId: '1' }])).toEqual([]);
  expect(duplicateEvents([{ name: 'PageView', pixelId: '1' }, { name: 'PageView', pixelId: '1' }])).toEqual(['PageView']);
  expect(duplicateEvents([{ name: 'Purchase', pixelId: '1', eventId: 'a' }, { name: 'Purchase', pixelId: '1', eventId: 'a' }])).toEqual([]);
});
