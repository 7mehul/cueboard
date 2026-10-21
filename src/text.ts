import type { BlockKind } from './types.ts';

// Glanceable means short. These limits are what the writer (a model, later) must hit;
// the engine trims anything over them and logs a warning.
export interface Limit { words: number; chars: number }

export const LIMITS = {
  boardTitle: { words: 12, chars: 80 },
  meta: { words: 16, chars: 96 },
  title: { words: 6, chars: 40 },
  line: { words: 10, chars: 64 },
  note: { words: 14, chars: 90 },
  question: { words: 14, chars: 90 },
  value: { words: 2, chars: 14 },
  event: { words: 7, chars: 40 },
} satisfies Record<string, Limit>;

export function titleLimit(kind: BlockKind): Limit {
  return kind === 'header' ? LIMITS.boardTitle : LIMITS.title;
}

export function lineLimit(kind: BlockKind, index: number): Limit {
  if (kind === 'header') return LIMITS.meta;
  if (kind === 'number' && index === 0) return LIMITS.value;
  if (kind === 'note') return LIMITS.note;
  if (kind === 'questions') return LIMITS.question;
  return LIMITS.line;
}

// Separators like "·" don't count as words.
export const wordCount = (t: string) => t.trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

export function fits(text: string, lim: Limit) {
  return wordCount(text) <= lim.words && text.length <= lim.chars;
}

export function fitText(raw: string, lim: Limit): { text: string; trimmed: boolean } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (fits(text, lim)) return { text, trimmed: false };
  let out = '';
  for (const w of text.split(' ')) {
    const next = out ? out + ' ' + w : w;
    if (wordCount(next) > lim.words || next.length + 1 > lim.chars) break;
    out = next;
  }
  if (!out) out = text.slice(0, lim.chars - 1);
  return { text: out.replace(/[\s,;:.\-–—([]+$/, '') + '…', trimmed: true };
}

// For drafted lines (a suggested goal or ask): when one runs long, keep the longest whole clause
// that fits, so it still reads as a complete thought. Falls back to a word cut.
export function fitClause(raw: string, lim: Limit): { text: string; trimmed: boolean } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (fits(text, lim)) return { text, trimmed: false };
  const cuts = [...text.matchAll(/\s*(?:[;:,]|\s[—–-]\s|\s(?:and|but|so|while|then)\s)/g)].map(m => m.index!);
  for (const i of cuts.reverse()) {
    const head = text.slice(0, i).replace(/[\s,;:\-–—]+$/, '');
    if (wordCount(head) >= 3 && fits(head, lim)) return { text: head, trimmed: true };
  }
  return fitText(text, lim);
}

// Unknowns are shown in brackets, so trim the inside and keep the brackets.
export function gapText(inner: string, lim: Limit): string {
  const r = fitText(inner, { words: lim.words, chars: lim.chars - 2 });
  return '[' + r.text + ']';
}

export const normalize = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// ---------- numbers ----------

export function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return +(v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return +(v / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return +(v / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  return (+v.toFixed(a < 10 ? 2 : 1)).toLocaleString('en-US');
}

export function fmtValue(v: number, prefix = '', suffix = ''): string {
  return (v < 0 ? '−' : '') + prefix + fmtNum(Math.abs(v)) + suffix;
}

// Percent change, or null when the base is zero.
export function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) / Math.abs(from)) * 100);
}

export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

// "+18%", or "+0.4%" for small moves so they don't read as no change.
export function pctText(from: number, to: number): string | null {
  if (from === 0) return null;
  const raw = ((to - from) / Math.abs(from)) * 100;
  if (to === from) return '±0%';
  if (Math.abs(raw) < 1) return (raw > 0 ? '+' : '−') + Math.max(0.1, +Math.abs(raw).toFixed(1)) + '%';
  return signed(Math.round(raw)) + '%';
}

// ---------- dates ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ms = (iso: string) => Date.parse(iso);
export const isDate = (iso: string | undefined): iso is string => !!iso && Number.isFinite(Date.parse(iso));
export const daysBetween = (a: string, b: string) => (ms(b) - ms(a)) / 86_400_000;

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function monthLabel(iso: string, withYear: boolean): string {
  const d = new Date(iso);
  return withYear ? `${MONTHS[d.getUTCMonth()]} ’${String(d.getUTCFullYear()).slice(2)}` : MONTHS[d.getUTCMonth()];
}

export function longDate(iso: string): string {
  const d = new Date(iso);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
