import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, requestCode, validEmail, verifyCode } from '../lib/api';
import { useSession } from '../lib/session';
import { CodeInput } from '../components/UI';
import { Logo } from '../components/Logo';
import { ArrowRight, ChevronLeft, Mail, Refresh } from '../components/Icons';

const RESEND_S = 30;

export function SignIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const nav = useNavigate();
  const session = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(session.email ?? '');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async () => {
    setErr(null);
    if (!validEmail(email)) return setErr('That email doesn’t look right.');
    setBusy(true);
    try {
      await requestCode(email);
      setStep('code');
      setCode('');
      setResendIn(RESEND_S);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (c: string) => {
    if (c.length !== 6 || busy) return;
    setErr(null);
    setBusy(true);
    try {
      await verifyCode(email, c);
      nav(next, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (code.length === 6) verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="auth">
      <div className="auth-side">
        <Link to="/"><Logo /></Link>
        <div className="auth-quote">
          <h2 className="h-lg">Every rupee from ad to sale, watched.</h2>
          <p className="lede">Sign in with a code to keep Pro on every device. No password to forget.</p>
        </div>
        <div className="auth-tags" aria-hidden>
          <span className="ftag-in" style={{ ['--c' as string]: 'var(--tag-coral)', transform: 'rotate(-7deg)' }}>Pixel went quiet</span>
          <span className="ftag-in" style={{ ['--c' as string]: 'var(--tag-lime)', transform: 'rotate(5deg)' }}>Fixed, saving daily</span>
          <span className="ftag-in" style={{ ['--c' as string]: 'var(--tag-violet)', transform: 'rotate(-3deg)' }}>404 on phones</span>
        </div>
      </div>

      <main className="auth-main">
        <div className="auth-card card">
          {step === 'email' ? (
            <form onSubmit={(e) => { e.preventDefault(); send(); }}>
              <span className="auth-ico"><Mail size={22} /></span>
              <h1 className="h-md">Sign in</h1>
              <p className="muted small">We email you a 6-digit code.</p>
              <div className="field" style={{ marginTop: 24 }}>
                <label htmlFor="email">Work email</label>
                <input id="email" className={`input${err ? ' bad' : ''}`} type="email" autoComplete="email" placeholder="you@shop.in" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                {err && <p className="err" role="alert">{err}</p>}
              </div>
              <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 16 }} disabled={busy}>
                {busy ? <><Refresh size={16} className="spin" /> Sending…</> : <>Email me a code <ArrowRight size={16} /></>}
              </button>
              <p className="mist tiny auth-fine">By continuing you agree that we store your email to sign you in. Nothing else.</p>
            </form>
          ) : (
            <div>
              <button className="back" onClick={() => { setStep('email'); setErr(null); }}><ChevronLeft size={16} /> Change email</button>
              <h1 className="h-md">Check your email</h1>
              <p className="muted small">We sent a 6-digit code to <b>{email.trim().toLowerCase()}</b>. It works for 10 minutes.</p>
              <div style={{ marginTop: 24 }}>
                <CodeInput value={code} onChange={setCode} disabled={busy} bad={!!err} />
                {err && <p className="err" role="alert" style={{ marginTop: 10 }}>{err}</p>}
              </div>
              <div className="auth-row">
                {busy ? <span className="mist small"><Refresh size={14} className="spin" style={{ display: 'inline' }} /> Checking…</span> : <span className="mist small">Paste works too.</span>}
                <button className="link small" disabled={resendIn > 0 || busy} onClick={send}>
                  {resendIn > 0 ? `Resend in ${resendIn} s` : 'Send a new code'}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mist small auth-demo">No account needed to <Link to="/check" className="link">check a page</Link>, <Link to="/import" className="link">import your ads</Link> or <Link to="/demo" className="link">try the demo</Link>.</p>
      </main>
    </div>
  );
}

/** Only allow redirects back into this app. */
function safeNext(n: string | null): string {
  if (!n || !n.startsWith('/') || n.startsWith('//')) return '/app';
  return n;
}
