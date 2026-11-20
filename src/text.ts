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
  // One long word: cut by characters, never through the middle of an emoji or accented letter.
  if (!out) for (const ch of text) { if ((out + ch).length > lim.chars - 1) break; out += ch; }
  return { text: out.replace(/[\s,;:.\-–—([]+$/, '') + '…', trimmed: true };
}

// For drafted lines (a goal, an ask): when one runs long, keep whole sentences if any fit, else
// the longest whole clause of the first sentence, so it still reads as a complete thought. A comma
// or colon is a break only with a space after it, so "$12,500" and "10:30" stay whole.
export function fitClause(raw: string, lim: Limit): { text: string; trimmed: boolean } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (fits(text, lim)) return { text, trimmed: false };
  const ends = [...text.matchAll(/[.!?](?=\s)/g)].map(m => m.index! + 1);
  for (const i of [...ends].reverse()) {
    const head = text.slice(0, i).replace(/(?<!\.)\.$/, '');
    if (wordCount(head) >= 3 && fits(head, lim)) return { text: head, trimmed: true };
  }
  const first = ends.length ? text.slice(0, ends[0]) : text;
  const cuts = [...first.matchAll(/\s*(?:[;:,](?=\s)|\s[—–-]\s|\s(?:and|but|so|while|then)\s)/g)].map(m => m.index!);
  for (const i of cuts.reverse()) {
    const head = first.slice(0, i).replace(/[\s,;:\-–—]+$/, '');
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
  if (a >= 1e4) {
    // Rounded first, then the unit picked, so 999,999 is 1M rather than 1000k.
    for (const [div, unit] of [[1e3, 'k'], [1e6, 'M']] as const) if (Math.abs(+(v / div).toFixed(1)) < 1000) return +(v / div).toFixed(1) + unit;
    return +(v / 1e9).toFixed(1) + 'B';
  }
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  if (a < 0.01) return String(+v.toPrecision(2)); // 0.004 stays 0.004, not 0
  return (+v.toFixed(a < 10 ? 2 : 1)).toLocaleString('en-US');
}

// A value as it goes on a number card. A unit that won't fit beside it ("per month") moves to
// the card's title instead of being cut.
export function valueText(v: number, prefix = '', suffix = ''): { value: string; unit?: string } {
  const full = fmtValue(v, prefix, suffix);
  return fits(full, LIMITS.value) || !suffix.trim() ? { value: full } : { value: fmtValue(v, prefix, ''), unit: suffix.trim() };
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

// Dates are shown in the user's time zone, so a 6pm meeting in San Francisco isn't "tomorrow".
// The zone is set around building one board (withZone); without one, UTC. A plain date
// ("2026-10-08") is that day wherever you are.
let zone: string | undefined;
const formatters = new Map<string, Intl.DateTimeFormat>();
export function withZone<T>(z: string | undefined, fn: () => T): T {
  const was = zone;
  try { zone = z && (formatters.has(z) || new Intl.DateTimeFormat('en-US', { timeZone: z })) ? z : undefined; } catch { zone = undefined; }
  try { return fn(); } finally { zone = was; }
}
export function dateParts(iso: string): { year: number; month: number; day: number; weekday: number } {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = plain ? new Date(Date.UTC(+plain[1], +plain[2] - 1, +plain[3])) : new Date(iso);
  if (plain || !zone) return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay() };
  let f = formatters.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }); formatters.set(zone, f); }
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { year: +p.year, month: +p.month - 1, day: +p.day, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

export function shortDate(iso: string): string {
  const d = dateParts(iso);
  return `${MONTHS[d.month]} ${d.day}`;
}

export function monthLabel(iso: string, withYear: boolean): string {
  const d = dateParts(iso);
  return withYear ? `${MONTHS[d.month]} ’${String(d.year).slice(2)}` : MONTHS[d.month];
}

export function longDate(iso: string): string {
  const d = dateParts(iso);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.weekday]} ${MONTHS[d.month]} ${d.day}`;
}
