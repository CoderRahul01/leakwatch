import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ASK_SUGGESTIONS, shortDate, STEPS, type LiveLeak, type Snapshot, type Step } from '@shared';
import { useEngine, useMoney, useSnap } from '../lib/engine';
import { useCountUp } from '../lib/hooks';
import { Chain, STEP_LABEL, type ChainNode } from '../components/Chain';
import { LeakCard } from '../components/LeakCard';
import { Switch } from '../components/UI';
import { ArrowRight, Chat, Check, Shield, Spark } from '../components/Icons';
import { useLeakAction } from './useLeakAction';
import { useBase } from './Shell';
import { LeakDetail } from './LeakDetail';

type Filter = 'all' | Step | 'gains' | 'done';

export function chainFor(snap: Snapshot, m: (n: number) => string, leaks = snap.leaks): ChainNode[] {
  const open = leaks.filter((l) => l.state === 'new' || l.state === 'still-leaking' || l.state === 'acting');
  const probes = snap.world.dataset.probes;
  return STEPS.map((step) => {
    const here = open.filter((l) => l.step === step && !l.opportunity);
    const perDay = here.reduce((a, l) => a + l.perDay, 0);
    if (step === 'sale') {
      const gain = open.filter((l) => l.opportunity).reduce((a, l) => a + l.perDay, 0);
      return gain > 0 ? { step, health: 'gain', caption: `+${m(gain)}/day` } : { step, health: 'idle', caption: 'Orders not linked' };
    }
    if (perDay > 0) return { step, health: perDay >= 700 ? 'leak' : 'warn', caption: `${m(perDay)}/day` };
    const unchecked = probes.filter((p) => p.state === 'blocked' || p.state === 'unconfirmed').length;
    if (step === 'page' && unchecked > 0) return { step, health: 'ok', caption: `OK · ${unchecked} unchecked` };
    return { step, health: 'ok', caption: 'Healthy' };
  });
}

export function Feed() {
  const snap = useSnap();
  const m = useMoney();
  const base = useBase();
  const nav = useNavigate();
  const { id } = useParams();
  const { request, undo } = useLeakAction();
  const [filter, setFilter] = useState<Filter>('all');
  const leaking = useCountUp(snap.leakingPerDay);
  const saved = useCountUp(snap.savedTotal, 600);

  // Leaks that appeared after the page opened get a short flash.
  const firstTick = useRef(snap.tick);
  const fresh = (l: LiveLeak) => l.firstSeenTick > firstTick.current && snap.tick - l.firstSeenTick < 6;

  const visible = snap.leaks.filter((l) => l.state !== 'dismissed');
  const open = visible.filter((l) => l.state !== 'fixed');
  const done = visible.filter((l) => l.state === 'fixed');
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: open.length, gains: open.filter((l) => l.opportunity).length, done: done.length };
    for (const s of STEPS) c[s] = open.filter((l) => l.step === s && !l.opportunity).length;
    return c;
  }, [open, done]);

  // Fixed leaks stay at the bottom of "All", collapsed, so the saved amount can fly out of them.
  const list =
    filter === 'all' ? [...open, ...done]
    : filter === 'done' ? done
    : filter === 'gains' ? open.filter((l) => l.opportunity)
    : open.filter((l) => l.step === filter && !l.opportunity);

  const nodes = chainFor(snap, m);
  const openLeaks = open.filter((l) => !l.opportunity && (l.state === 'new' || l.state === 'still-leaking'));
  const lastSince = openLeaks.reduce<string | null>((a, l) => (!a || l.since < a ? l.since : a), null);
  const totalSince = openLeaks.reduce((a, l) => a + l.totalSince, 0);
  const selected = id ? snap.leaks.find((l) => l.id === decodeURIComponent(id)) ?? null : null;

  useEffect(() => {
    if (id && !selected) nav(base, { replace: true });
  }, [id, selected, nav, base]);

  return (
    <div className="feed-grid">
      <section className="feed-main">
        <div className="hero-card card glow">
          {snap.leakingPerDay > 0 ? (
            <>
              <span className="eyebrow">Leaking right now</span>
              <div className="money-hero">
                <span className="num leak-c">{m(leaking)}</span>
                <span className="money-unit">/day</span>
              </div>
              <p className="muted small">
                {openLeaks.length} {openLeaks.length === 1 ? 'leak' : 'leaks'} · {m(totalSince)} lost{lastSince ? ` since ${shortDate(lastSince)}` : ''}. Tap a step to see only its leaks.
              </p>
            </>
          ) : (
            <div className="calm">
              <span className="calm-ring"><Check size={28} /></span>
              <div>
                <h2 className="h-md">Nothing leaking.</h2>
                <p className="muted">Last check {snap.clock}. We keep watching every hour and open your pages on a phone every day.</p>
              </div>
            </div>
          )}
          <Chain nodes={nodes} focus={STEPS.includes(filter as Step) ? (filter as Step) : null} onPick={(s) => setFilter((f) => (f === s ? 'all' : s))} />
        </div>

        <div className="saved-card card" id="saved-counter">
          <span className="saved-ico"><Spark size={18} /></span>
          {snap.savedPerDay > 0 ? (
            <div>
              <div className="saved-line">
                <span className="num saved-c saved-big">{m(snap.savedPerDay)}</span>
                <span className="muted">/day saved</span>
              </div>
              <p className="mist small">{m(saved)} kept so far today from {done.length} verified {done.length === 1 ? 'fix' : 'fixes'}</p>
            </div>
          ) : (
            <div>
              <div className="saved-line"><span className="num saved-c saved-big">{m(0)}</span><span className="muted">saved so far</span></div>
              <p className="mist small">Fix a leak and the money you keep lands here once we verify it.</p>
            </div>
          )}
        </div>

        <div className="filters" role="tablist" aria-label="Filter leaks">
          {(['all', ...STEPS.filter((s) => s !== 'sale'), 'gains', 'done'] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={`fchip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'gains' ? 'Gains' : f === 'done' ? 'Fixed' : STEP_LABEL[f as Step]}
              <span className="num">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="lcards">
          {list.map((l) => (
            <LeakCard
              key={l.id}
              leak={l}
              m={m}
              fresh={fresh(l)}
              onOpen={() => nav(`${base}/leak/${encodeURIComponent(l.id)}`)}
              onAct={() => request(l)}
              onUndo={l.actionId && l.action.changesAccount ? () => undo(l.actionId) : undefined}
            />
          ))}
          {list.length === 0 && (
            <div className="lcards-empty card">
              {filter === 'done' ? 'No verified fixes yet. Act on a leak and we confirm it here.' : filter === 'all' ? 'All clear. We keep watching.' : `No ${filter === 'gains' ? 'gains' : STEP_LABEL[filter as Step].toLowerCase() + ' leaks'} right now.`}
            </div>
          )}
        </div>
      </section>

      <Rail />

      {selected && <LeakDetail leak={selected} onClose={() => nav(base)} />}
    </div>
  );
}

function Rail() {
  const snap = useSnap();
  const engine = useEngine();
  const base = useBase();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const name = (id: string) => snap.world.dataset.adSets.find((s) => s.id === id)?.name ?? id;
  const top = snap.forecast.filter((f) => f.probability !== null).slice(0, 3);

  return (
    <aside className="rail">
      <div className="card rail-card">
        <div className="rail-head">
          <Shield size={16} /> <b>Guards</b>
          <Link to={`${base}/guards`} className="link tiny">All</Link>
        </div>
        {snap.guards.map((g) => (
          <label key={g.id} className="rail-guard">
            <span className="small">{g.sentence}</span>
            <Switch checked={g.enabled} onChange={(v) => engine.setGuard(g.id, v)} label={g.sentence} />
          </label>
        ))}
      </div>

      <div className="card rail-card">
        <div className="rail-head">
          <span className="eyebrow">Tomorrow</span>
          <Link to={`${base}/forecast`} className="link tiny">All</Link>
        </div>
        {top.map((f) => (
          <div key={f.adSetId} className="rail-fc">
            <div className="rail-fc-top small">
              <span>{name(f.adSetId)}</span>
              <span className="num">{Math.round((f.probability ?? 0) * 100)}%</span>
            </div>
            <div className={`fbar v-${f.verdict}`}><i style={{ width: `${(f.probability ?? 0) * 100}%` }} /></div>
          </div>
        ))}
        <p className="mist tiny">Chance each misses your target cost tomorrow.</p>
      </div>

      <form
        className="card rail-card"
        onSubmit={(e) => {
          e.preventDefault();
          nav(`${base}/ask?q=${encodeURIComponent(q || ASK_SUGGESTIONS[0])}`);
        }}
      >
        <div className="rail-head"><Chat size={16} /> <b>Ask</b></div>
        <input className="input" placeholder={ASK_SUGGESTIONS[0]} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask a question" />
        <button className="btn btn-sm btn-quiet" type="submit">Ask <ArrowRight size={14} /></button>
      </form>

      <div className="card rail-card">
        <div className="rail-head"><b>Live</b><Link to={`${base}/activity`} className="link tiny">All</Link></div>
        <ul className="rail-log">
          {snap.events.slice(0, 5).map((e) => (
            <li key={e.id} className={`k-${e.kind}`}>
              <span className="num mist tiny">{e.clock}</span>
              <span className="small">{e.text}</span>
            </li>
          ))}
          {snap.events.length === 0 && <li className="mist small rail-quiet">Quiet so far. New leaks, fixes and guard actions show up here.</li>}
        </ul>
      </div>
    </aside>
  );
}
