import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adSetsFor, dailyByAdSet, explanationFor, shortDate, type LiveLeak } from '@shared';
import { useEngine, useMoney, useSnap, TICK_MS } from '../lib/engine';
import { Chain } from '../components/Chain';
import { EvidenceChart } from '../components/EvidenceChart';
import { PhoneFrame, ProbeTimeline } from '../components/Probe';
import { ArrowUpRight, Check, Close, Refresh, Undo } from '../components/Icons';
import { useLeakAction } from './useLeakAction';
import { chainFor } from './Feed';
import { useBase } from './Shell';

export function LeakDetail({ leak, onClose }: { leak: LiveLeak; onClose: () => void }) {
  const snap = useSnap();
  const engine = useEngine();
  const m = useMoney();
  const base = useBase();
  const { request, undo } = useLeakAction();
  const ds = snap.world.dataset;
  const probe = leak.evidence.probeUrl ? ds.probes.find((p) => p.url === leak.evidence.probeUrl) : undefined;
  const sets = adSetsFor(ds, leak.adSetIds);
  const daily = dailyByAdSet(ds);
  const last = ds.dates.length - 1;
  const explanation = explanationFor(leak);
  const canAct = leak.state === 'new' || leak.state === 'still-leaking';
  const secs = leak.verifyIn !== null ? Math.ceil((leak.verifyIn * TICK_MS) / 1000) : null;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  // Only this leak's step is lit in the drawing.
  const nodes = chainFor(snap, m, [{ ...leak, state: 'new' }]);

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={leak.title}>
        <header className="drawer-head">
          <span className={`chip ${leak.opportunity ? 'saved' : 'leak'}`}>{leak.opportunity ? 'Gain' : 'Leak'} · {leak.detector}</span>
          <span className={`chip ${leak.confidence === 'high' ? 'signal' : 'idle'}`}>{leak.confidence === 'high' ? 'Sure' : 'Likely'}</span>
          <button className="drawer-x" onClick={onClose} aria-label="Close"><Close size={18} /></button>
        </header>

        <h2 className="h-md drawer-title">{leak.title}</h2>
        <div className="drawer-money">
          <div>
            <span className={`num ${leak.opportunity ? 'saved-c' : 'leak-c'} drawer-amt`}>{leak.opportunity ? '+' : ''}{m(leak.perDay)}</span>
            <span className="mist small"> a day {leak.opportunity ? 'you could gain' : 'at risk'}</span>
          </div>
          <div className="mist small">{m(leak.totalSince)} since {shortDate(leak.since)}</div>
        </div>

        <Chain nodes={nodes} focus={leak.step} size="sm" />

        {leak.state === 'fixed' && (
          <div className="state-box saved"><Check size={16} /> Fixed and verified. {leak.opportunity ? 'Earning' : 'Saving'} <b className="num">{m(leak.savedPerDay)}</b> a day.</div>
        )}
        {leak.state === 'verifying' && (
          <div className="state-box signal"><Refresh size={16} className="spin" /> Waiting to verify{secs !== null ? ` · ${secs} s` : ''}. In a real account we check the next day's data.</div>
        )}
        {leak.state === 'acting' && <div className="state-box signal"><Refresh size={16} className="spin" /> Opening the page on a phone…</div>}
        {leak.state === 'still-leaking' && leak.note && <div className="state-box warn">{leak.note}</div>}

        <section className="drawer-sec">
          <h3 className="eyebrow">What we saw</h3>
          {leak.evidence.series && <EvidenceChart series={leak.evidence.series} changeIndex={leak.evidence.changeIndex} currency={ds.account.currency} partialLast={snap.dayFraction < 1} />}
          {probe && (
            <div className="probe-view">
              <PhoneFrame probe={probe} loading={leak.state === 'acting'} />
              <div className="probe-side">
                <ProbeTimeline probe={probe} />
                <Link to={`${base}/pages/${encodeURIComponent(probe.url)}`} className="link small">Full page check <ArrowUpRight size={13} style={{ display: 'inline' }} /></Link>
              </div>
            </div>
          )}
          <dl className="facts">
            {leak.evidence.facts.map((f) => (
              <div key={f.label}>
                <dt className="mist tiny">{f.label}</dt>
                <dd className="num">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="drawer-sec">
          <h3 className="eyebrow">In plain words</h3>
          <p className="explain">{explanation.text}</p>
          <p className="mist tiny">Every number here is worked out from your data, never guessed.</p>
        </section>

        <section className="drawer-sec">
          <h3 className="eyebrow">Fix it</h3>
          <ol className="steps">
            {leak.fixSteps.map((s, i) => (
              <li key={i}><span className="num">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </section>

        <section className="drawer-sec">
          <h3 className="eyebrow">Ad sets involved</h3>
          <ul className="sets">
            {sets.map((s) => {
              const w = daily.get(s.id)!.slice(last - 6).reduce((x, d) => ({ spend: x.spend + d.spend, results: x.results + d.results }), { spend: 0, results: 0 });
              return (
                <li key={s.id}>
                  <span className={`chip ${s.status === 'active' ? 'saved' : 'idle'}`}><i className="dot" />{s.status === 'active' ? 'On' : 'Paused'}</span>
                  <span className="sets-name">{s.name}</span>
                  <span className="num mist small">{m(s.dailyBudget)}/day</span>
                  <span className="num small">{m(w.spend)} · {w.results} {w.results === 1 ? 'sale' : 'sales'} <span className="mist">7d</span></span>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="drawer-foot">
          {canAct && (
            <>
              <button className="btn btn-quiet" onClick={() => { engine.dismiss(leak.id); onClose(); }}>Not a leak</button>
              <button className={`btn ${leak.opportunity ? 'btn-saved' : 'btn-primary'}`} onClick={() => request(leak)}>
                {leak.state === 'still-leaking' ? 'Recheck again' : leak.action.label}
              </button>
            </>
          )}
          {!canAct && leak.actionId && leak.action.changesAccount && (
            <button className="btn btn-quiet" onClick={() => undo(leak.actionId)}><Undo size={15} /> Undo</button>
          )}
          {!canAct && <button className="btn btn-white" onClick={onClose}>Done</button>}
        </footer>
      </aside>
    </div>
  );
}
