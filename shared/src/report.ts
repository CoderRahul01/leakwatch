// The engine behind a real account. Same surface as the demo engine, so every screen works on both,
// but nothing here pretends: Leakwatch can't change a Meta account until Meta approves the direct
// connection, so a fix is something the person does in Ads Manager and we verify it on their next
// import. Page fixes are verified right away by opening the page again on a phone.

import { defaultGuards } from './guards';
import { detectLeaks, stripQuery } from './detectors';
import { forecast } from './forecast';
import type { DemoWorld } from './demo-account';
import type { LiveLeak, SimEvent, Snapshot } from './sim';
import type { ActionRecord, Dataset, Guard, Leak, LeakState, Probe } from './types';
import { money } from './util';

/** What we remember between imports (kept in the browser, next to the dataset). */
export interface ReportMemory {
  importedAt: string;
  /** Leak id → what the person did and when; resolved on the next import or recheck. */
  acted: Record<string, { state: LeakState; perDay: number; label: string; at: string; actionId: string; savedSince?: string }>;
  dismissed: string[];
  events: SimEvent[];
  actions: ActionRecord[];
  seq: number;
}

export const emptyMemory = (): ReportMemory => ({ importedAt: new Date().toISOString(), acted: {}, dismissed: [], events: [], actions: [], seq: 0 });

interface Track {
  leak: Leak;
  state: LeakState;
  savedPerDay: number;
  note: string | null;
  actionId: string | null;
}

const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export class ReportEngine {
  readonly kind = 'report' as const;
  private world: DemoWorld;
  private tracks = new Map<string, Track>();
  private guards: Guard[];
  private mem: ReportMemory;
  private version = 0;
  private listeners = new Set<() => void>();
  private snap: Snapshot | null = null;
  private fc;
  /** Called after every change so the app can save it. */
  onChange: ((mem: ReportMemory, ds: Dataset) => void) | null = null;

  /**
   * `previous`: what was remembered from the last import. Leaks the person acted on are verified now:
   * gone from the new data → fixed; still there → still leaking.
   */
  constructor(dataset: Dataset, previous?: ReportMemory | null, { fresh = false } = {}) {
    this.world = { dataset, plans: {}, specs: {} };
    this.guards = defaultGuards(dataset.account.targetCost, dataset.account.currency);
    this.mem = previous ? structuredClone(previous) : emptyMemory();
    if (fresh) this.mem.importedAt = new Date().toISOString();
    this.fc = forecast(dataset);
    this.detect(fresh);
  }

  // ------------------------------------------------------------------ subscription
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => {
    if (!this.snap) this.snap = this.build();
    return this.snap;
  };

  private emit() {
    this.version++;
    this.snap = null;
    this.onChange?.(this.mem, this.world.dataset);
    this.listeners.forEach((l) => l());
  }

  get dataset() {
    return this.world.dataset;
  }

  get memory() {
    return this.mem;
  }

  // ------------------------------------------------------------------ detection
  private detect(fresh: boolean) {
    const found = detectLeaks(this.world.dataset);
    const ids = new Set(found.map((l) => l.id));
    const cur = this.world.dataset.account.currency;
    this.tracks.clear();
    for (const leak of found) {
      const a = this.mem.acted[leak.id];
      let state: LeakState = this.mem.dismissed.includes(leak.id) ? 'dismissed' : 'new';
      let note: string | null = null;
      if (a && (a.state === 'verifying' || a.state === 'acting')) {
        if (fresh) {
          state = 'still-leaking';
          note = `Still in your new numbers after “${a.label}”. Check it was saved in Ads Manager.`;
          a.state = 'still-leaking';
          if (fresh) this.log('still', `Still leaking: ${leak.title}`, { leakId: leak.id });
        } else {
          state = a.state;
          note = 'Waiting for your next import to confirm.';
        }
      } else if (a?.state === 'still-leaking') {
        state = 'still-leaking';
        note = `Still in your numbers after “${a.label}”.`;
      }
      this.tracks.set(leak.id, { leak, state, savedPerDay: 0, note, actionId: a?.actionId ?? null });
    }
    // acted-on leaks that are gone from the data are fixed: keep them on screen as wins
    for (const [id, a] of Object.entries(this.mem.acted)) {
      if (ids.has(id)) continue;
      if (a.state === 'verifying' || a.state === 'acting' || a.state === 'still-leaking') {
        a.state = 'fixed';
        a.savedSince = new Date().toISOString();
        this.log('verified', `Fixed ✓ ${a.label} · saving ${money(a.perDay, cur)}/day`, { leakId: id });
      }
    }
    for (const [id, a] of Object.entries(this.mem.acted)) {
      if (a.state !== 'fixed' || this.tracks.has(id)) continue;
      const ghost = this.ghost(id, a);
      if (ghost) this.tracks.set(id, { leak: ghost, state: 'fixed', savedPerDay: a.perDay, note: null, actionId: a.actionId });
    }
  }

  /** A fixed leak no longer shows up in detection; rebuild a card for it from memory. */
  private ghost(id: string, a: ReportMemory['acted'][string]): Leak | null {
    const prev = this.mem.events.find((e) => e.leakId === id && e.kind === 'action');
    return {
      id, detector: (id.split(':')[0] as Leak['detector']) || 'S1', step: 'spend', opportunity: false,
      title: prev?.text.split(' · ').slice(1).join(' · ') || a.label, summary: 'Fixed and confirmed by your newer numbers.',
      adSetIds: [], adIds: [], since: a.at.slice(0, 10), perDay: a.perDay, totalSince: 0, confidence: 'high',
      evidence: { kind: 'series', facts: [{ label: 'Saving', value: `${money(a.perDay, this.world.dataset.account.currency)}/day` }] },
      fixSteps: [], action: { kind: 'mark-fixed', label: a.label, adSetIds: [], changesAccount: false },
    };
  }

  // ------------------------------------------------------------------ actions
  /** Records what the person did. Changing the account itself happens in Ads Manager. */
  act(leakId: string): ActionRecord | null {
    const t = this.tracks.get(leakId);
    if (!t || !(t.state === 'new' || t.state === 'still-leaking')) return null;
    const a = t.leak.action;
    const rec: ActionRecord = {
      id: `act${++this.mem.seq}`, leakId, guardId: null, kind: a.kind, label: a.label, at: hhmm(),
      adSetIds: a.toAdSetId ? [...a.adSetIds, a.toAdSetId] : a.adSetIds, previous: [], undone: false,
    };
    this.mem.actions.unshift(rec);
    t.actionId = rec.id;
    t.state = a.kind === 'recheck' ? 'acting' : 'verifying';
    t.note = a.kind === 'recheck' ? null : 'We confirm it on your next import.';
    this.mem.acted[leakId] = { state: t.state, perDay: t.leak.perDay, label: a.label, at: new Date().toISOString(), actionId: rec.id };
    this.log('action', `${a.label} · ${t.leak.title}`, { leakId, actionId: rec.id });
    this.emit();
    return rec;
  }

  undo(actionId: string): boolean {
    const rec = this.mem.actions.find((a) => a.id === actionId);
    if (!rec || rec.undone) return false;
    rec.undone = true;
    if (rec.leakId) {
      delete this.mem.acted[rec.leakId];
      const t = this.tracks.get(rec.leakId);
      if (t) Object.assign(t, { state: 'new', note: null, actionId: null, savedPerDay: 0 });
    }
    this.log('undo', `Undone: ${rec.label}`, { actionId });
    this.emit();
    return true;
  }

  dismiss(leakId: string) {
    const t = this.tracks.get(leakId);
    if (!t) return;
    t.state = 'dismissed';
    if (!this.mem.dismissed.includes(leakId)) this.mem.dismissed.push(leakId);
    this.log('info', `Dismissed: ${t.leak.title}`, { leakId });
    this.emit();
  }

  restore(leakId: string) {
    const t = this.tracks.get(leakId);
    if (!t || t.state !== 'dismissed') return;
    t.state = 'new';
    this.mem.dismissed = this.mem.dismissed.filter((x) => x !== leakId);
    this.emit();
  }

  /** A page was opened again on a phone: store the result and re-run detection. */
  applyProbe(probe: Probe) {
    const ds = this.world.dataset;
    const before = new Map([...this.tracks].filter(([, t]) => t.state === 'acting').map(([id, t]) => [id, t]));
    ds.probes = [...ds.probes.filter((p) => p.url !== probe.url), probe];
    this.fc = forecast(ds);
    const found = new Set(detectLeaks(ds).map((l) => l.id));
    for (const [id, t] of before) {
      if (t.leak.evidence.probeUrl !== probe.url) continue;
      const a = this.mem.acted[id];
      if (!found.has(id)) {
        if (a) Object.assign(a, { state: 'fixed', savedSince: new Date().toISOString() });
        this.log('verified', `Fixed ✓ ${t.leak.title} · saving ${money(t.leak.perDay, ds.account.currency)}/day`, { leakId: id });
      } else {
        if (a) a.state = 'still-leaking';
        this.log('still', `Still leaking: ${t.leak.title}`, { leakId: id });
      }
    }
    this.detect(false);
    for (const [id] of before) {
      const t = this.tracks.get(id);
      if (t && t.state === 'still-leaking') t.note = 'We opened the page again and it still has this problem.';
    }
    this.emit();
  }

  /** Several page results at once (after an import), without logging rechecks. */
  setProbes(probes: Probe[]) {
    const ds = this.world.dataset;
    const byUrl = new Map(ds.probes.map((p) => [p.url, p]));
    for (const p of probes) byUrl.set(p.url, p);
    ds.probes = [...byUrl.values()];
    this.fc = forecast(ds);
    this.detect(false);
    this.emit();
  }

  setGuard(id: string, enabled: boolean) {
    void id; void enabled; // guards need the direct Meta connection; the screen explains this
  }

  setTargetCost(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    const ds = this.world.dataset;
    ds.account.targetCost = Math.round(value);
    this.guards = defaultGuards(ds.account.targetCost, ds.account.currency);
    this.fc = forecast(ds);
    this.detect(false);
    this.emit();
  }

  tick() {
    /* a report doesn't move on its own */
  }

  adsForUrl(url: string) {
    return this.world.dataset.ads.filter((a) => stripQuery(a.landingUrl) === url);
  }

  // ------------------------------------------------------------------ helpers
  private log(kind: SimEvent['kind'], text: string, extra: { leakId?: string; actionId?: string } = {}) {
    this.mem.events.unshift({ id: `ev${++this.mem.seq}`, tick: 0, clock: hhmm(), kind, text, ...extra });
    if (this.mem.events.length > 80) this.mem.events.length = 80;
  }

  private build(): Snapshot {
    const leaks: LiveLeak[] = [...this.tracks.values()].map((t) => ({
      ...t.leak, state: t.state, verifyIn: null, savedPerDay: t.savedPerDay, note: t.note, firstSeenTick: 0, actionId: t.actionId,
    }));
    const leaking = leaks.filter((l) => !l.opportunity && (l.state === 'new' || l.state === 'still-leaking'));
    const saved = Object.values(this.mem.acted).filter((a) => a.state === 'fixed');
    const savedPerDay = saved.reduce((s, a) => s + a.perDay, 0);
    const savedTotal = saved.reduce((s, a) => s + a.perDay * Math.max(0, (Date.now() - Date.parse(a.savedSince ?? a.at)) / 864e5), 0);
    const ds = this.world.dataset;
    const imported = new Date(this.mem.importedAt);
    return {
      version: this.version, tick: 0, clock: hhmm(imported), date: ds.dates[ds.dates.length - 1], checking: false, ticksToCheck: 0,
      world: this.world,
      leaks: leaks.sort((a, b) => Number(a.opportunity) - Number(b.opportunity) || b.perDay - a.perDay),
      leakingPerDay: Math.round(leaking.reduce((a, l) => a + l.perDay, 0)),
      savedPerDay: Math.round(savedPerDay), savedTotal: Math.round(savedTotal),
      actions: [...this.mem.actions], events: [...this.mem.events], guards: this.guards.map((g) => ({ ...g })),
      forecast: this.fc, dayFraction: 1,
    };
  }
}
