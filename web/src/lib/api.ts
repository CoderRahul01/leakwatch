// Talks to the leakwatch-edge worker. In production the site rewrites /api/* to the worker, so calls
// are same-origin; VITE_API_URL points somewhere else for local development.
// Every request carries this browser's random visitor key (only its hash is stored on the server)
// and, once signed in, the session token.

import type { Leak, Probe } from '@shared';
import { getSession, setSession, clearSession } from './session';

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const VKEY = 'leakwatch.visitor';
let memoryKey: string | null = null;
export function visitorKey(): string {
  try {
    const k = localStorage.getItem(VKEY);
    if (k && /^[a-f0-9]{64}$/.test(k)) return k;
  } catch {
    /* storage blocked */
  }
  if (!memoryKey) {
    memoryKey = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
    try {
      localStorage.setItem(VKEY, memoryKey);
    } catch {
      /* memory only */
    }
  }
  return memoryKey;
}

async function call<T>(path: string, body?: unknown, { timeoutMs = 20_000 } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Leakwatch-Key': visitorKey() };
  const token = getSession().token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new ApiError('timeout', 'That took too long. Try again.');
    throw new ApiError('offline', "We couldn't reach Leakwatch. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.code === 'signed_out' && token) clearSession();
  if (!res.ok) throw new ApiError(data.code ?? `http_${res.status}`, data.message ?? 'Something went wrong. Try again.');
  return data as T;
}

// ------------------------------------------------------------------ account
export interface Me {
  account: { email: string; plan: 'free' | 'pro'; proUntil: string | null } | null;
  token: string | null;
  checksLeft: number;
  limits: { checks: number; explains: number; watches: number };
  mail: boolean;
  billing: boolean;
}

/** Refreshes plan and sign-in from the server. A browser that just paid gets its session here. */
export async function refreshMe(): Promise<Me> {
  const me = await call<Me>('/me');
  if (me.token) setSession({ token: me.token });
  if (me.account) setSession({ email: me.account.email, plan: me.account.plan, proUntil: me.account.proUntil });
  else if (getSession().email) setSession({ email: null, plan: 'free', proUntil: null, token: null });
  return me;
}

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_TRIES = 5;

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export async function requestCode(email: string): Promise<{ ok: boolean }> {
  const e = email.trim().toLowerCase();
  if (!validEmail(e)) throw new ApiError('bad_email', 'That email doesn’t look right.');
  return call('/auth/code', { email: e });
}

export async function verifyCode(email: string, code: string): Promise<{ email: string }> {
  const r = await call<{ token: string; account: NonNullable<Me['account']> }>('/auth/verify', { email: email.trim().toLowerCase(), code });
  setSession({ token: r.token, email: r.account.email, plan: r.account.plan, proUntil: r.account.proUntil });
  return { email: r.account.email };
}

export async function signOut() {
  await call('/auth/signout', {}).catch(() => {});
  clearSession({ reportName: getSession().reportName });
}

export async function deleteAccount() {
  if (getSession().token) await call('/account/delete', {});
  clearSession();
}

export async function checkout(): Promise<{ url: string }> {
  return call('/billing/checkout', {});
}

export async function joinWaitlist(email: string) {
  return call('/waitlist', { email });
}

// ------------------------------------------------------------------ page checks
export interface Finding {
  id: string;
  tone: 'leak' | 'warn' | 'saved' | 'idle';
  title: string;
  detail: string;
}
export interface CheckResult {
  probe: Probe;
  findings: Finding[];
  screenshot: string | null;
  checksLeft: number;
}

export async function checkPage(url: string, opts: { pixelId?: string; source?: 'manual' | 'report' } = {}): Promise<CheckResult> {
  return call('/check', { url, pixelId: opts.pixelId || undefined, source: opts.source ?? 'manual' }, { timeoutMs: 75_000 });
}

export interface Watch {
  url: string;
  pixelId: string | null;
  lastState: string | null;
  lastChecked: string | null;
}
export const listWatches = () => call<{ watches: Watch[] }>('/watch');
export const addWatch = (url: string, pixelId?: string, state?: string) => call('/watch', { url, pixelId, state });
export const removeWatch = (url: string) => call('/watch/remove', { url });

// ------------------------------------------------------------------ explanations
const explained = new Map<string, Promise<string | null>>();
/** Plain explanation for a leak (null → show the rules sentence). Cached per leak and numbers. */
export function explainLeak(leak: Leak): Promise<string | null> {
  const key = `${leak.id}|${leak.perDay}|${leak.summary}`;
  if (!explained.has(key)) {
    const p = call<{ text: string | null }>('/explain', {
      leak: { title: leak.title, summary: leak.summary, since: leak.since, facts: leak.evidence.facts, fixSteps: leak.fixSteps },
    }, { timeoutMs: 30_000 }).then((r) => r.text).catch(() => null);
    explained.set(key, p);
  }
  return explained.get(key)!;
}

// ------------------------------------------------------------------ events (Pulse)
export function track(name: string, props: Record<string, string | number | boolean> = {}) {
  call('/events', { name, props }).catch(() => {});
}
