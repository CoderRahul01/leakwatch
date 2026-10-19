// The imported account lives only in this browser: the dataset, the page checks, and what the
// person did about each leak. Storage can be unavailable, so everything falls back to memory.

import type { Dataset, ReportMemory } from '@shared';

const KEY = 'leakwatch.report.v1';

export interface StoredReport {
  dataset: Dataset;
  memory: ReportMemory;
  fileName: string;
  savedAt: string;
}

let memoryCopy: StoredReport | null = null;

export function loadReport(): StoredReport | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StoredReport;
  } catch {
    /* storage blocked or corrupt */
  }
  return memoryCopy;
}

export function saveReport(r: StoredReport) {
  memoryCopy = r;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* too big or blocked: keep it for this visit */
  }
}

export function clearReport() {
  memoryCopy = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
