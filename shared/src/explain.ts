// The model writes words; code owns numbers. Any digit sequence in model text must already be in
// the evidence, or we fall back to the rules sentence.

import type { Leak } from './types';

function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, '').replace(/\.0+$/, ''));
}

export function allowedNumbers(leak: Leak): Set<string> {
  const pool = [
    leak.title,
    leak.summary,
    ...leak.evidence.facts.map((f) => f.value),
    ...leak.fixSteps,
    String(leak.perDay),
    String(leak.totalSince),
    leak.since,
  ].join(' ');
  return new Set(numbersIn(pool));
}

/** true when every number in `text` appears in the leak's evidence. */
export function passesDigitCheck(text: string, leak: Leak): boolean {
  const allowed = allowedNumbers(leak);
  return numbersIn(text).every((n) => allowed.has(n));
}

/** The explanation shown on screen. */
export function explanationFor(leak: Leak, modelText?: string | null): { text: string; source: 'model' | 'rules' } {
  const t = modelText?.trim();
  if (t && t.length > 20 && passesDigitCheck(t, leak)) return { text: t, source: 'model' };
  return { text: leak.summary, source: 'rules' };
}
