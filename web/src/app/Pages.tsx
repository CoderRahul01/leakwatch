import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dailyByAdSet, shortPath, stripQuery, type Probe } from '@shared';
import { useMoney, useSnap } from '../lib/engine';
import { LoadBar, PhoneFrame, PROBE_STATE, ProbeTimeline } from '../components/Probe';
import { ArrowRight, Check, ChevronLeft, Close, Info, Refresh } from '../components/Icons';
import { useLeakAction } from './useLeakAction';
import { useBase } from './Shell';

function useUrlStats() {
  const snap = useSnap();
  const ds = snap.world.dataset;
  const daily = dailyByAdSet(ds);
  const last = ds.dates.length - 1;
  return (url: string) => {
    const ads = ds.ads.filter((a) => stripQuery(a.landingUrl) === url);
    const setIds = [...new Set(ads.map((a) => a.adSetId))];
    const sets = ds.adSets.filter((s) => setIds.includes(s.id));
    const spend7 = setIds.reduce((a, id) => a + daily.get(id)!.slice(last - 6).reduce((x, d) => x + d.spend, 0), 0);
    return { ads, sets, live: ads.filter((a) => sets.find((s) => s.id === a.adSetId)?.status === 'active').length, spend7 };
  };
}

export function Pages() {
  const snap = useSnap();
  const m = useMoney();
  const base = useBase();
  const stats = useUrlStats();
  const probes = [...snap.world.dataset.probes].sort((a, b) => order(a) - order(b));
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">Page checks</span>
        <h1 className="h-lg">Every page your ads open, checked on a phone.</h1>
        <p className="lede">Once a day we open each landing page like a customer would: mid-range phone, slow 4G. We time it, follow redirects, and watch what reaches your pixel.</p>
      </header>
      <div className="ptable card">
        <div className="ptable-row head tiny mist">
          <span>Page</span><span>State</span><span>Load</span><span>Live ads</span><span>Spend 7d</span><span />
        </div>
        {probes.map((p) => {
          const s = stats(p.url);
          const st = PROBE_STATE[p.state];
          return (
            <Link key={p.url} to={`${base}/pages/${encodeURIComponent(p.url)}`} className="ptable-row">
              <span className="ptable-url">{shortPath(p.url)}</span>
              <span><span className={`chip ${st.tone}`}><i className="dot" />{st.label}</span></span>
              <span className={`num ${p.loadMs && p.loadMs > 4000 ? 'leak-c' : ''}`}>{p.loadMs ? `${(p.loadMs / 1000).toFixed(1)} s` : '—'}</span>
              <span className="num">{s.live}</span>
              <span className="num">{m(s.spend7)}</span>
              <ArrowRight size={15} className="mist" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const order = (p: Probe) => ({ issue: 0, blocked: 1, unconfirmed: 2, ok: 3 })[p.state];

export function PageCheck() {
  const { url = '' } = useParams();
  const target = decodeURIComponent(url);
  const snap = useSnap();
  const m = useMoney();
  const base = useBase();
  const stats = useUrlStats();
  const { request } = useLeakAction();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const probe = snap.world.dataset.probes.find((p) => p.url === target);

  if (!probe) {
    return (
      <div className="page">
        <Link to={`${base}/pages`} className="back"><ChevronLeft size={16} /> All pages</Link>
        <div className="card">We don't have a check for that page. It may no longer be used by a live ad.</div>
      </div>
    );
  }
  const s = stats(probe.url);
  const leak = snap.leaks.find((l) => l.evidence.probeUrl === probe.url && (l.state === 'new' || l.state === 'still-leaking' || l.state === 'acting'));
  const st = PROBE_STATE[probe.state];

  const recheck = () => {
    setNote(null);
    if (leak && leak.action.kind === 'recheck' && leak.state !== 'acting') return request(leak);
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setNote(
        probe.state === 'blocked' ? 'Still blocked by bot protection. Allow “LeakwatchProbe” in your firewall or bot settings and we’ll get through.'
        : probe.state === 'unconfirmed' ? 'Same result: the pixel waits for cookie consent. That’s normal; we can’t accept cookies for your visitors.'
        : leak ? 'Same result. Fix the issue first, then recheck.'
        : 'Checked just now. Nothing changed.',
      );
    }, 1600);
  };

  return (
    <div className="page">
      <Link to={`${base}/pages`} className="back"><ChevronLeft size={16} /> All pages</Link>
      <header className="page-head row">
        <div>
          <span className={`chip ${st.tone}`}><i className="dot" />{st.label}</span>
          <h1 className="h-md" style={{ marginTop: 12 }}>{shortPath(probe.url)}</h1>
          <p className="mist small">Checked {new Date(probe.checkedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
        <button className="btn btn-primary" onClick={recheck} disabled={busy || leak?.state === 'acting'}>
          <Refresh size={16} className={busy || leak?.state === 'acting' ? 'spin' : ''} /> Recheck now
        </button>
      </header>
      {note && <div className="state-box signal"><Info size={15} /> {note}</div>}
      {probe.note && <div className="state-box idle"><Info size={15} /> {probe.note}</div>}

      <div className="pc-grid">
        <PhoneFrame probe={probe} loading={busy || leak?.state === 'acting'} />
        <div className="pc-side">
          <div className="card">
            <h3 className="eyebrow">Load time</h3>
            <LoadBar ms={probe.loadMs} />
          </div>
          <div className="card">
            <h3 className="eyebrow">Requests</h3>
            <ProbeTimeline probe={probe} />
          </div>
          <div className="card pc-facts">
            <div>
              <span className="mist tiny">Redirects</span>
              {probe.redirects.length ? (
                <ol className="redir">{probe.redirects.map((r) => <li key={r} className="num small">{shortPath(r)}</li>)}</ol>
              ) : <p className="small">None</p>}
            </div>
            <div>
              <span className="mist tiny">Ad tags (utm, fbclid)</span>
              <p className="small">{probe.tagsKept === null ? '—' : probe.tagsKept ? <span className="saved-c"><Check size={13} style={{ display: 'inline' }} /> Kept</span> : <span className="leak-c"><Close size={13} style={{ display: 'inline' }} /> Lost on redirect</span>}</p>
            </div>
            <div>
              <span className="mist tiny">Pixel</span>
              <p className="small num">{probe.pixelIds.length ? probe.pixelIds.map((p) => `…${p.slice(-4)}`).join(', ') : 'None found'}</p>
            </div>
            <div>
              <span className="mist tiny">Events seen</span>
              <p className="small">{probe.events.length ? probe.events.map((e) => e.name + (e.eventId ? '' : ' (no ID)')).join(', ') : 'None'}</p>
            </div>
          </div>
          <div className="card">
            <h3 className="eyebrow">Ads pointing here</h3>
            <p className="small"><span className="num">{s.live}</span> live of {s.ads.length} · <span className="num">{m(s.spend7)}</span> spent in 7 days</p>
            <ul className="sets">
              {s.sets.map((set) => (
                <li key={set.id}>
                  <span className={`chip ${set.status === 'active' ? 'saved' : 'idle'}`}><i className="dot" />{set.status === 'active' ? 'On' : 'Paused'}</span>
                  <span className="sets-name">{set.name}</span>
                </li>
              ))}
            </ul>
            {leak && (
              <Link to={`${base}/leak/${encodeURIComponent(leak.id)}`} className="btn btn-sm btn-quiet" style={{ marginTop: 12 }}>
                See the leak <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
