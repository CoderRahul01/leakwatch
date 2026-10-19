import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DemoEngine, money, ReportEngine, type Snapshot } from '@shared';

export const TICK_MS = 2500;

/** The demo account (simulated, ticking) or a real imported account. Every screen works with both. */
export type Engine = DemoEngine | ReportEngine;

const Ctx = createContext<Engine | null>(null);

/** One engine per mounted app. The demo pauses while the tab is hidden so nothing runs in the background. */
export function EngineProvider({ children, make }: { children: ReactNode; make: () => Engine }) {
  const [engine] = useState(make);
  useEffect(() => {
    if (engine instanceof ReportEngine) return;
    let id = 0;
    const start = () => {
      stop();
      id = window.setInterval(() => engine.tick(), TICK_MS);
    };
    const stop = () => window.clearInterval(id);
    const vis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [engine]);
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
}

export function useEngine(): Engine {
  const e = useContext(Ctx);
  if (!e) throw new Error('useEngine outside EngineProvider');
  return e;
}

export const isReport = (e: Engine): e is ReportEngine => e instanceof ReportEngine;

export function useSnap(): Snapshot {
  const e = useEngine();
  return useSyncExternalStore(e.subscribe, e.getSnapshot);
}

export function useMoney() {
  const s = useSnap();
  const cur = s.world.dataset.account.currency;
  return useMemo(() => (n: number) => money(n, cur), [cur]);
}
