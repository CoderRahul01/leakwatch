// A simulated live ad account for the demo. Fictional D2C candle brand, 8 campaigns, 24 ad sets,
// 70 ads, 30 days of daily insights, plus what the phone-browser probe saw on each landing page.
// Leaks are planted on purpose so every detector has something real to find (see LEAK_PLAN).

import type { Ad, AdSet, Campaign, Dataset, InsightRow, Probe, ProbeRequest } from './types';
import { addDays, isoDay, mulberry32 } from './util';

export const DEMO_DAYS = 30;
/** Index of "today" in the window. Today is partial and grows as the simulation ticks. */
export const TODAY = DEMO_DAYS - 1;

const PIXEL_MAIN = '8817402263519';
const PIXEL_OLD = '5520193384710';
const SITE = 'https://koracandles.in';

interface Spec {
  id: string;
  campaignId: string;
  name: string;
  budget: number;
  cpm: number;
  ctr: number;
  lpv: number; // landing views per click
  cpa: number; // true cost per result when healthy
  aov: number;
  url: string;
  freq: number;
  start?: number;
  ads?: number;
  /** Which planted leak this ad set carries. */
  leak?: 'S1' | 'S2' | 'S3' | 'S4' | 'P1' | 'P2' | 'P3' | 'T1' | 'T2' | 'T3' | 'T4' | 'L1' | 'GUARD' | 'LIVE_S4';
}

const CAMPAIGNS: Campaign[] = [
  { id: 'c1', name: 'Diwali Gifting · Prospecting', objective: 'sales' },
  { id: 'c2', name: 'Retargeting · Cart & viewers', objective: 'sales' },
  { id: 'c3', name: 'Bestsellers · Evergreen', objective: 'sales' },
  { id: 'c4', name: 'Festive Sale · Collections', objective: 'sales' },
  { id: 'c5', name: 'Scent Quiz · Leads', objective: 'leads' },
  { id: 'c6', name: 'Reels · Awareness to sale', objective: 'sales' },
  { id: 'c7', name: 'Gift Cards', objective: 'sales' },
  { id: 'c8', name: 'Winter Range · New', objective: 'sales' },
];

const SPECS: Spec[] = [
  { id: 'as01', campaignId: 'c1', name: 'Lookalike 2% · Gifting', budget: 560, cpm: 240, ctr: 0.011, lpv: 0.84, cpa: 900, aov: 1450, url: '/collections/diwali-gifts', freq: 1.7, leak: 'S1' },
  { id: 'as02', campaignId: 'c1', name: 'Interest · Home decor', budget: 520, cpm: 210, ctr: 0.016, lpv: 0.86, cpa: 360, aov: 1380, url: '/collections/diwali-gifts', freq: 1.5 },
  { id: 'as03', campaignId: 'c1', name: 'Broad · India 25–44', budget: 640, cpm: 190, ctr: 0.014, lpv: 0.85, cpa: 410, aov: 1320, url: '/collections/diwali-gifts', freq: 1.4 },
  { id: 'as04', campaignId: 'c2', name: 'Cart abandoners · 7 days', budget: 520, cpm: 320, ctr: 0.028, lpv: 0.88, cpa: 190, aov: 1520, url: '/products/sandalwood-soy', freq: 2.1, leak: 'T3' },
  { id: 'as05', campaignId: 'c2', name: 'Viewed product · 14 days', budget: 560, cpm: 290, ctr: 0.022, lpv: 0.87, cpa: 240, aov: 1490, url: '/products/sandalwood-soy', freq: 1.9, leak: 'T3' },
  { id: 'as06', campaignId: 'c2', name: 'Instagram engagers · 30 days', budget: 480, cpm: 260, ctr: 0.019, lpv: 0.86, cpa: 310, aov: 1410, url: '/products/sandalwood-soy', freq: 1.8, leak: 'T3' },
  { id: 'as07', campaignId: 'c3', name: 'Advantage+ audience', budget: 380, cpm: 200, ctr: 0.017, lpv: 0.88, cpa: 205, aov: 1360, url: '/collections/bestsellers', freq: 1.3, leak: 'L1' },
  { id: 'as08', campaignId: 'c3', name: 'Lookalike 5% · Buyers', budget: 900, cpm: 250, ctr: 0.012, lpv: 0.83, cpa: 1250, aov: 1340, url: '/collections/bestsellers', freq: 1.6, leak: 'S2' },
  { id: 'as09', campaignId: 'c3', name: 'Interest · Candles & aroma', budget: 500, cpm: 215, ctr: 0.015, lpv: 0.85, cpa: 395, aov: 1300, url: '/pages/candles-aroma', freq: 1.5 },
  { id: 'as10', campaignId: 'c4', name: 'Broad · Festive', budget: 700, cpm: 200, ctr: 0.014, lpv: 0.85, cpa: 420, aov: 1290, url: '/collections/diwali-sale', freq: 1.4, leak: 'P1' },
  { id: 'as11', campaignId: 'c4', name: 'Interest · Gifting', budget: 540, cpm: 220, ctr: 0.015, lpv: 0.86, cpa: 430, aov: 1310, url: '/collections/gifting', freq: 1.5 },
  { id: 'as12', campaignId: 'c4', name: 'Lookalike 1% · Visitors', budget: 600, cpm: 230, ctr: 0.016, lpv: 0.85, cpa: 470, aov: 1330, url: 'https://go.koracandles.in/fest', freq: 1.6, leak: 'P3' },
  { id: 'as13', campaignId: 'c5', name: 'Quiz · Broad', budget: 450, cpm: 180, ctr: 0.019, lpv: 0.82, cpa: 90, aov: 0, url: '/pages/scent-quiz', freq: 1.5, leak: 'T1' },
  { id: 'as14', campaignId: 'c5', name: 'Quiz · Wellness interest', budget: 420, cpm: 190, ctr: 0.018, lpv: 0.83, cpa: 95, aov: 0, url: '/pages/scent-quiz', freq: 1.5, leak: 'T1' },
  { id: 'as15', campaignId: 'c5', name: 'Quiz · Lookalike', budget: 400, cpm: 185, ctr: 0.018, lpv: 0.84, cpa: 100, aov: 0, url: '/pages/scent-quiz-b', freq: 1.4 },
  { id: 'as16', campaignId: 'c6', name: 'Reels · Broad 18–34', budget: 620, cpm: 170, ctr: 0.018, lpv: 0.8, cpa: 380, aov: 1250, url: '/collections/reels-picks', freq: 1.6, leak: 'S3' },
  { id: 'as17', campaignId: 'c6', name: 'Reels · Lookalike', budget: 560, cpm: 180, ctr: 0.016, lpv: 0.82, cpa: 400, aov: 1270, url: '/collections/reels-picks', freq: 1.5, leak: 'S4' },
  { id: 'as18', campaignId: 'c6', name: 'Reels · Interest home', budget: 500, cpm: 175, ctr: 0.016, lpv: 0.83, cpa: 390, aov: 1260, url: '/collections/reels-picks', freq: 1.5, leak: 'LIVE_S4' },
  { id: 'as19', campaignId: 'c7', name: 'Gift cards · Broad', budget: 480, cpm: 200, ctr: 0.013, lpv: 0.85, cpa: 430, aov: 1500, url: '/products/gift-card', freq: 1.4, leak: 'T2' },
  { id: 'as20', campaignId: 'c7', name: 'Gift cards · Lookalike', budget: 360, cpm: 210, ctr: 0.014, lpv: 0.86, cpa: 380, aov: 1500, url: '/products/gift-card-mini', freq: 1.4, ads: 2 },
  { id: 'as21', campaignId: 'c7', name: 'Gift bundle · Interest', budget: 520, cpm: 205, ctr: 0.015, lpv: 0.45, cpa: 520, aov: 2100, url: '/products/gift-card-bundle', freq: 1.5, leak: 'P2' },
  { id: 'as22', campaignId: 'c8', name: 'Winter · Broad', budget: 600, cpm: 195, ctr: 0.015, lpv: 0.86, cpa: 370, aov: 1420, url: '/pages/winter', freq: 1.4 },
  { id: 'as23', campaignId: 'c8', name: 'Winter · Lookalike 3%', budget: 560, cpm: 210, ctr: 0.015, lpv: 0.85, cpa: 400, aov: 1440, url: '/collections/winter', freq: 1.5, leak: 'T4' },
  { id: 'as24', campaignId: 'c8', name: 'Winter · Test creative', budget: 1500, cpm: 230, ctr: 0.014, lpv: 0.84, cpa: 480, aov: 1400, url: '/collections/winter-test', freq: 1.3, start: 25, ads: 2, leak: 'GUARD' },
];

/** Day each planted leak begins, as an index into the 30 day window. */
export const LEAK_PLAN = {
  S1: 21, // Lookalike 2% stops selling
  S3: 0, // frequency climbs all month
  S4: 28, // CPM jumps for the last two days
  P1: 26, // diwali-sale page starts returning 404
  T1: 19, // site redesign drops the pixel from the quiz page
  T2: 15, // gift card page swapped to the old pixel
  T3: 23, // purchase event stops reaching Meta on the product page
  T4: 20, // second pixel snippet added: events counted twice
} as const;

const CREATIVES = [
  'Warm glow video', 'Gift box carousel', 'Founder story', 'UGC unboxing', 'Diya still life',
  'Before / after room', 'Scent notes static', 'Bundle offer', 'Reviews montage', 'Slow pour reel',
];

/** What one ad does on one day before noise. The sim uses today's plan to keep ticking. */
export interface DayPlan {
  cpm: number;
  ctr: number;
  lpv: number;
  /** Results per landing view. */
  cvr: number;
  aov: number;
  freq: number;
  /** Multiplier on reported results (2 = counted twice, 0 = never reaches Meta). */
  reported: number;
  /** Share of the ad set's spend this ad takes. */
  share: number;
}

export interface DemoWorld {
  dataset: Dataset;
  /** Today's plan per ad id. */
  plans: Record<string, DayPlan>;
  specs: Record<string, { leak?: Spec['leak']; aov: number }>;
}

function planFor(spec: Spec, day: number, share: number): DayPlan {
  let { cpm, ctr, lpv, cpa, freq } = spec;
  let reported = 1;
  const cvrOf = (c: number) => cpm / (1000 * ctr * lpv * c);

  switch (spec.leak) {
    case 'S1':
      if (day >= LEAK_PLAN.S1) reported = 0;
      break;
    case 'S3': {
      const t = day / (DEMO_DAYS - 1);
      freq = 1.6 + t * 2.7;
      ctr = spec.ctr * (1 - 0.4 * t);
      break;
    }
    case 'S4':
      if (day >= LEAK_PLAN.S4) cpm = spec.cpm * 1.7;
      break;
    case 'P1':
      if (day >= LEAK_PLAN.P1) {
        lpv = 0.06;
        reported = 0;
      }
      break;
    case 'T1':
      if (day >= LEAK_PLAN.T1) reported = 0;
      break;
    case 'T2':
      if (day >= LEAK_PLAN.T2) reported = 0.12;
      break;
    case 'T3':
      if (day >= LEAK_PLAN.T3) reported = 0;
      break;
    case 'T4':
      if (day >= LEAK_PLAN.T4) reported = 2;
      break;
    case 'GUARD':
      if (day === TODAY) reported = 0;
      break;
  }
  // S3 keeps the conversion rate per landing view fixed, so falling CTR raises the cost per sale.
  const cvr = spec.leak === 'S3' ? spec.cpm / (1000 * spec.ctr * spec.lpv * cpa) : cvrOf(cpa);
  return { cpm, ctr, lpv, cvr, aov: spec.aov, freq, reported, share };
}

function siteUrl(path: string): string {
  return path.startsWith('http') ? path : SITE + path;
}

export function createDemoWorld(today: Date = new Date(), seed = 20261018): DemoWorld {
  const rnd = mulberry32(seed);
  const endDay = isoDay(today);
  const dates = Array.from({ length: DEMO_DAYS }, (_, i) => addDays(endDay, i - TODAY));

  const adSets: AdSet[] = [];
  const ads: Ad[] = [];
  const insights: InsightRow[] = [];
  const plans: Record<string, DayPlan> = {};
  const specs: DemoWorld['specs'] = {};
  let creative = 0;
  let adNo = 0;

  for (const spec of SPECS) {
    const start = spec.start ?? 0;
    specs[spec.id] = { leak: spec.leak, aov: spec.aov };
    adSets.push({
      id: spec.id,
      campaignId: spec.campaignId,
      name: spec.name,
      status: 'active',
      dailyBudget: spec.budget,
      pixelId: PIXEL_MAIN,
      startDay: start,
    });
    const n = spec.ads ?? 3;
    const shares = n === 3 ? [0.45, 0.33, 0.22] : [0.6, 0.4];
    for (let i = 0; i < n; i++) {
      adNo++;
      const ad: Ad = {
        id: `ad${String(adNo).padStart(2, '0')}`,
        adSetId: spec.id,
        name: CREATIVES[creative++ % CREATIVES.length],
        status: 'active',
        landingUrl: siteUrl(spec.url) + `?utm_source=meta&utm_campaign=${spec.campaignId}`,
      };
      ads.push(ad);
      for (let day = start; day < TODAY; day++) {
        const p = planFor(spec, day, shares[i]);
        insights.push(rowFrom(ad, dates[day], spec.budget * p.share * (0.88 + rnd() * 0.24), p, rnd));
      }
      plans[ad.id] = planFor(spec, TODAY, shares[i]);
    }
  }

  const dataset: Dataset = {
    account: {
      id: 'act_demo_kora',
      name: 'Kora Candles',
      currency: 'INR',
      targetCost: 520,
      avgOrderValue: 1380,
      timezone: 'Asia/Kolkata',
    },
    campaigns: CAMPAIGNS,
    adSets,
    ads,
    insights,
    probes: buildProbes(dates),
    dates,
  };
  return { dataset, plans, specs };
}

function rowFrom(ad: Ad, date: string, spend: number, p: DayPlan, rnd: () => number): InsightRow {
  const s = Math.round(spend);
  const impressions = Math.round((s / p.cpm) * 1000);
  const clicks = Math.round(impressions * p.ctr * (0.92 + rnd() * 0.16));
  const landingViews = Math.round(clicks * p.lpv);
  const real = Math.floor(landingViews * p.cvr + rnd());
  const results = Math.round(real * p.reported);
  return {
    date,
    adId: ad.id,
    adSetId: ad.adSetId,
    spend: s,
    impressions,
    reach: Math.max(1, Math.round(impressions / p.freq)),
    clicks,
    landingViews,
    results,
    revenue: Math.round(results * p.aov * (0.9 + rnd() * 0.2)),
  };
}

/** Builds today's row for an ad from accumulated totals. Results use floor so ticks never go backwards. */
export function rowFromTotals(
  ad: Ad,
  date: string,
  t: { spend: number; impressions: number; clicks: number; landingViews: number; results: number; revenue: number; freq: number },
): InsightRow {
  const impressions = Math.round(t.impressions);
  return {
    date,
    adId: ad.id,
    adSetId: ad.adSetId,
    spend: Math.round(t.spend),
    impressions,
    reach: Math.max(1, Math.round(impressions / t.freq)),
    clicks: Math.round(t.clicks),
    landingViews: Math.round(t.landingViews),
    results: Math.floor(t.results),
    revenue: Math.round(t.revenue),
  };
}

// ---------------------------------------------------------------------------------------------
// Probe results: what a mid-range phone on slow 4G saw when it opened each landing URL.

function req(at: number, kind: ProbeRequest['kind'], label: string, ok = true, status?: number): ProbeRequest {
  return { at, kind, label, ok, status };
}

function okProbe(url: string, checkedAt: string, loadMs: number, extra: Partial<Probe> = {}): Probe {
  return {
    url,
    checkedAt,
    state: 'ok',
    status: 200,
    finalUrl: url,
    redirects: [],
    loadMs,
    tagsKept: true,
    pixelIds: [PIXEL_MAIN],
    events: [
      { name: 'PageView', pixelId: PIXEL_MAIN, eventId: 'ev.pv' },
      { name: 'ViewContent', pixelId: PIXEL_MAIN, eventId: 'ev.vc' },
    ],
    consentBanner: false,
    requests: [
      req(0, 'document', 'Page', true, 200),
      req(Math.round(loadMs * 0.35), 'script', 'Pixel script loaded'),
      req(Math.round(loadMs * 0.55), 'pixel', 'PageView sent'),
      req(Math.round(loadMs * 0.8), 'pixel', 'ViewContent sent'),
      req(loadMs, 'other', 'Page ready'),
    ],
    ...extra,
  };
}

function buildProbes(dates: string[]): Probe[] {
  const at = `${dates[TODAY]}T05:40:00.000Z`;
  const u = siteUrl;
  return [
    okProbe(u('/collections/diwali-gifts'), at, 2400),
    okProbe(u('/products/sandalwood-soy'), at, 2100, {
      note: 'PageView and ViewContent reach Meta. The probe never buys, so it cannot see Purchase on the thank-you page.',
    }),
    okProbe(u('/collections/bestsellers'), at, 1900),
    {
      ...okProbe(u('/pages/candles-aroma'), at, 2600),
      state: 'unconfirmed',
      events: [],
      consentBanner: true,
      requests: [
        req(0, 'document', 'Page', true, 200),
        req(900, 'script', 'Pixel script loaded'),
        req(1100, 'other', 'Cookie banner shown'),
        req(15000, 'pixel', 'No event within 15 s', false),
      ],
      note: 'The pixel loaded but waits for cookie consent. We could not confirm events, so this is not counted as a leak.',
    },
    {
      ...okProbe(u('/collections/diwali-sale'), at, 900),
      state: 'issue',
      status: 404,
      events: [{ name: 'PageView', pixelId: PIXEL_MAIN, eventId: 'ev.pv' }],
      requests: [req(0, 'document', 'Page not found', false, 404), req(500, 'pixel', 'PageView sent'), req(900, 'other', '“Sorry, this page is gone” shown', false)],
      issueSince: dates[LEAK_PLAN.P1],
    },
    okProbe(u('/collections/gifting'), at, 2300),
    {
      ...okProbe('https://go.koracandles.in/fest', at, 3100),
      state: 'issue',
      finalUrl: u('/collections/festive'),
      redirects: ['https://go.koracandles.in/fest', u('/collections/festive')],
      tagsKept: false,
      requests: [
        req(0, 'redirect', 'Short link → 301', true, 301),
        req(420, 'document', 'Page (utm_* and fbclid gone)', true, 200),
        req(1500, 'script', 'Pixel script loaded'),
        req(2000, 'pixel', 'PageView sent'),
        req(3100, 'other', 'Page ready'),
      ],
      issueSince: dates[9],
    },
    {
      ...okProbe(u('/pages/scent-quiz'), at, 2800),
      state: 'issue',
      pixelIds: [],
      events: [],
      requests: [req(0, 'document', 'Page', true, 200), req(1700, 'other', 'Quiz app loaded'), req(2800, 'other', 'Page ready'), req(15000, 'pixel', 'No pixel on the page', false)],
      issueSince: dates[LEAK_PLAN.T1],
    },
    okProbe(u('/pages/scent-quiz-b'), at, 2500),
    okProbe(u('/collections/reels-picks'), at, 2200),
    {
      ...okProbe(u('/products/gift-card'), at, 2000),
      state: 'issue',
      pixelIds: [PIXEL_OLD],
      events: [
        { name: 'PageView', pixelId: PIXEL_OLD, eventId: 'ev.pv' },
        { name: 'ViewContent', pixelId: PIXEL_OLD, eventId: 'ev.vc' },
      ],
      requests: [
        req(0, 'document', 'Page', true, 200),
        req(800, 'script', 'Pixel script loaded'),
        req(1100, 'pixel', `PageView sent to …${PIXEL_OLD.slice(-4)}`),
        req(1600, 'pixel', `ViewContent sent to …${PIXEL_OLD.slice(-4)}`),
        req(2000, 'other', 'Page ready'),
      ],
      issueSince: dates[LEAK_PLAN.T2],
    },
    okProbe(u('/products/gift-card-mini'), at, 2100),
    {
      ...okProbe(u('/products/gift-card-bundle'), at, 7800),
      state: 'issue',
      requests: [
        req(0, 'document', 'Page', true, 200),
        req(2900, 'script', 'Hero video 6.2 MB'),
        req(4300, 'script', 'Pixel script loaded'),
        req(5200, 'pixel', 'PageView sent'),
        req(7800, 'other', 'Page ready (7.8 s)', false),
      ],
      issueSince: dates[3],
    },
    {
      url: u('/pages/winter'),
      checkedAt: at,
      state: 'blocked',
      status: 403,
      finalUrl: null,
      redirects: [],
      loadMs: null,
      tagsKept: null,
      pixelIds: [],
      events: [],
      consentBanner: false,
      requests: [req(0, 'document', 'Bot check page', false, 403)],
      note: 'The site’s bot protection stopped our phone browser. We will retry tonight; nothing is assumed broken.',
    },
    {
      ...okProbe(u('/collections/winter'), at, 2300),
      state: 'issue',
      events: [
        { name: 'PageView', pixelId: PIXEL_MAIN, eventId: 'ev.pv' },
        { name: 'PageView', pixelId: PIXEL_MAIN },
        { name: 'ViewContent', pixelId: PIXEL_MAIN, eventId: 'ev.vc' },
        { name: 'ViewContent', pixelId: PIXEL_MAIN },
      ],
      requests: [
        req(0, 'document', 'Page', true, 200),
        req(800, 'script', 'Pixel script loaded twice'),
        req(1000, 'pixel', 'PageView sent'),
        req(1050, 'pixel', 'PageView sent again (no event ID)', false),
        req(1700, 'pixel', 'ViewContent sent'),
        req(1760, 'pixel', 'ViewContent sent again (no event ID)', false),
        req(2300, 'other', 'Page ready'),
      ],
      issueSince: dates[LEAK_PLAN.T4],
    },
    okProbe(u('/collections/winter-test'), at, 2400),
  ];
}

export const DEMO_PIXELS = { main: PIXEL_MAIN, old: PIXEL_OLD };
