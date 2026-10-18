// The live demo engine: ticks the simulated account forward, runs detectors on every check,
// applies actions with Undo, verifies fixes, and runs guards. The real product does the same loop
// on the edge worker against Meta; the lifecycle rules below are shared by both.

import { createDemoWorld, rowFromTotals, TODAY, type DemoWorld } from './demo-account';
import { detectLeaks, stripQuery } from './detectors';
import { forecast } from './forecast';
import { defaultGuards, evaluateGuards } from './guards';
import type { ActionRecord, ForecastRow, Guard, Leak, LeakState, Status } from './types';
import { money } from './util';

export const SIM_MINUTES_PER_TICK = 8;
export const TICKS_PER_CHECK = 4;
export const VERIFY_TICKS = 8;
export const RECHECK_TICKS = 2;
export const UNDO_WINDOW_TICKS = 4;
const START_FRACTION = 0.62;
const END_FRACTION = 0.985;
const LIVE_SPIKE_TICK = 9;

export interface LiveLeak extends Leak {
  state: LeakState;
  /** Ticks left until verification finishes, while state is acting or verifying. */
  verifyIn: number | null;
  savedPerDay: number;
  note: string | null;
  firstSeenTick: number;
  actionId: string | null;
}

export interface SimEvent {
  id: string;
  tick: number;
  clock: string;
  kind: 'detected' | 'action' | 'verified' | 'still' | 'guard' | 'undo' | 'info';
  text: string;
  leakId?: string;
  actionId?: string;
}

interface Tot {
  spend: number;
  impressions: number;
  clicks: number;
  landingViews: number;
  results: number;
  revenue: number;
  freq: number;
}

interface Track {
  state: LeakState;
  leak: Leak;
  verifyAt: number | null;
  savedPerDay: number;
  note: string | null;
  firstSeenTick: number;
  actionId: string | null;
  rechecks: number;
}

export interface Snapshot {
  version: number;
  tick: number;
  clock: string;
  date: string;
  checking: boolean;
  ticksToCheck: number;
  world: DemoWorld;
  leaks: LiveLeak[];
  leakingPerDay: number;
  savedPerDay: number;
  savedTotal: number;
  actions: ActionRecord[];
  events: SimEvent[];
  guards: Guard[];
  forecast: ForecastRow[];
  dayFraction: number;
}

export class DemoEngine {
  private world: DemoWorld;
  private tot: Record<string, Tot> = {};
  private frac = START_FRACTION;
  private tickNo = 0;
  private tracks = new Map<string, Track>();
  private actions: ActionRecord[] = [];
  private events: SimEvent[] = [];
  private guards: Guard[];
  private savedTotal = 0;
  private version = 0;
  private seq = 0;
  private fc: ForecastRow[] = [];
  private listeners = new Set<() => void>();
  private snap: Snapshot | null = null;

  constructor(today: Date = new Date()) {
    this.world = createDemoWorld(today);
    this.guards = defaultGuards(this.world.dataset.account.targetCost, this.world.dataset.account.currency);
    // The demo starts with the overnight guard already switched on, so visitors see one fire.
    this.guards[0].enabled = true;
    for (const ad of this.world.dataset.ads) this.tot[ad.id] = { spend: 0, impressions: 0, clicks: 0, landingViews: 0, results: 0, revenue: 0, freq: this.world.plans[ad.id].freq };
    this.advance(START_FRACTION);
    this.check(true);
  }

  // ------------------------------------------------------------------ subscription
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => {
    if (!this.snap) this.snap = this.buildSnapshot();
    return this.snap;
  };

  private emit() {
    this.version++;
    this.snap = null;
    this.listeners.forEach((l) => l());
  }

  // ------------------------------------------------------------------ time
  get dataset() {
    return this.world.dataset;
  }

  private clock(frac = this.frac): string {
    const mins = Math.floor(frac * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  /** Spend money for `dayShare` of a day on every active ad, then rebuild today's rows. */
  private advance(dayShare: number) {
    const ds = this.world.dataset;
    const sets = new Map(ds.adSets.map((s) => [s.id, s]));
    for (const ad of ds.ads) {
      const set = sets.get(ad.adSetId)!;
      if (set.status !== 'active' || ad.status !== 'active') continue;
      const p = this.world.plans[ad.id];
      const t = this.tot[ad.id];
      const spend = set.dailyBudget * p.share * dayShare;
      const impressions = (spend / p.cpm) * 1000;
      const clicks = impressions * p.ctr;
      const lv = clicks * p.lpv;
      const res = lv * p.cvr * p.reported;
      t.spend += spend;
      t.impressions += impressions;
      t.clicks += clicks;
      t.landingViews += lv;
      t.results += res;
      t.revenue += res * p.aov;
      t.freq = p.freq;
    }
    this.writeToday();
  }

  private writeToday() {
    const ds = this.world.dataset;
    const today = ds.dates[TODAY];
    ds.insights = ds.insights.filter((r) => r.date !== today);
    for (const ad of ds.ads) {
      const t = this.tot[ad.id];
      if (t.spend <= 0) continue;
      ds.insights.push(rowFromTotals(ad, today, t));
    }
  }

  tick() {
    this.tickNo++;
    if (this.frac < END_FRACTION) {
      const share = Math.min(END_FRACTION - this.frac, SIM_MINUTES_PER_TICK / 1440);
      this.frac += share;
      this.advance(share);
    }
    if (this.tickNo === LIVE_SPIKE_TICK) this.liveSpike();
    this.runGuards();
    this.settle();
    if (this.tickNo % TICKS_PER_CHECK === 0) this.check(false);
    this.savedTotal += this.savedPerDay() * (SIM_MINUTES_PER_TICK / 1440);
    this.emit();
  }

  /** Fresh data from Meta: one ad set's auction got expensive this afternoon. */
  private liveSpike() {
    const ds = this.world.dataset;
    for (const ad of ds.ads.filter((a) => this.world.specs[a.adSetId]?.leak === 'LIVE_S4')) {
      const p = this.world.plans[ad.id];
      const k = 1.8;
      p.cpm *= k;
      const t = this.tot[ad.id];
      t.impressions /= k;
      t.clicks /= k;
      t.landingViews /= k;
      t.results /= k;
      t.revenue /= k;
    }
    this.writeToday();
  }

  // ------------------------------------------------------------------ detection
  private check(initial: boolean) {
    const ds = this.world.dataset;
    const found = detectLeaks(ds, { dayFraction: this.frac });
    const ids = new Set(found.map((l) => l.id));
    for (const leak of found) {
      const t = this.tracks.get(leak.id);
      if (!t) {
        this.tracks.set(leak.id, { state: 'new', leak, verifyAt: null, savedPerDay: 0, note: null, firstSeenTick: this.tickNo, actionId: null, rechecks: 0 });
        if (!initial) this.log('detected', `New leak: ${leak.title}`, { leakId: leak.id });
      } else if (t.state === 'new' || t.state === 'still-leaking') {
        t.leak = leak; // numbers keep ticking while it leaks
      }
    }
    // A leak that is only "new" and no longer detected has cleared on its own.
    for (const [id, t] of this.tracks) {
      if (!ids.has(id) && t.state === 'new') this.tracks.delete(id);
    }
    this.fc = forecast(ds);
  }

  // ------------------------------------------------------------------ actions
  private setAdSet(id: string, patch: { status?: Status; dailyBudget?: number }) {
    const s = this.world.dataset.adSets.find((x) => x.id === id);
    if (!s) return;
    if (patch.status) s.status = patch.status;
    if (patch.dailyBudget !== undefined) s.dailyBudget = Math.max(0, Math.round(patch.dailyBudget));
  }

  /** Apply the leak's suggested action. Account-changing actions must be confirmed by the caller. */
  act(leakId: string): ActionRecord | null {
    const t = this.tracks.get(leakId);
    if (!t || !(t.state === 'new' || t.state === 'still-leaking')) return null;
    const a = t.leak.action;
    const ds = this.world.dataset;
    const touched = a.kind === 'move-budget' && a.toAdSetId ? [...a.adSetIds, a.toAdSetId] : a.adSetIds;
    const previous = touched.map((id) => {
      const s = ds.adSets.find((x) => x.id === id)!;
      return { adSetId: id, status: s.status, dailyBudget: s.dailyBudget };
    });

    if (a.kind === 'pause') a.adSetIds.forEach((id) => this.setAdSet(id, { status: 'paused' }));
    if (a.kind === 'cut-budget') a.adSetIds.forEach((id) => this.setAdSet(id, { dailyBudget: ds.adSets.find((x) => x.id === id)!.dailyBudget - (a.amount ?? 0) }));
    if (a.kind === 'move-budget' && a.toAdSetId && a.amount) {
      const from = ds.adSets.find((x) => x.id === a.adSetIds[0])!;
      const to = ds.adSets.find((x) => x.id === a.toAdSetId)!;
      this.setAdSet(from.id, { dailyBudget: from.dailyBudget - a.amount });
      this.setAdSet(to.id, { dailyBudget: to.dailyBudget + a.amount });
    }

    const rec: ActionRecord = {
      id: `act${++this.seq}`,
      leakId,
      guardId: null,
      kind: a.kind,
      label: a.label,
      at: this.clock(),
      adSetIds: touched,
      previous: a.changesAccount ? previous : [],
      undone: false,
    };
    this.actions.unshift(rec);
    t.actionId = rec.id;
    t.note = null;
    if (a.kind === 'recheck') {
      t.state = 'acting';
      t.verifyAt = this.tickNo + RECHECK_TICKS;
      this.log('action', `Rechecking ${t.leak.evidence.probeUrl ? 'the page' : 'it'} on a phone…`, { leakId, actionId: rec.id });
    } else {
      t.state = 'verifying';
      t.verifyAt = this.tickNo + VERIFY_TICKS;
      this.log('action', `${a.label} · ${t.leak.title}`, { leakId, actionId: rec.id });
    }
    this.emit();
    return rec;
  }

  undo(actionId: string): boolean {
    const rec = this.actions.find((a) => a.id === actionId);
    if (!rec || rec.undone) return false;
    for (const p of rec.previous) this.setAdSet(p.adSetId, { status: p.status, dailyBudget: p.dailyBudget });
    rec.undone = true;
    if (rec.leakId) {
      const t = this.tracks.get(rec.leakId);
      if (t) {
        t.state = 'new';
        t.verifyAt = null;
        t.savedPerDay = 0;
        t.actionId = null;
      }
    }
    this.log('undo', `Undone: ${rec.label}`, { actionId });
    this.check(false);
    this.emit();
    return true;
  }

  dismiss(leakId: string) {
    const t = this.tracks.get(leakId);
    if (!t) return;
    t.state = 'dismissed';
    this.log('info', `Dismissed: ${t.leak.title}`, { leakId });
    this.emit();
  }

  restore(leakId: string) {
    const t = this.tracks.get(leakId);
    if (!t || t.state !== 'dismissed') return;
    t.state = 'new';
    this.emit();
  }

  /** Finish rechecks and verifications whose time has come. */
  private settle() {
    for (const [id, t] of this.tracks) {
      if (t.verifyAt === null || this.tickNo < t.verifyAt) continue;
      t.verifyAt = null;
      const l = t.leak;
      if (l.action.kind === 'recheck') {
        t.rechecks++;
        const probe = this.world.dataset.probes.find((p) => p.url === l.evidence.probeUrl);
        // The slow page needs two goes: the first fix only gets it to 5.1 s.
        if (l.detector === 'P2' && t.rechecks === 1) {
          if (probe) probe.loadMs = 5100;
          t.state = 'still-leaking';
          t.note = 'Better, but still 5.1 s on a phone. Compress the hero video too, then recheck.';
          this.log('still', `Still leaking: page now loads in 5.1 s (needs under 4 s)`, { leakId: id });
          continue;
        }
        if (probe) this.healProbe(probe, l);
        this.healPlans(l);
        t.state = 'fixed';
        t.savedPerDay = l.perDay;
        this.log('verified', `Fixed ✓ ${l.title} · saving ${money(l.perDay, this.dataset.account.currency)}/day`, { leakId: id });
      } else {
        const sets = this.world.dataset.adSets;
        const stillApplied = t.actionId ? !this.actions.find((a) => a.id === t.actionId)?.undone : false;
        if (!stillApplied) {
          t.state = 'new';
          continue;
        }
        if (l.action.kind === 'pause') {
          const paused = l.adSetIds.every((sid) => sets.find((s) => s.id === sid)?.status === 'paused');
          t.state = paused ? 'fixed' : 'still-leaking';
        } else {
          t.state = 'fixed';
        }
        if (l.action.kind === 'mark-fixed') this.healPlans(l);
        t.savedPerDay = l.action.kind === 'cut-budget' ? Math.round(l.perDay * 0.3) : l.perDay;
        const verb = l.opportunity ? 'earning' : 'saving';
        this.log('verified', `Fixed ✓ ${l.title} · ${verb} ${money(t.savedPerDay, this.dataset.account.currency)}/day`, { leakId: id });
      }
    }
  }

  private healProbe(probe: Snapshot['world']['dataset']['probes'][number], l: Leak) {
    probe.state = 'ok';
    probe.issueSince = undefined;
    probe.checkedAt = new Date().toISOString();
    if (l.detector === 'P1') {
      probe.status = 200;
      probe.requests = [{ at: 0, kind: 'document', label: 'Page', status: 200, ok: true }, { at: 600, kind: 'pixel', label: 'PageView sent', ok: true }, { at: 2100, kind: 'other', label: 'Page ready', ok: true }];
      probe.loadMs = 2100;
    }
    if (l.detector === 'P2') {
      probe.loadMs = 2900;
      probe.requests = probe.requests.map((r) => (r.ok ? r : { ...r, ok: true, label: 'Page ready (2.9 s)', at: 2900 })).filter((r) => !r.label.startsWith('Hero video'));
    }
    if (l.detector === 'P3') {
      probe.tagsKept = true;
      probe.requests = probe.requests.map((r) => (r.label.includes('gone') ? { ...r, label: 'Page (utm_* and fbclid kept)' } : r));
    }
    if (l.detector === 'T1') {
      probe.pixelIds = ['8817402263519'];
      probe.events = [{ name: 'PageView', pixelId: '8817402263519', eventId: 'ev.pv' }, { name: 'Lead', pixelId: '8817402263519', eventId: 'ev.ld' }];
      probe.requests = [{ at: 0, kind: 'document', label: 'Page', status: 200, ok: true }, { at: 900, kind: 'script', label: 'Pixel script loaded', ok: true }, { at: 1200, kind: 'pixel', label: 'PageView sent', ok: true }, { at: 2800, kind: 'other', label: 'Page ready', ok: true }];
    }
    if (l.detector === 'T2') {
      probe.pixelIds = ['8817402263519'];
      probe.events = probe.events.map((e) => ({ ...e, pixelId: '8817402263519' }));
      probe.requests = probe.requests.map((r) => ({ ...r, label: r.label.replace(/…\d{4}/, '…3519') }));
    }
    if (l.detector === 'T4') {
      probe.events = probe.events.filter((e) => e.eventId);
      probe.requests = probe.requests.filter((r) => r.ok).map((r) => ({ ...r, label: r.label.replace(' twice', '') }));
    }
  }

  /** After a verified fix, the account starts behaving: sales reach Meta again from now on. */
  private healPlans(l: Leak) {
    for (const ad of this.world.dataset.ads) {
      if (!l.adSetIds.includes(ad.adSetId)) continue;
      const p = this.world.plans[ad.id];
      if (['T1', 'T2', 'T3', 'T4', 'P1'].includes(l.detector)) p.reported = 1;
      if (l.detector === 'P1') p.lpv = 0.85;
      if (l.detector === 'P2') p.lpv = 0.82;
      if (l.detector === 'S3') {
        p.ctr *= 1.5;
        p.freq = 1.6;
      }
    }
  }

  // ------------------------------------------------------------------ guards
  setGuard(id: string, enabled: boolean) {
    const g = this.guards.find((x) => x.id === id);
    if (!g) return;
    g.enabled = enabled;
    this.log('info', `${enabled ? 'Guard on' : 'Guard off'}: ${g.sentence}`);
    if (enabled) this.runGuards();
    this.emit();
  }

  private runGuards() {
    const open = [...this.tracks.values()].filter((t) => t.state === 'new').map((t) => t.leak);
    const hits = evaluateGuards(this.world.dataset, this.guards, open);
    for (const h of hits) {
      const s = this.world.dataset.adSets.find((x) => x.id === h.adSetId)!;
      const rec: ActionRecord = {
        id: `act${++this.seq}`,
        leakId: null,
        guardId: h.guardId,
        kind: 'pause',
        label: `Guard paused “${s.name}”`,
        at: this.clock(),
        adSetIds: [s.id],
        previous: [{ adSetId: s.id, status: s.status, dailyBudget: s.dailyBudget }],
        undone: false,
      };
      this.setAdSet(s.id, { status: 'paused' });
      this.actions.unshift(rec);
      // A guard pause resolves any open leak on the same ad set, verified on the next round.
      for (const t of this.tracks.values()) {
        if (t.state === 'new' && t.leak.action.kind === 'pause' && t.leak.adSetIds.every((id) => this.world.dataset.adSets.find((x) => x.id === id)?.status === 'paused')) {
          t.state = 'verifying';
          t.verifyAt = this.tickNo + VERIFY_TICKS;
          t.actionId = rec.id;
          rec.leakId = t.leak.id;
        }
      }
      this.log('guard', `Guard paused “${s.name}”: it ${h.reason}.`, { actionId: rec.id });
    }
  }

  setTargetCost(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    const ds = this.world.dataset;
    ds.account.targetCost = Math.round(value);
    const fresh = defaultGuards(ds.account.targetCost, ds.account.currency);
    this.guards = this.guards.map((g) => ({ ...g, sentence: fresh.find((f) => f.id === g.id)!.sentence }));
    this.check(false);
    this.emit();
  }

  // ------------------------------------------------------------------ helpers
  private log(kind: SimEvent['kind'], text: string, extra: { leakId?: string; actionId?: string } = {}) {
    this.events.unshift({ id: `ev${++this.seq}`, tick: this.tickNo, clock: this.clock(), kind, text, ...extra });
    if (this.events.length > 60) this.events.length = 60;
  }

  private savedPerDay() {
    let s = 0;
    for (const t of this.tracks.values()) if (t.state === 'fixed') s += t.savedPerDay;
    return s;
  }

  private buildSnapshot(): Snapshot {
    const leaks: LiveLeak[] = [...this.tracks.values()].map((t) => ({
      ...t.leak,
      state: t.state,
      verifyIn: t.verifyAt === null ? null : Math.max(0, t.verifyAt - this.tickNo),
      savedPerDay: t.savedPerDay,
      note: t.note,
      firstSeenTick: t.firstSeenTick,
      actionId: t.actionId,
    }));
    const leaking = leaks.filter((l) => !l.opportunity && (l.state === 'new' || l.state === 'still-leaking'));
    return {
      version: this.version,
      tick: this.tickNo,
      clock: this.clock(),
      date: this.world.dataset.dates[TODAY],
      checking: this.tickNo % TICKS_PER_CHECK === 0,
      ticksToCheck: TICKS_PER_CHECK - (this.tickNo % TICKS_PER_CHECK),
      world: this.world,
      leaks: leaks.sort((a, b) => Number(a.opportunity) - Number(b.opportunity) || b.perDay - a.perDay),
      leakingPerDay: Math.round(leaking.reduce((a, l) => a + l.perDay, 0)),
      savedPerDay: Math.round(this.savedPerDay()),
      savedTotal: Math.round(this.savedTotal),
      actions: [...this.actions],
      events: [...this.events],
      guards: this.guards.map((g) => ({ ...g })),
      forecast: this.fc,
      dayFraction: this.frac,
    };
  }

  /** Ads that point at a URL, for the page check screen. */
  adsForUrl(url: string) {
    return this.world.dataset.ads.filter((a) => stripQuery(a.landingUrl) === url);
  }
}
