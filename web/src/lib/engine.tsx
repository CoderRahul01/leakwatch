import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DemoEngine, money, type Snapshot } from '@shared';

export const TICK_MS = 2500;

const Ctx = createContext<DemoEngine | null>(null);

/** One live engine per mounted app. It pauses while the tab is hidden so nothing runs in the background. */
export function EngineProvider({ children, running = true }: { children: ReactNode; running?: boolean }) {
  const [engine] = useState(() => new DemoEngine(new Date()));
  useEffect(() => {
    if (!running) return;
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
  }, [engine, running]);
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
}

export function useEngine(): DemoEngine {
  const e = useContext(Ctx);
  if (!e) throw new Error('useEngine outside EngineProvider');
  return e;
}

export function useSnap(): Snapshot {
  const e = useEngine();
  return useSyncExternalStore(e.subscribe, e.getSnapshot);
}

export function useMoney() {
  const s = useSnap();
  const cur = s.world.dataset.account.currency;
  return useMemo(() => (n: number) => money(n, cur), [cur]);
}
