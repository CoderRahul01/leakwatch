import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSnap, TICK_MS } from '../lib/engine';
import { useToast } from '../lib/toast';
import { useOnline } from '../lib/hooks';
import { setSession, useSession } from '../lib/session';
import { PREVIEW } from '../lib/api';
import { LogoMark } from '../components/Logo';
import { StatusPill } from '../components/UI';
import { Chart, Chat, ChevronDown, Close, Drop, Gear, Globe, Info, List, Plug, Shield, Wifi } from '../components/Icons';
import { useLeakAction } from './useLeakAction';

export type Mode = 'demo' | 'account';

export function useBase(): string {
  const { pathname } = useLocation();
  return pathname.startsWith('/app') ? '/app' : '/demo';
}

/** Moves a copy of a fixed card's amount into the Saved counter. */
function flyToSaved(leakId: string) {
  const from = document.querySelector<HTMLElement>(`[data-leak="${CSS.escape(leakId)}"] [data-amount]`);
  const to = document.getElementById('saved-counter');
  if (!from || !to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.className = 'fly num';
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px` });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  ghost
    .animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.15)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(.5,0,.3,1)' },
    )
    .finished.then(() => {
      ghost.remove();
      to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 380 });
    })
    .catch(() => ghost.remove());
}

export function Shell({ mode, children }: { mode: Mode; children: ReactNode }) {
  const snap = useSnap();
  const toast = useToast();
  const session = useSession();
  const online = useOnline();
  const base = mode === 'demo' ? '/demo' : '/app';
  const nav = useNavigate();
  const { undo } = useLeakAction();
  const [acctOpen, setAcctOpen] = useState(false);
  const pro = mode === 'demo' || session.plan === 'pro';

  // Toasts for things that happen on their own: guards firing, fixes verified, new leaks.
  const seen = useRef(new Set(snap.events.map((e) => e.id)));
  useEffect(() => {
    for (const ev of [...snap.events].reverse()) {
      if (seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      if (ev.kind === 'guard') toast.show({ text: ev.text, tone: 'guard', undo: ev.actionId ? () => undo(ev.actionId!) : undefined });
      if (ev.kind === 'verified') {
        toast.show({ text: ev.text, tone: 'saved' });
        if (ev.leakId) requestAnimationFrame(() => flyToSaved(ev.leakId!));
      }
      if (ev.kind === 'still') toast.show({ text: ev.text, tone: 'leak' });
      if (ev.kind === 'detected') toast.show({ text: ev.text, tone: 'leak' });
    }
  }, [snap.events, toast, undo]);

  const open = snap.leaks.filter((l) => l.state === 'new' || l.state === 'still-leaking');
  const pageIssues = snap.world.dataset.probes.filter((p) => p.state === 'issue').length;
  const expired = mode === 'account' && session.tokenExpired;
  const secs = Math.ceil((snap.ticksToCheck * TICK_MS) / 1000);
  const dayDone = snap.dayFraction >= 0.98;

  const items = [
    { to: base, end: true, icon: <Drop size={18} />, label: 'Leaks', count: open.length },
    { to: `${base}/pages`, icon: <Globe size={18} />, label: 'Pages', count: pageIssues },
    { to: `${base}/guards`, icon: <Shield size={18} />, label: 'Guards', lock: !pro },
    { to: `${base}/forecast`, icon: <Chart size={18} />, label: 'Forecast', lock: !pro },
    { to: `${base}/ask`, icon: <Chat size={18} />, label: 'Ask', lock: !pro },
    { to: `${base}/activity`, icon: <List size={18} />, label: 'Activity' },
    { to: `${base}/settings`, icon: <Gear size={18} />, label: 'Settings' },
  ];

  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="side-logo" aria-label="Leakwatch home">
          <LogoMark size={30} />
          <span className="logo-word">Leakwatch</span>
        </Link>
        <nav className="side-nav">
          {items.map((it) => (
            <NavLink key={it.label} to={it.to} end={it.end} className="side-item">
              {it.icon}
              <span>{it.label}</span>
              {it.lock ? <span className="chip signal tiny">Pro</span> : it.count ? <span className="side-count num">{it.count}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          {mode === 'demo' ? (
            <Link to="/signin?next=/connect" className="side-cta">
              <Plug size={16} /> Connect your account
            </Link>
          ) : !pro ? (
            <Link to="/pricing" className="side-cta">
              <Shield size={16} /> Go Pro · $19/month
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="main">
        {mode === 'demo' && (
          <div className="banner demo">
            <Info size={15} />
            <span>
              Demo account. Numbers are simulated and time runs fast: 1 second here is about 3 minutes.{' '}
              <Link to="/signin?next=/connect" className="link">Connect yours</Link>
            </span>
          </div>
        )}
        {mode === 'account' && PREVIEW && !session.bannerDismissed && (
          <div className="banner demo">
            <Info size={15} />
            <span>Preview: you're seeing the sample account. Your Meta data replaces it once the Leakwatch server is switched on.</span>
            <button className="banner-x" aria-label="Dismiss" onClick={() => setSession({ bannerDismissed: true })}><Close size={14} /></button>
          </div>
        )}
        {expired && (
          <div className="banner bad">
            <Info size={15} />
            <span>Meta access expired, so checks stopped. Your leaks below are from the last check.</span>
            <button className="btn btn-sm btn-white" onClick={() => { setSession({ tokenExpired: false }); toast.show({ text: 'Reconnected. Checking now.', tone: 'saved' }); }}>Reconnect</button>
          </div>
        )}
        {!online && (
          <div className="banner warn">
            <Wifi size={15} />
            <span>You're offline. Numbers will catch up when you're back.</span>
          </div>
        )}

        <header className="top">
          <div className="acct">
            <button className="acct-btn" onClick={() => setAcctOpen((v) => !v)} aria-expanded={acctOpen}>
              <span className="acct-av">{snap.world.dataset.account.name.slice(0, 1)}</span>
              <span className="acct-name">{mode === 'account' && session.accountName ? session.accountName : snap.world.dataset.account.name}</span>
              <span className="mist tiny">{snap.world.dataset.account.currency}</span>
              <ChevronDown size={14} />
            </button>
            {acctOpen && (
              <div className="acct-menu" onMouseLeave={() => setAcctOpen(false)}>
                <div className="acct-row on">
                  <span className="acct-av">{snap.world.dataset.account.name.slice(0, 1)}</span>
                  {snap.world.dataset.account.name}
                  <span className="chip saved tiny">Watching</span>
                </div>
                <button
                  className="acct-row"
                  onClick={() => {
                    setAcctOpen(false);
                    if (!pro) nav('/pricing');
                    else nav(mode === 'demo' ? '/signin?next=/connect' : '/connect');
                  }}
                >
                  <Plug size={15} /> Add an account {pro ? <span className="mist tiny">1 of 5</span> : <span className="chip signal tiny">Pro</span>}
                </button>
              </div>
            )}
          </div>
          <div className="top-right">
            <span className="top-clock mist tiny num" title="Account time">{snap.clock}</span>
            {expired ? (
              <StatusPill tone="warn" text="Paused · reconnect Meta" />
            ) : dayDone ? (
              <StatusPill tone="idle" text="Day closing · next sync at midnight" />
            ) : (
              <StatusPill checking={snap.checking} text={snap.checking ? 'Checking now…' : `Watching · next check in ${secs} s`} />
            )}
            <button className="btn btn-sm btn-quiet top-ask" onClick={() => nav(`${base}/ask`)}>
              <Chat size={15} /> Ask
            </button>
          </div>
        </header>

        <div className="content">{children}</div>
      </div>

      <nav className="tabs" aria-label="Sections">
        {items.slice(0, 5).map((it) => (
          <NavLink key={it.label} to={it.to} end={it.end} className="tab">
            {it.icon}
            <span>{it.label}</span>
            {it.count ? <i className="tab-dot" /> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
