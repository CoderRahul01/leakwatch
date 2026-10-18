import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { STEPS, type Step } from '@shared';
import { EngineProvider, useMoney, useSnap, TICK_MS } from '../lib/engine';
import { useCountUp, useReducedMotion, useReveal, useScrollProgress, useScrollY } from '../lib/hooks';
import { Announcement, SiteFooter, SiteNav } from '../components/SiteChrome';
import { Chain, STEP_LABEL, type ChainNode } from '../components/Chain';
import { StatusPill } from '../components/UI';
import { LogoMark } from '../components/Logo';
import { Pricing } from './Pricing';
import {
  ArrowRight, Bolt, Chat, Check, ChevronDown, Close, Drop, Eye, Globe, Mail, Pause, Plug, Pulse, Refresh, Shield, Spark, STEP_ICON, Undo,
} from '../components/Icons';

// Leaks drifting around the hero. Each one is a real detector.
const TAGS: { text: string; color: string; x: number; y: number; r: number; depth: number; icon: keyof typeof TAG_ICONS }[] = [
  { text: 'Pixel went quiet', color: 'var(--tag-coral)', x: 4, y: 9, r: -9, depth: 1.2, icon: 'pulse' },
  { text: '404 on phones', color: 'var(--tag-violet)', x: 80, y: 8, r: 8, depth: 0.8, icon: 'globe' },
  { text: 'Tags dropped', color: 'var(--tag-sky)', x: 87, y: 36, r: -6, depth: 1.4, icon: 'bolt' },
  { text: 'Tired audience', color: 'var(--tag-tangerine)', x: 1, y: 40, r: 11, depth: 0.9, icon: 'eye' },
  { text: 'Price spike', color: 'var(--tag-pink)', x: 84, y: 62, r: -11, depth: 1.1, icon: 'spark' },
  { text: 'Counted twice', color: 'var(--tag-sun)', x: 3, y: 66, r: 6, depth: 1.3, icon: 'refresh' },
  { text: 'Spends, never sells', color: 'var(--tag-ember)', x: 58, y: 1.5, r: -4, depth: 0.7, icon: 'drop' },
  { text: 'Winner starved', color: 'var(--tag-lime)', x: 88, y: 84, r: 9, depth: 1, icon: 'spark' },
  { text: '7.8 s to load', color: 'var(--tag-slate)', x: 24, y: 2.5, r: 7, depth: 1.25, icon: 'globe' },
];
const TAG_ICONS = { pulse: Pulse, globe: Globe, bolt: Bolt, eye: Eye, spark: Spark, refresh: Refresh, drop: Drop } as const;

function FloatingTags() {
  const y = useScrollY();
  const reduced = useReducedMotion();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (reduced) return;
    const on = (e: PointerEvent) => setMouse({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 });
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, [reduced]);
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // As you scroll, the leaks are pulled down into the watcher below and disappear.
  const p = reduced ? 0 : Math.min(1, y / (vh * 0.75));
  return (
    <div className="tags" aria-hidden>
      {TAGS.map((t, i) => {
        const Icon = TAG_ICONS[t.icon];
        const toX = (50 - t.x) * p * 0.9;
        const toY = (108 - t.y) * p;
        const style: CSSProperties = {
          left: `${t.x}%`,
          top: `${t.y}%`,
          ['--c' as string]: t.color,
          ['--r' as string]: `${t.r * (1 - p)}deg`,
          ['--fd' as string]: `${5 + (i % 4)}s`,
          ['--fdl' as string]: `${-i * 0.7}s`,
          transform: `translate(calc(${toX}vw + ${mouse.x * 18 * t.depth}px), calc(${toY}vh + ${mouse.y * 18 * t.depth}px)) scale(${1 - p * 0.55})`,
          opacity: 1 - p * 1.1,
        };
        return (
          <span key={t.text} className="ftag" style={style}>
            <span className="ftag-in">
              <Icon size={14} /> {t.text}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function useHeroLeak() {
  const snap = useSnap();
  const m = useMoney();
  const t3 = snap.leaks.find((l) => l.detector === 'T3');
  return { snap, m, t3 };
}

function HeroChainCard() {
  const { snap, m, t3 } = useHeroLeak();
  const nodes: ChainNode[] = STEPS.map((s) => ({
    step: s,
    health: s === 'tracking' ? 'leak' : s === 'sale' ? 'idle' : 'ok',
    caption: s === 'tracking' && t3 ? `${m(t3.perDay)}/day` : s === 'sale' ? 'not credited' : 'OK',
  }));
  const secs = Math.ceil((snap.ticksToCheck * TICK_MS) / 1000);
  return (
    <div className="hero-chain card glow edge live" style={{ ['--edge-c' as string]: 'var(--leak)' }}>
      <div className="hero-chain-top">
        <StatusPill checking={snap.checking} text={snap.checking ? 'Checking now…' : `Watching · next check in ${secs} s`} />
        <span className="mist tiny">Demo account · simulated</span>
      </div>
      <Chain nodes={nodes} focus="tracking" />
      {t3 && (
        <div className="hero-chain-leak">
          <span className="chip leak"><Pulse size={13} /> Tracking</span>
          <p>
            Purchase stopped reaching Meta. <span className="num leak-c">{m(t3.perDay)}/day</span>{' '}
            <span className="mist">spent optimising blind.</span>
          </p>
          <Link to={`/demo/leak/${encodeURIComponent(t3.id)}`} className="btn btn-sm btn-primary">See the leak <ArrowRight size={14} /></Link>
        </div>
      )}
    </div>
  );
}

function Laurel() {
  return (
    <svg viewBox="0 0 34 52" width="17" height="26" aria-hidden className="laurel">
      <path d="M28 50C12 44 5 30 8 6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {[10, 18, 26, 34, 42].map((y, i) => (
        <ellipse key={y} cx={8 + i * 2.2} cy={y} rx="5.5" ry="2.4" transform={`rotate(${-50 + i * 6} ${8 + i * 2.2} ${y})`} fill="none" stroke="currentColor" strokeWidth="1.1" />
      ))}
    </svg>
  );
}

const BADGES = ['Read-only until you tap', 'Undo on every change', 'Open models explain', 'Your data trains nothing'];

const STEP_STORY: Record<Step, { line: string; leaks: string[] }> = {
  spend: { line: 'Ad sets that spend and never sell, tired audiences, sudden price jumps.', leaks: ['Spends, never sells', 'Costs too much per sale', 'Seen too often', 'Price spike'] },
  click: { line: 'The click leaves Meta. A short link or redirect can strip the tags that say which ad it came from.', leaks: ['Tags dropped on redirect'] },
  page: { line: 'We open every landing page on a mid-range phone, slow 4G, like your customer does.', leaks: ['Broken link', 'Slow on phones', 'Lands on another site'] },
  tracking: { line: 'The expensive, invisible one. When the pixel breaks, Meta optimises on bad data and finds worse buyers.', leaks: ['No pixel', 'Wrong pixel', 'Sales went silent', 'Counted twice'] },
  sale: { line: 'Where the money should end up. We find winners starved of budget and move money to them, with your OK.', leaks: ['Winner starved'] },
};

function ChainStory() {
  const { snap, m } = useHeroLeak();
  const [ref, p] = useScrollProgress<HTMLDivElement>();
  const active = Math.min(4, Math.floor(p * 5.2));
  const byStep = useMemo(() => {
    const o: Record<string, number> = {};
    for (const s of STEPS) o[s] = snap.leaks.filter((l) => l.step === s).reduce((a, l) => a + l.perDay, 0);
    return o;
  }, [snap.leaks]);
  const nodes: ChainNode[] = STEPS.map((s, i) => ({
    step: s,
    health: i < active ? (byStep[s] > 0 ? (s === 'sale' ? 'gain' : 'leak') : 'ok') : i === active ? 'checking' : 'idle',
    caption: i <= active ? (byStep[s] > 0 ? `${s === 'sale' ? '+' : ''}${m(byStep[s])}/day` : 'OK') : '…',
  }));
  return (
    <section id="chain" className="story band-1">
      <div className="story-track" ref={ref}>
        <div className="story-sticky wrap">
          <div className="story-copy">
            <span className="eyebrow big">The chain</span>
            <h2 className="h-lg">Money leaks at five steps. Most tools watch one.</h2>
            <div className="story-steps">
              {STEPS.map((s, i) => {
                const Icon = STEP_ICON[s];
                return (
                  <div key={s} className={`story-step${i === active ? ' on' : ''}${i < active ? ' done' : ''}`}>
                    <span className="story-n num">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className="h-sm"><Icon size={18} /> {STEP_LABEL[s]}</h3>
                      <p className="muted">{STEP_STORY[s].line}</p>
                      <div className="story-leaks">
                        {STEP_STORY[s].leaks.map((l) => <span key={l} className="chip">{l}</span>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="story-visual">
            <div className="card glow story-card">
              <span className="mist tiny">Following the demo account through the chain</span>
              <Chain nodes={nodes} focus={STEPS[active]} size="lg" />
              <div className="story-meter">
                <span className="mist small">Found so far</span>
                <span className="num leak-c">{m(STEPS.slice(0, active + 1).filter((s) => s !== 'sale').reduce((a, s) => a + byStep[s], 0))}/day</span>
              </div>
              <div className="story-progress"><i style={{ width: `${p * 100}%` }} /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Loop() {
  return (
    <section className="loop band-0">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow big">The loop</span>
          <h2 className="h-lg">Watch. Pinpoint. Stop. Verify.</h2>
          <p className="lede">It doesn’t hand you a report. It keeps watching, and checks that every fix actually worked.</p>
        </div>
        <div className="loop-grid">
          <article className="card loop-card reveal edge" style={{ ['--d' as string]: '0ms' }}>
            <div className="loop-art art-watch"><span className="status-pill tone-saved"><span className="status-dot" /> Watching</span><div className="art-rows"><i /><i /><i /></div></div>
            <h3 className="h-sm">Watch</h3>
            <p className="muted small">Every hour we read each ad’s numbers. Every day we open each landing page on a phone.</p>
          </article>
          <article className="card loop-card reveal edge" style={{ ['--d' as string]: '90ms', ['--edge-c' as string]: 'var(--leak)' }}>
            <div className="loop-art art-pin"><span className="chip leak"><Pulse size={12} /> Tracking</span><b className="num leak-c art-amt">₹<span className="art-mask" />/day</b><span className="art-drip" /></div>
            <h3 className="h-sm">Pinpoint</h3>
            <p className="muted small">Each leak gets a place in the chain, a price per day, the evidence and one action.</p>
          </article>
          <article className="card loop-card reveal edge" style={{ ['--d' as string]: '180ms' }}>
            <div className="loop-art art-stop"><span className="art-btn"><Pause size={14} /> Pause</span><span className="art-undo"><Undo size={13} /> Undo</span></div>
            <h3 className="h-sm">Stop</h3>
            <p className="muted small">Pause, cut or move budget with one tap and a confirm. Undo puts it back exactly.</p>
          </article>
          <article className="card loop-card reveal edge" style={{ ['--d' as string]: '270ms', ['--edge-c' as string]: 'var(--saved)' }}>
            <div className="loop-art art-verify"><span className="art-check"><Check size={18} /></span><b className="saved-c">Fixed</b></div>
            <h3 className="h-sm">Verify</h3>
            <p className="muted small">The next day we check again: “Fixed, saving this much” or “Still leaking, here’s why”.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

function LivePreview() {
  const snap = useSnap();
  const m = useMoney();
  const total = useCountUp(snap.leakingPerDay);
  const top = snap.leaks.filter((l) => !l.opportunity).slice(0, 4);
  return (
    <section className="live-sec band-1">
      <div className="wrap live-grid">
        <div className="reveal">
          <span className="eyebrow big">Live, right now</span>
          <h2 className="h-lg">This isn’t a screenshot.</h2>
          <p className="lede">A simulated shop is spending money below as you read. Leaks are found by the same code that watches real accounts. Open it and fix one.</p>
          <div className="live-cta">
            <Link to="/demo" className="btn btn-primary btn-lg"><span className="btn-glyph"><Drop size={14} /></span> Open the demo account</Link>
            <span className="mist small">No sign-up. Nothing to connect.</span>
          </div>
        </div>
        <div className="card glow live-card reveal" style={{ ['--d' as string]: '120ms' }}>
          <div className="live-head">
            <StatusPill checking={snap.checking} text={snap.checking ? 'Checking now…' : `Watching · ${snap.clock}`} />
            <span className="mist tiny">{snap.world.dataset.account.name}</span>
          </div>
          <div className="live-money">
            <span className="num leak-c">{m(total)}</span>
            <span className="muted">/day leaking</span>
          </div>
          <ul className="live-list">
            {top.map((l) => {
              const Icon = STEP_ICON[l.step];
              return (
                <li key={l.id}>
                  <span className="live-ico"><Icon size={14} /></span>
                  <span className="live-t small">{l.title}</span>
                  <span className="num small leak-c">{m(l.perDay)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

const COMPARE: { name: string; price: string; cells: (boolean | 'part')[] }[] = [
  { name: 'Account watchers', price: '$49–$489 / month', cells: [true, false, false, false, false] },
  { name: 'Tracking apps', price: 'Shopify only', cells: [false, false, false, 'part', false] },
  { name: 'Meta’s own rules', price: 'Free, you write them', cells: ['part', false, false, false, false] },
  { name: 'Leakwatch', price: '$19 / month', cells: [true, true, true, true, true] },
];

function Compare() {
  const cols = ['Spend', 'Click', 'Page', 'Tracking', 'Priced in money'];
  return (
    <section id="compare" className="compare band-0">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow big">Why Leakwatch</span>
          <h2 className="h-lg">Other tools stop at the click.</h2>
          <p className="lede">When tracking breaks, the account looks like “my ads stopped working”. Owners pause good ads and feed bad ones. We watch past the click and put a price on it.</p>
        </div>
        <div className="cmp card reveal">
          <div className="cmp-row cmp-head">
            <span />
            {cols.map((c) => <span key={c} className="tiny mist">{c}</span>)}
          </div>
          {COMPARE.map((r) => (
            <div key={r.name} className={`cmp-row${r.name === 'Leakwatch' ? ' us' : ''}`}>
              <span className="cmp-name">
                {r.name === 'Leakwatch' ? <LogoMark size={22} /> : null}
                <span><b>{r.name}</b><small className="mist">{r.price}</small></span>
              </span>
              {r.cells.map((c, i) => (
                <span key={i} className={`cmp-cell ${c === true ? 'y' : c === 'part' ? 'p' : 'n'}`} aria-label={c === true ? 'yes' : c === 'part' ? 'partly' : 'no'}>
                  {c === true ? <Check size={16} /> : c === 'part' ? '½' : <Close size={14} />}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PEOPLE = [
  { who: 'Shop owner', says: '“Tell me in rupees what’s broken, not in charts.”', color: 'var(--tag-coral)' },
  { who: 'Freelance media buyer', says: '“One morning list across my clients, guards on overnight.”', color: 'var(--tag-sky)' },
  { who: 'Coach with a launch', says: '“Is my sign-up page too slow for people on phones?”', color: 'var(--tag-violet)' },
  { who: 'First-time advertiser', says: '“Did my last deploy break the link in my ad?”', color: 'var(--tag-lime)' },
];

function People() {
  return (
    <section className="people band-1">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow big">Who it’s for</span>
          <h2 className="h-lg">Small budgets, where every leak hurts.</h2>
        </div>
        <div className="people-grid">
          {PEOPLE.map((p, i) => (
            <div key={p.who} className="card person reveal" style={{ ['--d' as string]: `${i * 80}ms`, ['--c' as string]: p.color }}>
              <span className="person-tag">{p.who}</span>
              <p className="person-q">{p.says}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CONNECT = [
  { name: 'Meta ads', what: 'Reads your ads, pauses on your tap', icon: Plug, soon: false },
  { name: 'Claude', what: 'Ask “what’s leaking?” from any chat', icon: Chat, soon: false },
  { name: 'Morning email', what: 'Three rows and one button at 8 am', icon: Mail, soon: false },
  { name: 'Shopify & Razorpay orders', what: 'Compare real sales with what Meta credits', icon: Spark, soon: true },
  { name: 'Google Ads', what: 'The same chain for search ads', icon: Globe, soon: true },
  { name: 'WhatsApp alerts', what: 'A message when a guard acts', icon: Shield, soon: true },
];

function Connect() {
  return (
    <section className="connect band-0">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow big">Connections</span>
          <h2 className="h-lg">Plugs into where you already are.</h2>
        </div>
        <div className="connect-grid">
          {CONNECT.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={c.name} className={`card connect-card reveal edge${c.soon ? ' soon' : ''}`} style={{ ['--d' as string]: `${i * 60}ms` }}>
                <span className="connect-ico"><Icon size={20} /></span>
                <div>
                  <b>{c.name}</b>
                  <p className="mist small">{c.what}</p>
                </div>
                <span className={`chip ${c.soon ? 'idle' : 'saved'}`}>{c.soon ? 'Soon' : 'Ready'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  ['Can Leakwatch change my ads without asking?', 'No. Every change needs your tap and a confirm, except guards you switch on yourself. Every change stores the state before it, so Undo puts it back exactly.'],
  ['Which permissions do you ask Meta for?', 'Two: read your ads, and change status or budgets when you tap. Your access key is encrypted. Revoke it in Settings or in Meta at any time.'],
  ['How do you check my landing pages?', 'A real phone browser opens each page once a day on slow 4G. It follows redirects, times the load and records what reaches your pixel. It never fills forms or buys anything.'],
  ['What if my site blocks bots or shows a cookie banner?', 'We mark the page “couldn’t check” or “couldn’t confirm” and never call it a leak. You can allow our checker by name if you want full checks.'],
  ['Does an AI make up the numbers?', 'No. Code finds and prices every leak. An open model only writes the plain-words explanation, and any number it writes is checked against your data or thrown away.'],
  ['Can I connect it to Claude?', 'Yes. Add Leakwatch as a connector and ask Claude about your leaks from any chat. Claude can suggest a pause; you confirm it in Leakwatch.'],
  ['What happens to my data if I leave?', '“Delete everything” in Settings removes your access key, daily rows, page checks and history. Your Meta account is not touched.'],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="faq band-1">
      <div className="wrap faq-grid">
        <div className="reveal">
          <span className="eyebrow big">Questions</span>
          <h2 className="h-lg">Straight answers.</h2>
        </div>
        <div className="faq-list">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`faq-item${open === i ? ' open' : ''}`}>
              <button className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <span>{q}</span>
                <ChevronDown size={18} />
              </button>
              <div className="faq-a"><p className="muted">{a}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingInner() {
  const root = useReveal<HTMLDivElement>();
  const heroRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className="landing">
      <Announcement />
      <SiteNav />
      <section className="hero" ref={heroRef}>
        <FloatingTags />
        <div className="wrap hero-in">
          <span className="eyebrow big hero-eyebrow">Ad money, watched</span>
          <h1 className="display hero-title">
            Find where your<br />ad money <span className="hero-leak">leaks<span className="hero-drop" aria-hidden /></span>.
          </h1>
          <p className="lede hero-sub">
            Leakwatch follows every ad from spend to sale, puts a price on each break, and fixes it with one tap. Then it checks the fix worked.
          </p>
          <div className="hero-cta">
            <Link to="/demo" className="btn btn-primary btn-lg"><span className="btn-glyph"><Drop size={14} /></span> See a live demo account</Link>
            <Link to="/signin?next=/connect" className="btn btn-ghost btn-lg">Connect Meta</Link>
          </div>
          <p className="mist small hero-note">Free for one account · Pro $19/month · no card to try</p>
        </div>
        <div className="wrap hero-card-wrap">
          <HeroChainCard />
        </div>
        <ul className="badges wrap">
          {BADGES.map((b) => (
            <li key={b} className="badge"><Laurel /><span>{b}</span><Laurel /></li>
          ))}
        </ul>
      </section>

      <ChainStory />
      <Loop />
      <LivePreview />
      <Compare />
      <People />
      <Connect />
      <section className="band-1 pricing-band" id="pricing">
        <Pricing embedded />
      </section>
      <Faq />

      <section className="final band-0">
        <div className="wrap final-in reveal">
          <LogoMark size={64} animated />
          <h2 className="display final-title">Stop the leak.</h2>
          <p className="lede">See the demo in one click. Connect your own account when you’re ready.</p>
          <div className="hero-cta">
            <Link to="/demo" className="btn btn-primary btn-lg">See a live demo account <ArrowRight size={16} /></Link>
            <Link to="/signin?next=/connect" className="btn btn-ghost btn-lg">Connect Meta</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

export function Landing() {
  return (
    <EngineProvider>
      <LandingInner />
    </EngineProvider>
  );
}
