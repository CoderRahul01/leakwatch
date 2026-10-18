// Talks to the leakwatch-edge worker. With no VITE_API_URL the app runs in preview mode:
// codes are generated in the browser and shown on screen, and the sample account stands in for Meta.
// Preview mode always says so on screen; nothing pretends to be real.

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const PREVIEW = !BASE;

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
    });
  } catch {
    throw new ApiError('offline', "We couldn't reach Leakwatch. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.code ?? `http_${res.status}`, data.message ?? 'Something went wrong. Try again.');
  return data as T;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ email code sign-in
const pending = new Map<string, { code: string; expires: number; tries: number }>();
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_TRIES = 5;

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export async function requestCode(email: string): Promise<{ previewCode?: string }> {
  const e = email.trim().toLowerCase();
  if (!validEmail(e)) throw new ApiError('bad_email', 'That email doesn’t look right.');
  if (!PREVIEW) return call('/auth/code', { email: e });
  await wait(600);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pending.set(e, { code, expires: Date.now() + CODE_TTL_MS, tries: 0 });
  return { previewCode: code };
}

export async function verifyCode(email: string, code: string): Promise<{ email: string }> {
  const e = email.trim().toLowerCase();
  if (!PREVIEW) return call('/auth/verify', { email: e, code });
  await wait(500);
  const p = pending.get(e);
  if (!p) throw new ApiError('no_code', 'Ask for a new code first.');
  if (Date.now() > p.expires) {
    pending.delete(e);
    throw new ApiError('expired', 'That code expired. We can send a new one.');
  }
  p.tries++;
  if (p.tries > MAX_TRIES) {
    pending.delete(e);
    throw new ApiError('too_many', 'Too many tries. Ask for a new code.');
  }
  if (p.code !== code) throw new ApiError('wrong_code', `That code isn’t right. ${MAX_TRIES - p.tries} ${MAX_TRIES - p.tries === 1 ? 'try' : 'tries'} left.`);
  pending.delete(e);
  return { email: e };
}

// ------------------------------------------------------------------ Meta
export interface AdAccountChoice {
  id: string;
  name: string;
  currency: string;
  spend30d: number;
  status: 'active' | 'disabled';
  role: 'admin' | 'advertiser' | 'analyst';
}

/** In server mode this returns Meta's OAuth URL; preview mode lists the sample account. */
export async function startMetaConnect(): Promise<{ redirect?: string }> {
  if (!PREVIEW) return call('/meta/oauth/start', {});
  await wait(700);
  return {};
}

export async function listAdAccounts(sampleSpend: number): Promise<AdAccountChoice[]> {
  if (!PREVIEW) return call('/accounts');
  await wait(500);
  return [
    { id: 'act_demo_kora', name: 'Kora Candles', currency: 'INR', spend30d: sampleSpend, status: 'active', role: 'admin' },
    { id: 'act_demo_old', name: 'Kora Candles (old, 2024)', currency: 'INR', spend30d: 0, status: 'disabled', role: 'admin' },
    { id: 'act_demo_client', name: 'Client account · read only', currency: 'INR', spend30d: 0, status: 'active', role: 'analyst' },
  ];
}

export async function checkout(): Promise<{ url?: string }> {
  if (!PREVIEW) return call('/billing/checkout', {});
  await wait(600);
  return {};
}

/** The Claude connector endpoint (MCP over HTTP) served by the edge worker. */
export const MCP_URL = BASE ? `${BASE}/mcp` : 'https://leakwatch-edge.workers.dev/mcp';
