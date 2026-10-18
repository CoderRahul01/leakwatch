import { shortDate, type LiveLeak } from '@shared';
import { STEP_LABEL } from './Chain';
import { ArrowRight, Check, Refresh, STEP_ICON, Undo } from './Icons';
import { TICK_MS } from '../lib/engine';

export function severity(l: LiveLeak): 'high' | 'med' | 'low' {
  if (l.opportunity) return 'low';
  return l.perDay >= 700 ? 'high' : l.perDay >= 300 ? 'med' : 'low';
}

export function LeakCard({
  leak,
  m,
  onOpen,
  onAct,
  onUndo,
  fresh,
}: {
  leak: LiveLeak;
  m: (n: number) => string;
  onOpen: () => void;
  onAct: () => void;
  onUndo?: () => void;
  fresh?: boolean;
}) {
  const Icon = STEP_ICON[leak.step];
  const sev = severity(leak);
  const secs = leak.verifyIn !== null ? Math.ceil((leak.verifyIn * TICK_MS) / 1000) : null;

  if (leak.state === 'fixed') {
    return (
      <article className="lcard fixed" data-leak={leak.id}>
        <span className="lcard-fixed-ico"><Check size={16} /></span>
        <div className="lcard-fixed-text">
          <b>Fixed</b> <span className="muted">· {leak.title}</span>
        </div>
        <span className="num saved-c lcard-fixed-amt" data-amount>
          {leak.opportunity ? '+' : ''}{m(leak.savedPerDay)}<small>/day</small>
        </span>
        {onUndo && (
          <button className="btn btn-sm btn-quiet" onClick={onUndo}>
            <Undo size={14} /> Undo
          </button>
        )}
      </article>
    );
  }

  return (
    <article
      className={`lcard edge s-${leak.state} sev-${sev}${leak.opportunity ? ' opp' : ''}${fresh ? ' fresh' : ''}`}
      style={leak.opportunity ? ({ ['--edge-c' as string]: 'var(--saved)' }) : leak.state === 'new' ? ({ ['--edge-c' as string]: 'var(--leak)' }) : undefined}
      data-leak={leak.id}
    >
      <button className="lcard-hit" onClick={onOpen} aria-label={`Open: ${leak.title}`} />
      <div className="lcard-top">
        <span className={`chip ${leak.opportunity ? 'saved' : 'leak'}`}>
          <Icon size={13} /> {STEP_LABEL[leak.step]}
        </span>
        {!leak.opportunity && <span className={`sev sev-${sev}`} title={`${sev} severity`}><i /><i /><i /></span>}
        <span className="lcard-since mist tiny">since {shortDate(leak.since)}</span>
      </div>
      <h3 className="lcard-title">{leak.title}</h3>
      <div className="lcard-money">
        <span className={`num ${leak.opportunity ? 'saved-c' : 'leak-c'}`} data-amount>
          {leak.opportunity ? '+' : ''}
          {m(leak.perDay)}
        </span>
        <span className="mist small">{leak.opportunity ? 'a day you could gain' : 'a day at risk'}</span>
        <span className="mist small lcard-total">· {m(leak.totalSince)} so far</span>
      </div>

      {leak.state === 'still-leaking' && leak.note && <p className="lcard-note">{leak.note}</p>}

      <div className="lcard-actions">
        {(leak.state === 'new' || leak.state === 'still-leaking') && (
          <>
            <button className={`btn btn-sm ${leak.opportunity ? 'btn-saved' : 'btn-primary'}`} onClick={onAct}>
              {leak.state === 'still-leaking' ? 'Try again' : leak.action.label}
            </button>
            <button className="btn btn-sm btn-quiet" onClick={onOpen}>
              Why? <ArrowRight size={14} />
            </button>
          </>
        )}
        {leak.state === 'acting' && (
          <span className="lcard-progress">
            <Refresh size={15} className="spin" /> Rechecking on a phone…
          </span>
        )}
        {leak.state === 'verifying' && (
          <span className="lcard-progress">
            <span className="verify-ring" style={{ ['--k' as string]: secs ?? 0 }} />
            Waiting to verify{secs !== null ? ` · ${secs} s` : ''}
            <span className="mist tiny">(24 h in a real account)</span>
            {onUndo && (
              <button className="btn btn-sm btn-quiet" onClick={onUndo}>
                <Undo size={14} /> Undo
              </button>
            )}
          </span>
        )}
      </div>
    </article>
  );
}
