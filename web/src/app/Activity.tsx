import { useSnap } from '../lib/engine';
import { Check, Close, Drop, Info, Shield, Undo } from '../components/Icons';
import { useLeakAction } from './useLeakAction';

const ICON = { detected: Drop, action: Check, verified: Check, still: Close, guard: Shield, undo: Undo, info: Info } as const;

export function Activity() {
  const snap = useSnap();
  const { undo } = useLeakAction();
  const actions = new Map(snap.actions.map((a) => [a.id, a]));
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">Activity</span>
        <h1 className="h-lg">Everything that changed, and who changed it.</h1>
        <p className="lede">Every change to your account is here with the state it replaced. Undo works from this list at any time.</p>
      </header>
      {snap.events.length === 0 ? (
        <div className="card muted">Quiet so far. Act on a leak or leave the demo running: guards and new leaks show up here.</div>
      ) : (
        <ol className="timeline">
          {snap.events.map((e) => {
            const Icon = ICON[e.kind];
            const rec = e.actionId ? actions.get(e.actionId) : undefined;
            const canUndo = rec && !rec.undone && rec.previous.length > 0 && e.kind !== 'undo';
            return (
              <li key={e.id} className={`tl k-${e.kind}`}>
                <span className="tl-ico"><Icon size={14} /></span>
                <span className="tl-time num mist tiny">{e.clock}</span>
                <span className="tl-text">{e.text}</span>
                {canUndo && <button className="btn btn-sm btn-quiet" onClick={() => undo(rec!.id)}><Undo size={14} /> Undo</button>}
                {rec?.undone && e.kind !== 'undo' && <span className="chip idle">Undone</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
