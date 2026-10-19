// Per-browser session: who is signed in, their plan, and which account they connected.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded and the
// app keeps working from memory.

import { useSyncExternalStore } from 'react';

export type Plan = 'free' | 'pro';

export interface Session {
  email: string | null;
  /** Long-lived session token from the API (sent as a Bearer token). */
  token: string | null;
  plan: Plan;
  proUntil: string | null;
  /** Name of the imported ad account (the report itself lives in report-store). */
  reportName: string | null;
  bannerDismissed: boolean;
}

const KEY = 'leakwatch.session.v2';
const blank: Session = {
  email: null,
  token: null,
  plan: 'free',
  proUntil: null,
  reportName: null,
  bannerDismissed: false,
};

function load(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...blank, ...JSON.parse(raw) } : { ...blank };
  } catch {
    return { ...blank };
  }
}

let state = load();
const subs = new Set<() => void>();

export function setSession(patch: Partial<Session>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* memory only */
  }
  subs.forEach((s) => s());
}

export function clearSession(keep: Partial<Session> = {}) {
  state = { ...blank, ...keep };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  subs.forEach((s) => s());
}

export function useSession(): Session {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => state,
  );
}

export const getSession = () => state;
