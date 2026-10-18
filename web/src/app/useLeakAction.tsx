import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { adSetsFor, dailyByAdSet, shortDate, type LiveLeak } from '@shared';
import { useEngine, useMoney, useSnap } from '../lib/engine';
import { useToast } from '../lib/toast';
import { Sheet } from '../components/UI';
import { Pause, Shield } from '../components/Icons';

interface Api {
  request: (leak: LiveLeak) => void;
  undo: (actionId: string | null) => void;
}

const Ctx = createContext<Api>({ request: () => {}, undo: () => {} });
export const useLeakAction = () => useContext(Ctx);

/** Every account-changing action passes through a confirm sheet and leaves an Undo behind. */
export function LeakActionProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const snap = useSnap();
  const m = useMoney();
  const toast = useToast();
  const [pending, setPending] = useState<LiveLeak | null>(null);

  const undo = useCallback(
    (actionId: string | null) => {
      if (!actionId) return;
      if (engine.undo(actionId)) toast.show({ text: 'Undone. Everything is back as it was.', tone: 'neutral' });
    },
    [engine, toast],
  );

  const perform = useCallback(
    (leak: LiveLeak) => {
      const rec = engine.act(leak.id);
      if (!rec) return;
      if (leak.action.changesAccount) {
        const verb = leak.action.kind === 'pause' ? 'Paused' : leak.action.kind === 'move-budget' ? 'Budget moved' : 'Budget cut';
        toast.show({ text: `${verb}. We'll verify it worked.`, tone: 'neutral', undo: () => undo(rec.id) });
      } else if (leak.action.kind === 'mark-fixed') {
        toast.show({ text: 'Got it. We’ll watch the next data to confirm.', tone: 'neutral' });
      }
    },
    [engine, toast, undo],
  );

  const request = useCallback(
    (leak: LiveLeak) => {
      if (leak.action.changesAccount) setPending(leak);
      else perform(leak);
    },
    [perform],
  );

  return (
    <Ctx.Provider value={{ request, undo }}>
      {children}
      <Sheet open={!!pending} onClose={() => setPending(null)} label="Confirm change">
        {pending && <Confirm leak={pending} m={m} snap={snap} onCancel={() => setPending(null)} onConfirm={() => { perform(pending); setPending(null); }} />}
      </Sheet>
    </Ctx.Provider>
  );
}

function Confirm({ leak, m, snap, onCancel, onConfirm }: { leak: LiveLeak; m: (n: number) => string; snap: ReturnType<typeof useSnap>; onCancel: () => void; onConfirm: () => void }) {
  const ds = snap.world.dataset;
  const a = leak.action;
  const sets = adSetsFor(ds, a.adSetIds);
  const to = a.toAdSetId ? adSetsFor(ds, [a.toAdSetId])[0] : null;
  const daily = dailyByAdSet(ds);
  const last = ds.dates.length - 1;
  const week = (id: string) => daily.get(id)!.slice(last - 6).reduce((x, d) => ({ spend: x.spend + d.spend, results: x.results + d.results }), { spend: 0, results: 0 });
  const names = sets.map((s) => `“${s.name}”`).join(', ');

  let question = '';
  let detail = '';
  if (a.kind === 'pause') {
    const w = sets.reduce((x, s) => ({ spend: x.spend + week(s.id).spend, results: x.results + week(s.id).results }), { spend: 0, results: 0 });
    question = `Pause ${names}?`;
    detail = `${sets.length > 1 ? 'They' : 'It'} spent ${m(w.spend)} in the last 7 days with ${w.results} ${w.results === 1 ? 'sale' : 'sales'}. Leak since ${shortDate(leak.since)}.`;
  } else if (a.kind === 'cut-budget') {
    const s = sets[0];
    question = `Cut ${names} from ${m(s.dailyBudget)} to ${m(s.dailyBudget - (a.amount ?? 0))} a day?`;
    detail = `Each sale costs ${leak.evidence.facts[0]?.value} here. The rest of your budget is untouched.`;
  } else if (a.kind === 'move-budget' && to) {
    const s = sets[0];
    question = `Move ${m(a.amount ?? 0)} a day from ${names} to “${to.name}”?`;
    detail = `${s.name}: ${m(s.dailyBudget)} → ${m(s.dailyBudget - (a.amount ?? 0))}. ${to.name}: ${m(to.dailyBudget)} → ${m(to.dailyBudget + (a.amount ?? 0))}. Total spend stays the same.`;
  }

  return (
    <div className="confirm">
      <span className="confirm-ico">{a.kind === 'pause' ? <Pause size={22} /> : <Shield size={22} />}</span>
      <h2 className="h-sm">{question}</h2>
      <p className="muted">{detail}</p>
      <ul className="confirm-safe small">
        <li>This changes your Meta ad account now.</li>
        <li>We save how it was, so Undo puts it back exactly.</li>
        <li>We check tomorrow that it worked.</li>
      </ul>
      <div className="confirm-actions">
        <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
        <button className={`btn ${leak.opportunity ? 'btn-saved' : 'btn-primary'}`} onClick={onConfirm} autoFocus>
          {a.label}
        </button>
      </div>
    </div>
  );
}
