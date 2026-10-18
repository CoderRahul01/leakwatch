import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Check, Close, Shield, Undo } from '../components/Icons';

export interface Toast {
  id: number;
  text: string;
  tone: 'neutral' | 'saved' | 'leak' | 'guard';
  undo?: () => void;
  ms: number;
}

interface Api {
  show: (t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => void;
}

const Ctx = createContext<Api>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export const UNDO_MS = 10_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) window.clearTimeout(tm);
    timers.current.delete(id);
  }, []);

  const show = useCallback<Api['show']>(
    (t) => {
      const id = ++seq.current;
      const ms = t.ms ?? (t.undo ? UNDO_MS : 4500);
      setToasts((ts) => [...ts.slice(-2), { ...t, id, ms }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast tone-${t.tone}`} style={{ ['--ms' as string]: `${t.ms}ms` }}>
            <span className="toast-ico">{t.tone === 'guard' ? <Shield size={16} /> : <Check size={16} />}</span>
            <span className="toast-text">{t.text}</span>
            {t.undo && (
              <button
                className="toast-undo"
                onClick={() => {
                  t.undo?.();
                  dismiss(t.id);
                }}
              >
                <Undo size={15} /> Undo
              </button>
            )}
            <button className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Close size={14} />
            </button>
            <span className="toast-bar" />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
