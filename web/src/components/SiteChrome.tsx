import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { ArrowRight, Close, Github } from './Icons';
import { useSession } from '../lib/session';

export function Announcement() {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem('lw.ann') !== '0';
    } catch {
      return true;
    }
  });
  if (!open) return null;
  return (
    <div className="ann">
      <span>Open source for Hacktoberfest · open models explain every leak</span>
      <a className="ann-link" href="https://github.com/CoderRahul01/leakwatch" target="_blank" rel="noreferrer">
        See the code <ArrowRight size={13} />
      </a>
      <button
        className="ann-x"
        aria-label="Dismiss"
        onClick={() => {
          setOpen(false);
          try {
            sessionStorage.setItem('lw.ann', '0');
          } catch {
            /* ignore */
          }
        }}
      >
        <Close size={14} />
      </button>
    </div>
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const session = useSession();
  const { pathname } = useLocation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setMenu(false), [pathname]);
  const home = pathname === '/';
  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}${menu ? ' open' : ''}`}>
      <div className="wrap nav-in">
        <Link to="/" aria-label="Leakwatch home"><Logo /></Link>
        <nav className="nav-links">
          <a href={home ? '#chain' : '/#chain'}>How it works</a>
          <a href={home ? '#compare' : '/#compare'}>Why us</a>
          <Link to="/pricing">Pricing</Link>
          <a href={home ? '#faq' : '/#faq'}>FAQ</a>
        </nav>
        <div className="nav-cta">
          {session.email ? (
            <Link to={session.accountName ? '/app' : '/connect'} className="nav-login">Open app</Link>
          ) : (
            <Link to="/signin" className="nav-login">Log in</Link>
          )}
          <Link to="/demo" className="btn btn-white btn-sm">Live demo</Link>
          <button className="nav-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <i /><i />
          </button>
        </div>
      </div>
      {menu && (
        <div className="nav-sheet">
          <a href="/#chain" onClick={() => setMenu(false)}>How it works</a>
          <a href="/#compare" onClick={() => setMenu(false)}>Why us</a>
          <Link to="/pricing">Pricing</Link>
          <a href="/#faq" onClick={() => setMenu(false)}>FAQ</a>
          <Link to="/signin">Log in</Link>
        </div>
      )}
    </header>
  );
}

const PARTNERS = [
  ['Gemma', 'open model'],
  ['Cloudflare Workers AI', 'runs it'],
  ['TabPFN · Prior Labs', 'forecast'],
  ['Playwright on Render', 'page checks'],
  ['Meta Marketing API', 'ad data'],
  ['Neon', 'database'],
  ['Dodo Payments', 'billing'],
  ['Sentry', 'tracing'],
] as const;

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-top">
          <div>
            <Logo />
            <p className="mist small foot-tag">Every rupee from ad to sale, watched.</p>
          </div>
          <div className="foot-cols">
            <div>
              <b className="tiny">Product</b>
              <Link to="/demo">Live demo</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/signin">Log in</Link>
            </div>
            <div>
              <b className="tiny">Open source</b>
              <a href="https://github.com/CoderRahul01/leakwatch" target="_blank" rel="noreferrer"><Github size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> GitHub</a>
              <a href="https://dev.to/challenges/hacktoberfest-week2-2026-10-12" target="_blank" rel="noreferrer">Hacktoberfest</a>
              <span className="mist">AGPL-3.0</span>
            </div>
          </div>
        </div>
        <div className="foot-partners">
          <span className="mist tiny">Built with</span>
          <ul>
            {PARTNERS.map(([n, r]) => (
              <li key={n}><b>{n}</b> <span className="mist">{r}</span></li>
            ))}
          </ul>
        </div>
        <p className="mist tiny foot-legal">Leakwatch is not affiliated with Meta. Demo numbers are simulated.</p>
      </div>
    </footer>
  );
}
