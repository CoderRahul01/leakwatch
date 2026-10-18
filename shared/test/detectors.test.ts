import { describe, expect, test } from 'vitest';
import {
  ask, createDemoWorld, DemoEngine, detectLeaks, evaluateGuards, explanationFor, forecast,
  passesDigitCheck, VERIFY_TICKS, RECHECK_TICKS, type Dataset,
} from '../src';

const TODAY = new Date('2026-10-18T06:00:00Z');
const fresh = () => createDemoWorld(TODAY).dataset;

describe('demo account', () => {
  test('has the promised shape', () => {
    const ds = fresh();
    expect(ds.campaigns).toHaveLength(8);
    expect(ds.adSets).toHaveLength(24);
    expect(ds.ads).toHaveLength(70);
    expect(ds.dates).toHaveLength(30);
    expect(ds.dates[29]).toBe('2026-10-18');
  });

  test('is deterministic for a given day', () => {
    expect(JSON.stringify(fresh().insights)).toBe(JSON.stringify(fresh().insights));
  });
});

describe('detectors', () => {
  const leaks = detectLeaks(fresh(), { dayFraction: 0.62 });
  const by = (d: string) => leaks.filter((l) => l.detector === d);

  test('finds every planted leak exactly once', () => {
    const ids = leaks.map((l) => l.detector).sort();
    expect(ids).toEqual(['L1', 'P1', 'P2', 'P3', 'S1', 'S2', 'S3', 'S4', 'T1', 'T2', 'T3', 'T4']);
  });

  test('pins each leak to the right ad sets', () => {
    expect(by('S1')[0].adSetIds).toEqual(['as01']);
    expect(by('S2')[0].adSetIds).toEqual(['as08']);
    expect(by('S3')[0].adSetIds).toEqual(['as16']);
    expect(by('S4')[0].adSetIds).toEqual(['as17']);
    expect(by('P1')[0].adSetIds).toEqual(['as10']);
    expect(by('P2')[0].adSetIds).toEqual(['as21']);
    expect(by('P3')[0].adSetIds).toEqual(['as12']);
    expect(by('T1')[0].adSetIds.sort()).toEqual(['as13', 'as14']);
    expect(by('T2')[0].adSetIds).toEqual(['as19']);
    expect(by('T3')[0].adSetIds.sort()).toEqual(['as04', 'as05', 'as06']);
    expect(by('T4')[0].adSetIds).toEqual(['as23']);
    expect(by('L1')[0].adSetIds).toEqual(['as07']);
  });

  test('names the day sales went silent', () => {
    expect(by('T3')[0].since).toBe('2026-10-12');
    expect(by('T3')[0].evidence.changeIndex).toBe(23);
  });

  test('root causes win: tracking-broken ad sets are not also flagged as spending, not selling', () => {
    const s1Sets = by('S1').flatMap((l) => l.adSetIds);
    for (const id of ['as04', 'as05', 'as06', 'as13', 'as14', 'as19']) expect(s1Sets).not.toContain(id);
  });

  test('unconfirmed and blocked probes are never leaks', () => {
    const sets = leaks.flatMap((l) => l.adSetIds);
    expect(sets).not.toContain('as09'); // cookie banner, pixel loaded, no event
    expect(sets).not.toContain('as22'); // bot protection
  });

  test('the counted-twice ad set is never picked as a winner', () => {
    expect(by('L1')[0].adSetIds).not.toContain('as23');
  });

  test('leaks come ranked by money per day, opportunities last', () => {
    const money = leaks.filter((l) => !l.opportunity).map((l) => l.perDay);
    expect([...money].sort((a, b) => b - a)).toEqual(money);
    expect(leaks[leaks.length - 1].opportunity).toBe(true);
  });

  test('every leak has a positive amount and an action', () => {
    for (const l of leaks) {
      expect(l.perDay).toBeGreaterThan(0);
      expect(l.action.label.length).toBeGreaterThan(3);
    }
  });

  test('paused ad sets stop being flagged', () => {
    const ds = fresh();
    ds.adSets.find((s) => s.id === 'as01')!.status = 'paused';
    expect(detectLeaks(ds).some((l) => l.detector === 'S1')).toBe(false);
  });

  test('a healthy account has no leaks', () => {
    const ds: Dataset = fresh();
    ds.adSets = ds.adSets.filter((s) => ['as02', 'as03', 'as20', 'as22'].includes(s.id));
    ds.insights = ds.insights.filter((r) => ds.adSets.some((s) => s.id === r.adSetId));
    expect(detectLeaks(ds).filter((l) => !l.opportunity)).toEqual([]);
  });
});

describe('model text guard', () => {
  const leak = detectLeaks(fresh()).find((l) => l.detector === 'T3')!;
  test('accepts text that only uses evidence numbers', () => {
    expect(passesDigitCheck(`Sales stopped on Oct 12. ${leak.evidence.facts[3].value} spent since.`, leak)).toBe(true);
  });
  test('rejects invented numbers and falls back to the rules sentence', () => {
    const bad = 'You lost ₹99,999 and 42 sales because of the pixel.';
    expect(passesDigitCheck(bad, leak)).toBe(false);
    expect(explanationFor(leak, bad)).toEqual({ text: leak.summary, source: 'rules' });
  });
});

describe('forecast', () => {
  test('refuses to forecast under 7 days of data', () => {
    const row = forecast(fresh()).find((f) => f.adSetId === 'as24')!;
    expect(row.verdict).toBe('not-enough-data');
    expect(row.probability).toBeNull();
  });
  test('flags the ad set that never sells', () => {
    expect(forecast(fresh()).find((f) => f.adSetId === 'as01')!.verdict).toBe('likely');
  });
});

describe('ask', () => {
  const ds = fresh();
  const leaks = detectLeaks(ds);
  test('answers from the data', () => {
    const a = ask('Why did yesterday cost so much?', ds, leaks);
    expect(a.found).toBe(true);
    expect(a.sources.length).toBeGreaterThan(0);
  });
  test('worst ad set is the one that never sells', () => {
    expect(ask('Which ad set is my worst?', ds, leaks).text).toContain('Lookalike 2% · Gifting');
  });
  test('says when something is not in the data', () => {
    expect(ask('What will the weather be?', ds, leaks).found).toBe(false);
  });
});

describe('guards', () => {
  test('nothing fires while every guard is off', () => {
    const ds = fresh();
    expect(evaluateGuards(ds, [], detectLeaks(ds))).toEqual([]);
  });
});

describe('live engine', () => {
  test('starts mid-day with every planted leak open', () => {
    const s = new DemoEngine(TODAY).getSnapshot();
    expect(s.leaks.map((l) => l.detector).sort()).toEqual(['L1', 'P1', 'P2', 'P3', 'S1', 'S2', 'S3', 'S4', 'T1', 'T2', 'T3', 'T4']);
    expect(s.leakingPerDay).toBeGreaterThan(0);
    expect(s.savedTotal).toBe(0);
  });

  test('pause → verified → saved, and undo restores the exact previous state', () => {
    const e = new DemoEngine(TODAY);
    const s1 = e.getSnapshot().leaks.find((l) => l.detector === 'S1')!;
    const before = e.dataset.adSets.find((s) => s.id === 'as01')!.status;
    const rec = e.act(s1.id)!;
    expect(e.dataset.adSets.find((s) => s.id === 'as01')!.status).toBe('paused');
    expect(e.getSnapshot().leaks.find((l) => l.id === s1.id)!.state).toBe('verifying');
    for (let i = 0; i < VERIFY_TICKS; i++) e.tick();
    const done = e.getSnapshot().leaks.find((l) => l.id === s1.id)!;
    expect(done.state).toBe('fixed');
    expect(e.getSnapshot().savedPerDay).toBeGreaterThanOrEqual(done.perDay);
    e.undo(rec.id);
    expect(e.dataset.adSets.find((s) => s.id === 'as01')!.status).toBe(before);
    expect(e.getSnapshot().leaks.find((l) => l.id === s1.id)!.state).toBe('new');
  });

  test('budget move can be undone to the exact amounts', () => {
    const e = new DemoEngine(TODAY);
    const l1 = e.getSnapshot().leaks.find((l) => l.detector === 'L1')!;
    const budgets = () => e.dataset.adSets.filter((s) => ['as07', 'as08'].includes(s.id)).map((s) => s.dailyBudget);
    const start = budgets();
    const rec = e.act(l1.id)!;
    expect(budgets()).not.toEqual(start);
    e.undo(rec.id);
    expect(budgets()).toEqual(start);
  });

  test('the slow page is still leaking after the first recheck, fixed after the second', () => {
    const e = new DemoEngine(TODAY);
    const p2 = e.getSnapshot().leaks.find((l) => l.detector === 'P2')!;
    e.act(p2.id);
    for (let i = 0; i < RECHECK_TICKS; i++) e.tick();
    expect(e.getSnapshot().leaks.find((l) => l.id === p2.id)!.state).toBe('still-leaking');
    e.act(p2.id);
    for (let i = 0; i < RECHECK_TICKS; i++) e.tick();
    expect(e.getSnapshot().leaks.find((l) => l.id === p2.id)!.state).toBe('fixed');
  });

  test('a new leak appears while watching, and the guard pauses the test ad set overnight', () => {
    const e = new DemoEngine(TODAY);
    for (let i = 0; i < 40; i++) e.tick();
    const s = e.getSnapshot();
    expect(s.events.some((x) => x.kind === 'detected')).toBe(true);
    expect(s.events.some((x) => x.kind === 'guard')).toBe(true);
    expect(e.dataset.adSets.find((x) => x.id === 'as24')!.status).toBe('paused');
  });

  test('paused ad sets stop spending', () => {
    const e = new DemoEngine(TODAY);
    const spend = () => e.dataset.insights.filter((r) => r.adSetId === 'as01' && r.date === '2026-10-18').reduce((a, r) => a + r.spend, 0);
    e.act(e.getSnapshot().leaks.find((l) => l.detector === 'S1')!.id);
    const at = spend();
    for (let i = 0; i < 5; i++) e.tick();
    expect(spend()).toBe(at);
  });
});
