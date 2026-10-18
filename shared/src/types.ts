// Core data model shared by the web app, the edge worker and the jobs.
// Every amount is in the account's currency, in whole units (no paise/cents).

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';

/** The five steps money passes through. A leak always lives at one of them. */
export type Step = 'spend' | 'click' | 'page' | 'tracking' | 'sale';
export const STEPS: Step[] = ['spend', 'click', 'page', 'tracking', 'sale'];

export type DetectorId =
  | 'S1' | 'S2' | 'S3' | 'S4'
  | 'P1' | 'P2' | 'P3'
  | 'T1' | 'T2' | 'T3' | 'T4'
  | 'L1';

export type Status = 'active' | 'paused';

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  /** What one sale is allowed to cost. Set by the user, used by S1, S2, guards, forecast. */
  targetCost: number;
  /** Average order value, used only to turn extra sales into money. */
  avgOrderValue: number;
  timezone: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: 'sales' | 'leads';
}

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  status: Status;
  dailyBudget: number;
  /** Pixel the ad set optimises on. */
  pixelId: string;
  /** Day index (0-based in the 30 day window) the ad set started delivering. */
  startDay: number;
}

export interface Ad {
  id: string;
  adSetId: string;
  name: string;
  status: Status;
  landingUrl: string;
}

/** One row per ad per day, the shape of Meta insights at level=ad with a daily breakdown. */
export interface InsightRow {
  date: string; // YYYY-MM-DD
  adId: string;
  adSetId: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number; // link clicks
  landingViews: number;
  results: number; // purchases (or leads)
  revenue: number;
}

export interface ProbeRequest {
  /** Milliseconds since navigation started. */
  at: number;
  kind: 'document' | 'redirect' | 'pixel' | 'script' | 'other';
  label: string;
  status?: number;
  ok: boolean;
}

export interface PixelEvent {
  name: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Lead';
  pixelId: string;
  eventId?: string;
}

export type ProbeState = 'ok' | 'issue' | 'blocked' | 'unconfirmed';

/** What the phone-browser probe saw when it opened one landing URL. */
export interface Probe {
  url: string;
  checkedAt: string; // ISO
  state: ProbeState;
  status: number | null;
  finalUrl: string | null;
  redirects: string[];
  loadMs: number | null;
  tagsKept: boolean | null;
  pixelIds: string[];
  events: PixelEvent[];
  consentBanner: boolean;
  requests: ProbeRequest[];
  /** First day the probe history showed this issue (YYYY-MM-DD), from stored probe history. */
  issueSince?: string;
  note?: string;
}

export type LeakState = 'new' | 'acting' | 'verifying' | 'fixed' | 'still-leaking' | 'dismissed';

export type ActionKind = 'pause' | 'cut-budget' | 'move-budget' | 'recheck' | 'mark-fixed';

export interface SuggestedAction {
  kind: ActionKind;
  label: string;
  adSetIds: string[];
  /** For move-budget: where the money goes. */
  toAdSetId?: string;
  /** For cut-budget / move-budget: amount per day. */
  amount?: number;
  /** Actions that change the ad account need a confirm sheet. */
  changesAccount: boolean;
}

export interface Series {
  label: string;
  dates: string[];
  values: number[];
  unit: 'money' | 'count' | 'ratio';
}

export interface Evidence {
  kind: 'series' | 'probe';
  /** Daily series for charts, oldest first. The first is drawn as bars, the second as a line. */
  series?: Series[];
  /** Index into the series dates where the change happened. */
  changeIndex?: number;
  probeUrl?: string;
  /** Plain facts with numbers computed in code. Shown as a list and used to check model text. */
  facts: { label: string; value: string }[];
}

export interface Leak {
  id: string;
  detector: DetectorId;
  step: Step;
  /** true for L1 style findings: money you could make, shown in green. */
  opportunity: boolean;
  title: string;
  /** One sentence, written by rules; the model may replace it but only if it passes the digit check. */
  summary: string;
  adSetIds: string[];
  adIds: string[];
  /** First day of the leak (YYYY-MM-DD). */
  since: string;
  /** Average spend at risk per day since the leak started (or the gain per day for opportunities). */
  perDay: number;
  /** Total spent on the affected ads since the leak started. */
  totalSince: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: Evidence;
  fixSteps: string[];
  action: SuggestedAction;
}

export interface ActionRecord {
  id: string;
  leakId: string | null;
  guardId: string | null;
  kind: ActionKind;
  label: string;
  at: string; // ISO
  adSetIds: string[];
  /** The state before the change, so Undo can restore it exactly. */
  previous: { adSetId: string; status: Status; dailyBudget: number }[];
  undone: boolean;
}

export interface Guard {
  id: string;
  enabled: boolean;
  sentence: string;
  /** 'pause-no-sale': spend >= multiple × target today with 0 results. 'pause-cpm-spike': CPM up >= pct. */
  rule: 'pause-no-sale' | 'pause-cost-high' | 'pause-broken-page';
  multiple: number;
}

export interface ForecastRow {
  adSetId: string;
  rows: number;
  /** null when fewer than 7 rows; we never show a number we can't back. */
  probability: number | null;
  verdict: 'likely' | 'maybe' | 'fine' | 'not-enough-data';
  reasons: string[];
}

export interface Dataset {
  account: Account;
  campaigns: Campaign[];
  adSets: AdSet[];
  ads: Ad[];
  insights: InsightRow[];
  probes: Probe[];
  /** The 30 dates in the window, oldest first. */
  dates: string[];
}
