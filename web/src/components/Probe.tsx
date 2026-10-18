import type { Probe } from '@shared';
import { shortPath } from '@shared';
import { Check, Close, Info, Lock, Refresh } from './Icons';

/** A phone showing what the probe saw when it opened the page. Drawn, not a screenshot, in the demo. */
export function PhoneFrame({ probe, loading = false }: { probe: Probe; loading?: boolean }) {
  const path = shortPath(probe.finalUrl ?? probe.url);
  const host = (() => {
    try {
      return new URL(probe.finalUrl ?? probe.url).hostname;
    } catch {
      return '';
    }
  })();
  const kind =
    probe.state === 'blocked' ? 'blocked'
    : probe.status && probe.status >= 400 ? 'gone'
    : probe.loadMs && probe.loadMs > 4000 ? 'slow'
    : path.includes('quiz') ? 'quiz'
    : 'shop';

  return (
    <div className="phone" aria-label={`Phone view of ${host}${path}`}>
      <div className="phone-notch" />
      <div className="phone-bar">
        <Lock size={10} />
        <span>{host}</span>
      </div>
      <div className={`phone-screen k-${kind}`}>
        {loading && (
          <div className="phone-loading">
            <Refresh size={22} className="spin" />
            <span>Opening on a phone…</span>
          </div>
        )}
        {!loading && kind === 'gone' && (
          <div className="pg-gone">
            <div className="pg-logo">kora</div>
            <div className="pg-404 num">{probe.status}</div>
            <p>Sorry, this page is gone.</p>
            <span className="pg-btn">Back to shop</span>
          </div>
        )}
        {!loading && kind === 'blocked' && (
          <div className="pg-blocked">
            <div className="pg-spinner" />
            <p>Checking your browser before you continue…</p>
            <small>Bot protection</small>
          </div>
        )}
        {!loading && kind === 'slow' && (
          <div className="pg-shop">
            <div className="pg-head"><span className="pg-logo">kora</span><span className="pg-cart" /></div>
            <div className="pg-hero slow"><span className="pg-load" /></div>
            <div className="pg-line w70" />
            <div className="pg-line w40" />
            <div className="pg-slow num">{((probe.loadMs ?? 0) / 1000).toFixed(1)} s</div>
          </div>
        )}
        {!loading && kind === 'quiz' && (
          <div className="pg-quiz">
            <div className="pg-head"><span className="pg-logo">kora</span></div>
            <p className="pg-q">Which scent fits your evenings?</p>
            {['Warm & woody', 'Fresh & green', 'Sweet & cosy'].map((o) => (
              <span key={o} className="pg-opt">{o}</span>
            ))}
            <span className="pg-btn">See my match</span>
          </div>
        )}
        {!loading && kind === 'shop' && (
          <div className="pg-shop">
            <div className="pg-head"><span className="pg-logo">kora</span><span className="pg-cart" /></div>
            <div className="pg-hero">
              <span className="pg-candle"><i /></span>
            </div>
            <div className="pg-line w70" />
            <div className="pg-line w40" />
            <span className="pg-btn">Add to cart</span>
            {probe.consentBanner && <div className="pg-consent">We use cookies. <b>Accept</b></div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProbeTimeline({ probe }: { probe: Probe }) {
  const max = Math.max(1, ...probe.requests.map((r) => r.at));
  return (
    <ol className="ptl">
      {probe.requests.map((r, i) => (
        <li key={i} className={r.ok ? 'ok' : 'bad'} style={{ animationDelay: `${i * 90}ms` }}>
          <span className="ptl-ico">{r.ok ? <Check size={13} /> : <Close size={13} />}</span>
          <span className="ptl-label">{r.label}</span>
          {r.status !== undefined && <span className="ptl-status num">{r.status}</span>}
          <span className="ptl-bar"><i style={{ width: `${Math.max(3, (r.at / max) * 100)}%` }} /></span>
          <span className="ptl-at num">{r.at >= 1000 ? `${(r.at / 1000).toFixed(1)} s` : `${r.at} ms`}</span>
        </li>
      ))}
    </ol>
  );
}

export function LoadBar({ ms }: { ms: number | null }) {
  if (ms === null) return <p className="mist small"><Info size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> No load time: we couldn't open the page.</p>;
  const limit = 4000;
  const scale = Math.max(8000, ms);
  return (
    <div className="loadbar">
      <div className="loadbar-track">
        <i className={ms > limit ? 'bad' : 'ok'} style={{ width: `${(ms / scale) * 100}%` }} />
        <span className="loadbar-limit" style={{ left: `${(limit / scale) * 100}%` }}>4 s</span>
      </div>
      <div className="loadbar-read">
        <span className={`num ${ms > limit ? 'leak-c' : 'saved-c'}`}>{(ms / 1000).toFixed(1)} s</span>
        <span className="mist small"> on a mid-range phone, slow 4G</span>
      </div>
    </div>
  );
}

export const PROBE_STATE: Record<Probe['state'], { label: string; tone: 'saved' | 'leak' | 'warn' | 'idle' }> = {
  ok: { label: 'Healthy', tone: 'saved' },
  issue: { label: 'Leaking', tone: 'leak' },
  unconfirmed: { label: "Couldn't confirm", tone: 'warn' },
  blocked: { label: "Couldn't check", tone: 'idle' },
};
