import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { createDemoWorld, detectLeaks, money, stripQuery, sum } from '@shared';
import { listAdAccounts, PREVIEW, startMetaConnect, type AdAccountChoice } from '../lib/api';
import { setSession, useSession } from '../lib/session';
import { Logo } from '../components/Logo';
import { ArrowRight, Check, Info, Lock, Plug, Refresh, Shield } from '../components/Icons';

type Phase = 'start' | 'opening' | 'pick' | 'check' | 'done';

export function Connect() {
  const session = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('start');
  const [accounts, setAccounts] = useState<AdAccountChoice[]>([]);
  const [chosen, setChosen] = useState<AdAccountChoice | null>(null);
  const [err, setErr] = useState<string | null>(params.get('error') === 'access_denied' ? 'You closed Meta before finishing. Nothing was connected.' : null);
  const [done, setDone] = useState(0);

  // What the first check will find, computed the same way the app does.
  const first = useMemo(() => {
    const w = createDemoWorld(new Date());
    const ds = w.dataset;
    const leaks = detectLeaks(ds);
    const pages = new Set(ds.ads.map((a) => stripQuery(a.landingUrl))).size;
    return {
      rows: ds.insights.length,
      pages,
      pixels: ds.probes.filter((p) => p.pixelIds.length > 0).length,
      leaks: leaks.filter((l) => !l.opportunity).length,
      perDay: sum(leaks.filter((l) => !l.opportunity).map((l) => l.perDay)),
      spend30: sum(ds.insights.map((r) => r.spend)),
      currency: ds.account.currency,
    };
  }, []);

  const steps = [
    `Syncing 30 days · ${first.rows.toLocaleString('en-IN')} daily rows`,
    `Opening ${first.pages} landing pages on a phone`,
    `Checking the pixel on ${first.pixels} pages`,
    `Pricing leaks · ${first.leaks} found, ${money(first.perDay, first.currency)}/day`,
  ];

  useEffect(() => {
    if (phase !== 'check') return;
    if (done >= steps.length) {
      const t = setTimeout(() => setPhase('done'), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 1100 + done * 350);
    return () => clearTimeout(t);
  }, [phase, done, steps.length]);

  if (!session.email) return <Navigate to="/signin?next=/connect" replace />;

  const begin = async () => {
    setErr(null);
    setPhase('opening');
    try {
      const r = await startMetaConnect();
      if (r.redirect) {
        window.location.href = r.redirect;
        return;
      }
      setAccounts(await listAdAccounts(first.spend30));
      setPhase('pick');
    } catch (e) {
      setErr((e as Error).message);
      setPhase('start');
    }
  };

  const pick = (a: AdAccountChoice) => {
    if (a.status === 'disabled') return;
    setChosen(a);
    setDone(0);
    setPhase('check');
  };

  const finish = () => {
    setSession({ accountName: chosen?.name ?? 'Kora Candles', connectedAt: new Date().toISOString(), tokenExpired: false });
    nav('/app', { replace: true });
  };

  return (
    <div className="connect-page">
      <header className="wrap connect-top">
        <Link to="/"><Logo /></Link>
        <span className="mist small">{session.email}</span>
      </header>
      <main className="connect-main">
        <ol className="cstep">
          {['Connect', 'Choose account', 'First check'].map((s, i) => {
            const at = phase === 'start' || phase === 'opening' ? 0 : phase === 'pick' ? 1 : 2;
            return <li key={s} className={i < at ? 'done' : i === at ? 'on' : ''}><span className="num">{i < at ? <Check size={12} /> : i + 1}</span>{s}</li>;
          })}
        </ol>

        <div className="card connect-card-main glow">
          {(phase === 'start' || phase === 'opening') && (
            <>
              <span className="auth-ico"><Plug size={22} /></span>
              <h1 className="h-md">Connect your Meta ad account</h1>
              <p className="muted">Leakwatch reads your ads every hour and opens their landing pages on a phone. It changes nothing unless you tap.</p>
              <ul className="perm">
                <li><Check size={15} /> <span><b>Read your ads</b> <span className="mist">to price each leak</span></span></li>
                <li><Check size={15} /> <span><b>Pause or change budgets</b> <span className="mist">only when you tap, with Undo</span></span></li>
                <li><Lock size={15} /> <span className="mist">Never: create ads, see your customers, or spend more</span></li>
              </ul>
              {err && <div className="state-box warn"><Info size={15} /> {err}</div>}
              <button className="btn btn-primary btn-lg btn-block" onClick={begin} disabled={phase === 'opening'}>
                {phase === 'opening' ? <><Refresh size={16} className="spin" /> Opening Meta…</> : <>Continue with Meta <ArrowRight size={16} /></>}
              </button>
              {PREVIEW && <p className="mist tiny" style={{ marginTop: 12 }}>Preview: the Meta app isn’t switched on yet, so you’ll pick the sample account. Everything after works the same.</p>}
            </>
          )}

          {phase === 'pick' && (
            <>
              <h1 className="h-md">Which ad account?</h1>
              <p className="muted small">You can add more later on Pro (up to 5).</p>
              <ul className="acct-list">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <button className="acct-choice" disabled={a.status === 'disabled'} onClick={() => pick(a)}>
                      <span className="acct-av">{a.name.slice(0, 1)}</span>
                      <span className="acct-choice-t">
                        <b>{a.name}</b>
                        <span className="mist tiny">
                          {a.status === 'disabled' ? 'Disabled in Meta, nothing to watch'
                            : a.role === 'analyst' ? 'You can only view this one: we can watch, but pausing needs an admin'
                            : `${a.currency} · ${money(a.spend30d, a.currency as 'INR')} spent in 30 days`}
                        </span>
                      </span>
                      {a.status !== 'disabled' && <ArrowRight size={16} />}
                    </button>
                  </li>
                ))}
              </ul>
              {accounts.length === 0 && <div className="state-box warn"><Info size={15} /> No ad accounts on this Meta login. Ask the account owner to add you as an admin, then try again.</div>}
            </>
          )}

          {(phase === 'check' || phase === 'done') && (
            <>
              <h1 className="h-md">{phase === 'done' ? 'First check done.' : 'First check running…'}</h1>
              <p className="muted small">{chosen?.name}{chosen?.role === 'analyst' ? ' · view only' : ''}</p>
              <ul className="checklist">
                {steps.map((s, i) => (
                  <li key={s} className={i < done ? 'done' : i === done && phase === 'check' ? 'on' : ''}>
                    <span className="cl-ico">{i < done ? <Check size={14} /> : i === done && phase === 'check' ? <Refresh size={14} className="spin" /> : null}</span>
                    {s}
                  </li>
                ))}
              </ul>
              {phase === 'done' && (
                <>
                  <div className="state-box leak"><Shield size={15} /> <span><b className="num">{money(first.perDay, first.currency)}/day</b> is leaking across {first.leaks} places. Let’s stop the biggest one.</span></div>
                  <button className="btn btn-primary btn-lg btn-block" onClick={finish}>See my leaks <ArrowRight size={16} /></button>
                </>
              )}
            </>
          )}
        </div>
        <p className="mist small" style={{ textAlign: 'center' }}>Prefer to look first? <Link to="/demo" className="link">Open the demo account</Link></p>
      </main>
    </div>
  );
}
