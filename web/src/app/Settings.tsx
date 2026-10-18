import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMoney, useSnap } from '../lib/engine';
import { clearSession, setSession, useSession } from '../lib/session';
import { MCP_URL, PREVIEW } from '../lib/api';
import { useToast } from '../lib/toast';
import { CopyButton, Sheet, Switch } from '../components/UI';
import { LogoMark } from '../components/Logo';
import { Chat, Lock, Logout, Mail, Plug, Shield, Trash } from '../components/Icons';
import type { Mode } from './Shell';

export function Settings({ mode }: { mode: Mode }) {
  const snap = useSnap();
  const m = useMoney();
  const session = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const ds = snap.world.dataset;
  const open = snap.leaks.filter((l) => !l.opportunity && (l.state === 'new' || l.state === 'still-leaking'));
  const verified = snap.leaks.filter((l) => l.state === 'fixed').length;
  const subject = `${open.length} ${open.length === 1 ? 'leak' : 'leaks'} · ${m(snap.leakingPerDay)}/day at risk · ${verified} ${verified === 1 ? 'fix' : 'fixes'} verified`;
  const pro = mode === 'demo' || session.plan === 'pro';
  const claudeCode = `claude mcp add --transport http leakwatch ${MCP_URL}`;

  return (
    <div className="page settings">
      <header className="page-head">
        <span className="eyebrow">Settings</span>
        <h1 className="h-lg">Connections and control.</h1>
      </header>

      <section className="set-sec">
        <h2 className="h-sm">Connections</h2>
        <div className="conn-grid">
          <div className="card conn">
            <div className="conn-head">
              <span className="conn-logo meta"><Plug size={18} /></span>
              <div>
                <b>Meta ads</b>
                <p className="mist tiny">{ds.account.name} · {ds.adSets.length} ad sets · {ds.ads.length} ads</p>
              </div>
              <span className={`chip ${session.tokenExpired && mode === 'account' ? 'leak' : 'saved'}`}>
                <i className="dot" />{session.tokenExpired && mode === 'account' ? 'Expired' : mode === 'demo' ? 'Demo' : 'Connected'}
              </span>
            </div>
            <p className="small muted">We ask for two permissions: read your ads, and pause or change budgets when you tap. Your access key is encrypted and you can revoke it here or in Meta at any time.</p>
            <div className="conn-actions">
              {mode === 'demo' ? (
                <Link to="/signin?next=/connect" className="btn btn-primary btn-sm">Connect your own</Link>
              ) : (
                <>
                  <button className="btn btn-quiet btn-sm" onClick={() => nav('/connect')}>Switch account</button>
                  <button className="btn btn-quiet btn-sm" onClick={() => { setSession({ accountName: null, connectedAt: null }); nav('/connect'); }}>Disconnect</button>
                </>
              )}
            </div>
          </div>

          <div className="card conn edge live">
            <div className="conn-head">
              <span className="conn-logo claude"><Chat size={18} /></span>
              <div>
                <b>Claude</b>
                <p className="mist tiny">Ask Claude “what’s leaking?” from any chat</p>
              </div>
              <span className="chip signal">Connector</span>
            </div>
            <p className="small muted">Add Leakwatch as a connector and Claude can list your leaks, open one, and answer from your rows. Claude can suggest a pause, but nothing changes until you confirm it in Leakwatch.</p>
            <div className="field">
              <label>Connector URL</label>
              <div className="copy-row"><code className="num">{MCP_URL}</code><CopyButton text={MCP_URL} /></div>
            </div>
            <div className="field">
              <label>Claude Code</label>
              <div className="copy-row"><code className="num">{claudeCode}</code><CopyButton text={claudeCode} /></div>
            </div>
            <ul className="tools tiny">
              {['list_leaks', 'get_leak', 'ask', 'page_check', 'propose_pause'].map((t) => <li key={t} className="num">{t}</li>)}
            </ul>
            {PREVIEW && <p className="mist tiny">Preview: the connector answers once the Leakwatch server is live.</p>}
          </div>

          <div className="card conn">
            <div className="conn-head">
              <span className="conn-logo mail"><Mail size={18} /></span>
              <div>
                <b>Morning email</b>
                <p className="mist tiny">{pro ? 'Daily at 8:00' : 'Weekly on Free'}</p>
              </div>
              <Switch checked={session.morningEmail} onChange={(v) => setSession({ morningEmail: v })} label="Morning email" />
            </div>
            <p className="small muted">One email, three rows, one button. Subject today would be:</p>
            <p className="email-subject small">“{subject}”</p>
            <button className="btn btn-quiet btn-sm" onClick={() => setEmailOpen(true)}>Preview the email</button>
          </div>
        </div>
      </section>

      <section className="set-sec">
        <h2 className="h-sm">Plan</h2>
        <div className="card plan-row">
          <div>
            <b>{pro ? 'Pro' : 'Free'}</b>
            <p className="mist small">{pro ? 'Hourly checks, daily page checks for every live ad, guards, forecast, Ask, 5 accounts.' : 'Daily check, every leak priced, one-tap fixes with Undo.'}</p>
          </div>
          {mode === 'demo' ? <span className="chip signal">Demo has every Pro feature</span>
            : pro ? <button className="btn btn-quiet btn-sm" onClick={() => { setSession({ plan: 'free' }); toast.show({ text: 'Back on Free. Your leaks and history stay.', tone: 'neutral' }); }}>Switch to Free</button>
            : <Link to="/pricing" className="btn btn-primary btn-sm">Go Pro · $19/month</Link>}
        </div>
      </section>

      <section className="set-sec">
        <h2 className="h-sm">Your data</h2>
        <div className="card trust-list">
          <p className="small"><Lock size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> We keep daily ad numbers and page checks. No customer personal data. Page checks load public pages only and never fill forms or buy.</p>
          <p className="small"><Shield size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Explanations run on open models in our own account. Your numbers never train anyone’s model.</p>
        </div>
        {mode === 'account' && (
          <div className="card preview-tools">
            <div>
              <b className="small">Preview tools</b>
              <p className="mist tiny">See how Leakwatch behaves when Meta access expires.</p>
            </div>
            <Switch checked={session.tokenExpired} onChange={(v) => setSession({ tokenExpired: v })} label="Simulate expired Meta access" />
          </div>
        )}
        <div className="danger">
          {mode === 'account' ? (
            <>
              <button className="btn btn-quiet btn-sm" onClick={() => { clearSession(); nav('/'); }}><Logout size={15} /> Sign out</button>
              <button className="btn btn-sm danger-btn" onClick={() => setDelOpen(true)}><Trash size={15} /> Delete everything</button>
            </>
          ) : (
            <button className="btn btn-quiet btn-sm" onClick={() => window.location.reload()}>Reset the demo</button>
          )}
        </div>
      </section>

      <Sheet open={delOpen} onClose={() => setDelOpen(false)} label="Delete everything">
        <div className="confirm">
          <span className="confirm-ico bad"><Trash size={22} /></span>
          <h2 className="h-sm">Delete your Leakwatch data?</h2>
          <p className="muted small">This removes your Meta access key, every daily row, page checks, leaks and the action history. It can’t be undone. Your Meta ad account itself is not touched.</p>
          <div className="field">
            <label htmlFor="del">Type DELETE to confirm</label>
            <input id="del" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </div>
          <div className="confirm-actions">
            <button className="btn btn-quiet" onClick={() => setDelOpen(false)}>Cancel</button>
            <button className="btn btn-leak" disabled={confirm !== 'DELETE'} onClick={() => { clearSession(); nav('/', { replace: true }); }}>Delete everything</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={emailOpen} onClose={() => setEmailOpen(false)} label="Morning email preview" wide>
        <div className="email">
          <div className="email-meta tiny mist">
            <span>From: Leakwatch</span><span>To: {session.email ?? 'you@shop.in'}</span>
          </div>
          <p className="email-subj">{subject}</p>
          <div className="email-body">
            <LogoMark size={28} />
            <p className="small">Good morning. Here is what we watched overnight on {ds.account.name}.</p>
            <ul>
              {open.slice(0, 3).map((l) => (
                <li key={l.id}>
                  <span className="small">{l.title}</span>
                  <span className="num leak-c small">{m(l.perDay)}/day</span>
                </li>
              ))}
              {open.length === 0 && <li className="small">Nothing leaking. Enjoy your coffee.</li>}
            </ul>
            <span className="btn btn-primary btn-sm">Open Leakwatch</span>
            <p className="mist tiny">You get this because morning emails are on. Turn them off in Settings.</p>
          </div>
        </div>
      </Sheet>

      <p className="mist tiny" style={{ marginTop: 32 }}><Plug size={12} style={{ display: 'inline' }} /> Account time zone {ds.account.timezone} · currency {ds.account.currency}</p>
    </div>
  );
}
