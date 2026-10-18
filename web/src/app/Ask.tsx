import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ask, ASK_SUGGESTIONS, type AskAnswer } from '@shared';
import { useSnap } from '../lib/engine';
import { ArrowRight, Chat, Info } from '../components/Icons';

interface Turn {
  q: string;
  a: AskAnswer | null;
}

export function Ask() {
  const snap = useSnap();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const run = (question: string) => {
    const text = question.trim();
    if (!text) return;
    if (text.length > 300) return setTurns((t) => [...t, { q: text.slice(0, 80) + '…', a: { found: false, text: 'That’s a long one. Ask one short question at a time.', sources: [] } }]);
    setTurns((t) => [...t, { q: text, a: null }]);
    setQ('');
    // A short pause so the answer reads like it was looked up, which it was.
    setTimeout(() => {
      const s = snapRef.current;
      const open = s.leaks.filter((l) => l.state === 'new' || l.state === 'still-leaking');
      const a = ask(text, s.world.dataset, open);
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    }, 450);
  };

  useEffect(() => {
    const pre = params.get('q');
    if (pre) {
      run(pre);
      setParams({}, { replace: true });
    }
    input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page ask">
      <header className="page-head">
        <span className="eyebrow">Ask</span>
        <h1 className="h-lg">Ask about your money.</h1>
        <p className="lede">Answers come only from your account’s rows and page checks. If it isn’t in your data, we say so.</p>
      </header>

      <div className="ask-thread">
        {turns.length === 0 && (
          <div className="ask-suggest">
            {ASK_SUGGESTIONS.concat(['How much did I spend this week?', "What's leaking?"]).map((s) => (
              <button key={s} className="fchip" onClick={() => run(s)}>{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="ask-turn">
            <p className="ask-q">{t.q}</p>
            <div className={`ask-a card${t.a && !t.a.found ? ' unknown' : ''}`}>
              {!t.a ? (
                <span className="typing"><i /><i /><i /></span>
              ) : (
                <>
                  <p>{!t.a.found && <Info size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />}{t.a.text}</p>
                  {t.a.sources.length > 0 && (
                    <div className="ask-src">
                      <span className="mist tiny">From your data</span>
                      <ul>
                        {t.a.sources.map((s) => <li key={s.label}><span className="small">{s.label}</span><span className="num small">{s.value}</span></li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="ask-bar" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <Chat size={18} className="mist" />
        <input ref={input} className="ask-input" placeholder="Why did Tuesday cost so much?" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Your question" maxLength={400} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!q.trim()} aria-label="Ask"><ArrowRight size={16} /></button>
      </form>
    </div>
  );
}
