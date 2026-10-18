import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Close, Shield } from '../components/Icons';
import { SiteFooter, SiteNav } from '../components/SiteChrome';
import { Sheet } from '../components/UI';
import { checkout, PREVIEW } from '../lib/api';
import { setSession, useSession } from '../lib/session';
import { useToast } from '../lib/toast';

const ROWS: [string, string | boolean, string | boolean][] = [
  ['Ad accounts', '1', '5'],
  ['Account check', 'Daily', 'Hourly'],
  ['Landing-page checks on a phone', '3 pages, weekly', 'Every live ad, daily'],
  ['Every leak, priced', true, true],
  ['One-tap pause, budget, Undo', true, true],
  ['Evidence and plain explanation', 'Summary', true],
  ['Guards overnight', false, true],
  ['Tomorrow’s forecast', false, true],
  ['Ask your data', false, true],
  ['Saved-money history', '7 days', 'Unlimited'],
  ['Morning email', 'Weekly', 'Daily'],
];

export function Pricing({ embedded = false }: { embedded?: boolean }) {
  const session = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const isPro = session.plan === 'pro';

  const goPro = async () => {
    if (!session.email) return nav('/signin?next=/pricing');
    setBusy(true);
    try {
      const r = await checkout();
      if (r.url) window.location.href = r.url;
      else setPreviewOpen(true);
    } catch (e) {
      toast.show({ text: (e as Error).message, tone: 'leak' });
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="wrap pricing">
      <div className="sec-head reveal in">
        <span className="eyebrow big">Pricing</span>
        <h2 className="h-lg">One caught pixel break pays for years.</h2>
        <p className="lede">Watchers start at $44–$49 and stop at the click. Leakwatch watches the whole chain for less than half.</p>
      </div>
      <div className="plans">
        <div className="card plan">
          <span className="plan-name">Free</span>
          <div className="plan-price"><span className="num">$0</span><span className="mist">forever</span></div>
          <p className="muted small">For one account. Every leak priced, fixes with Undo.</p>
          {session.email ? (
            <Link to={session.accountName ? '/app' : '/connect'} className="btn btn-ghost btn-block">{isPro ? 'Open app' : 'Your plan'}</Link>
          ) : (
            <Link to="/signin?next=/connect" className="btn btn-ghost btn-block">Start free</Link>
          )}
        </div>
        <div className="card plan pro glow edge live">
          <span className="plan-name">Pro <span className="chip signal">Most useful</span></span>
          <div className="plan-price"><span className="num">$19</span><span className="mist">/ month · ₹1,499</span></div>
          <p className="muted small">Hourly checks, guards overnight, forecast, Ask, 5 accounts.</p>
          <button className="btn btn-primary btn-block" onClick={goPro} disabled={busy || isPro}>
            {isPro ? 'You’re on Pro' : busy ? 'Opening checkout…' : 'Go Pro'}
          </button>
          <p className="mist tiny">Cancel any time. Monthly, no contract.</p>
        </div>
      </div>
      <div className="ptab card">
        <div className="ptab-row head"><span /><b>Free</b><b>Pro</b></div>
        {ROWS.map(([label, free, pro]) => (
          <div key={label} className="ptab-row">
            <span className="small">{label}</span>
            <Cell v={free} />
            <Cell v={pro} />
          </div>
        ))}
      </div>

      <Sheet open={previewOpen} onClose={() => setPreviewOpen(false)} label="Checkout preview">
        <div className="confirm">
          <span className="confirm-ico"><Shield size={22} /></span>
          <h2 className="h-sm">Payments aren’t switched on in this preview.</h2>
          <p className="muted small">{PREVIEW ? 'When the Leakwatch server is live, this opens secure checkout for $19 a month.' : 'Checkout did not return a link.'} You can turn Pro features on now to try them. No money is taken.</p>
          <div className="confirm-actions">
            <button className="btn btn-quiet" onClick={() => setPreviewOpen(false)}>Not now</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSession({ plan: 'pro' });
                setPreviewOpen(false);
                toast.show({ text: 'Pro is on for this preview.', tone: 'saved' });
                nav(session.accountName ? '/app' : '/connect');
              }}
            >
              Try Pro in preview
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );

  if (embedded) return body;
  return (
    <div className="landing">
      <SiteNav />
      <main className="page-pad">{body}</main>
      <SiteFooter />
    </div>
  );
}

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <span className="saved-c"><Check size={16} /></span>;
  if (v === false) return <span className="dim-c"><Close size={14} /></span>;
  return <span className="small muted">{v}</span>;
}
