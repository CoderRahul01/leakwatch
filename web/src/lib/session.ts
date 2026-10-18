// Per-browser session: who is signed in, their plan, and which account they connected.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded and the
// app keeps working from memory.

import { useSyncExternalStore } from 'react';

export type Plan = 'free' | 'pro';

export interface Session {
  email: string | null;
  plan: Plan;
  accountName: string | null;
  connectedAt: string | null;
  tokenExpired: boolean;
  morningEmail: boolean;
  claudeConnected: boolean;
  bannerDismissed: boolean;
}

const KEY = 'leakwatch.session.v1';
const blank: Session = {
  email: null,
  plan: 'free',
  accountName: null,
  connectedAt: null,
  tokenExpired: false,
  morningEmail: true,
  claudeConnected: false,
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
