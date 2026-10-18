import { useState } from 'react';
import { useEngine, useMoney, useSnap } from '../lib/engine';
import { Switch } from '../components/UI';
import { Shield, Undo } from '../components/Icons';
import { useLeakAction } from './useLeakAction';

export function Guards() {
  const snap = useSnap();
  const engine = useEngine();
  const m = useMoney();
  const { undo } = useLeakAction();
  const target = snap.world.dataset.account.targetCost;
  const [draft, setDraft] = useState(String(target));
  const [err, setErr] = useState<string | null>(null);
  const guardActions = snap.actions.filter((a) => a.guardId);

  const save = () => {
    const v = Number(draft.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(v) || v < 10) return setErr('Enter what one sale may cost, at least 10.');
    if (v > 1_000_000) return setErr('That looks too high for one sale.');
    setErr(null);
    engine.setTargetCost(v);
  };

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">Guards</span>
        <h1 className="h-lg">Rules that watch overnight.</h1>
        <p className="lede">Written for you in plain words. Off until you switch them on. Every action they take is logged here with an Undo.</p>
      </header>

      <div className="card target">
        <div>
          <h3 className="h-sm">What one sale may cost</h3>
          <p className="mist small">Guards, the forecast and “spends and never sells” all use this.</p>
        </div>
        <form className="target-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <span className="target-cur num">{m(0).replace(/[\d,.\s]/g, '')}</span>
          <input className={`input num${err ? ' bad' : ''}`} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Target cost per sale" />
          <button className="btn btn-quiet" type="submit" disabled={Number(draft) === target}>Save</button>
        </form>
        {err && <p className="err">{err}</p>}
      </div>

      <div className="guard-list">
        {snap.guards.map((g) => (
          <div key={g.id} className={`card guard${g.enabled ? ' on edge live' : ''}`}>
            <span className="guard-ico"><Shield size={20} /></span>
            <div className="guard-text">
              <p className="guard-sentence">{g.sentence}</p>
              <p className="mist tiny">{g.enabled ? 'On · checks every hour' : 'Off'}</p>
            </div>
            <Switch checked={g.enabled} onChange={(v) => engine.setGuard(g.id, v)} label={g.sentence} />
          </div>
        ))}
      </div>

      <section className="page-sec">
        <h2 className="h-sm">What guards did</h2>
        {guardActions.length === 0 ? (
          <p className="muted small">Nothing yet. When a guard pauses something, it appears here with an Undo.</p>
        ) : (
          <ul className="log card">
            {guardActions.map((a) => (
              <li key={a.id} className={a.undone ? 'undone' : ''}>
                <span className="num mist tiny">{a.at}</span>
                <span className="small">{a.label}</span>
                {a.undone ? <span className="chip idle">Undone</span> : <button className="btn btn-sm btn-quiet" onClick={() => undo(a.id)}><Undo size={14} /> Undo</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
