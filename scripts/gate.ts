// The hosted test version's front door: invite codes, a signed session cookie, a daily allowance
// of model calls per tester, and a usage log that records what people do, never what's in it.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

// CUE_INVITES is "name:code,name:code". A code is the only thing a tester needs; the name is how
// they show up in the usage log. Taking a pair out ends that person's access at their next request.
export function parseInvites(spec: string): Map<string, string> {
  const byCode = new Map<string, string>();
  for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
    const i = part.indexOf(':');
    const name = part.slice(0, i), code = part.slice(i + 1);
    if (i < 1 || !NAME.test(name)) throw new Error(`Invite names are lowercase letters, digits, - or _ ("${part.slice(0, Math.max(i, 0)) || part.slice(0, 12)}")`);
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(code)) throw new Error(`The code for ${name} must be 10–64 letters, digits, - or _`);
    if ([...byCode.values()].includes(name)) throw new Error(`Two invites for ${name}`);
    if (byCode.has(code)) throw new Error(`${name} has the same code as ${byCode.get(code)}`);
    byCode.set(code, name);
  }
  return byCode;
}

export const newCode = () => randomBytes(12).toString('base64url');

// The session: who, when it was issued, and a signature over both, so it can't be edited.
export const SESSION_DAYS = 60;
const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function sessionToken(name: string, secret: string, now = Date.now()): string {
  const body = `${name}.${Math.floor(now / 1000)}`;
  return `${body}.${sign(body, secret)}`;
}

export function sessionName(token: string | null, secret: string, names: Set<string>, now = Date.now()): string | null {
  const m = /^([a-z0-9][a-z0-9_-]{0,31})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!m) return null;
  const want = Buffer.from(sign(`${m[1]}.${m[2]}`, secret)), got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const age = now / 1000 - Number(m[2]);
  if (age < -300 || age > SESSION_DAYS * 86400) return null;
  return names.has(m[1]) ? m[1] : null;
}

export function cookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// At most `max` tries per key in `windowMs`: for invite codes, so they can't be guessed.
export class Limiter {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs: number) { this.max = max; this.windowMs = windowMs; }
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some(t => now - t < this.windowMs)) this.hits.delete(k);
    return true;
  }
}

// What the page may report. Each is an action, never content: no titles, names or text.
export const CLIENT_EVENTS = new Set(['app_opened', 'today_opened', 'board_made', 'board_drafted', 'board_refreshed', 'board_opened', 'float_opened', 'memory_saved', 'calendar_connected']);

export type UsageEvent = { t: string; who: string; ev: string; kind?: string; n?: number; tokens?: number; ms?: number; ok?: boolean };

export function clientEvent(who: string, body: unknown, now = new Date()): UsageEvent | null {
  const b = body as { ev?: unknown; kind?: unknown; n?: unknown } | null;
  if (!b || typeof b.ev !== 'string' || !CLIENT_EVENTS.has(b.ev)) return null;
  return {
    t: now.toISOString(), who, ev: b.ev,
    ...(typeof b.kind === 'string' && /^[a-z_]{1,20}$/.test(b.kind) ? { kind: b.kind } : {}),
    ...(Number.isInteger(b.n) && (b.n as number) >= 0 && (b.n as number) <= 1000 ? { n: b.n as number } : {}),
  };
}

const day = (t: string | Date) => (typeof t === 'string' ? t : t.toISOString()).slice(0, 10);

export type TesterRow = {
  who: string; first: string; last: string; days: number;
  boards: number; drafted: number; opened: number; float: number; saved: number; calls: number; tokens: number; calendar: boolean;
  secondBoard: 'yes' | 'no' | 'not yet' | '—';
};

// The log, in memory and, with a data folder, in usage.jsonl there (one event per line), so it
// survives a restart. Every event also goes to stdout, where the host keeps its own logs.
export class Usage {
  events: UsageEvent[] = [];
  private perDay = new Map<string, number>();
  private file: string | null;
  private quiet: boolean;
  constructor(dir: string | null, opts: { quiet?: boolean } = {}) { this.file = dir ? join(dir, 'usage.jsonl') : null; this.quiet = !!opts.quiet; }

  async load() {
    if (!this.file) return;
    await mkdir(join(this.file, '..'), { recursive: true });
    const text = await readFile(this.file, 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      try { const e = JSON.parse(line) as UsageEvent; if (e && e.t && e.who && e.ev) this.add(e); } catch { /* a torn last line */ }
    }
  }

  private add(e: UsageEvent) {
    this.events.push(e);
    const k = `${day(e.t)}|${e.who}|${e.ev === 'model' ? 'model' : 'event'}`;
    this.perDay.set(k, (this.perDay.get(k) ?? 0) + 1);
  }

  record(e: UsageEvent) {
    this.add(e);
    if (!this.quiet) console.log('usage ' + JSON.stringify(e));
    if (this.file) appendFile(this.file, JSON.stringify(e) + '\n').catch(err => console.error(`usage log: ${err.message}`));
  }

  today(who: string, kind: 'model' | 'event', now = new Date()): number { return this.perDay.get(`${day(now)}|${who}|${kind}`) ?? 0; }
  todayAll(now = new Date()): number {
    let n = 0;
    const d = day(now);
    for (const [k, v] of this.perDay) if (k.startsWith(d + '|') && k.endsWith('|model')) n += v;
    return n;
  }

  // One row per tester, for /admin. "Second board" is the test's question: did they make
  // another board on their own within 14 days of their first?
  summary(now = new Date()): TesterRow[] {
    const rows = new Map<string, TesterRow & { daySet: Set<string>; madeAt: number[] }>();
    for (const e of this.events) {
      let r = rows.get(e.who);
      if (!r) rows.set(e.who, r = { who: e.who, first: e.t, last: e.t, days: 0, boards: 0, drafted: 0, opened: 0, float: 0, saved: 0, calls: 0, tokens: 0, calendar: false, secondBoard: '—', daySet: new Set(), madeAt: [] });
      if (e.t < r.first) r.first = e.t;
      if (e.t > r.last) r.last = e.t;
      r.daySet.add(day(e.t));
      if (e.ev === 'board_made') { r.boards++; r.madeAt.push(Date.parse(e.t)); }
      else if (e.ev === 'board_drafted') r.drafted++;
      else if (e.ev === 'calendar_connected') r.calendar = true;
      else if (e.ev === 'board_opened') r.opened++;
      else if (e.ev === 'float_opened') r.float++;
      else if (e.ev === 'memory_saved') r.saved++;
      else if (e.ev === 'model') { r.calls++; r.tokens += e.tokens ?? 0; }
    }
    const DAYS14 = 14 * 864e5;
    return [...rows.values()].map(({ daySet, madeAt, ...r }): TesterRow => {
      madeAt.sort((a, b) => a - b);
      const second = madeAt.length > 1 && madeAt[1] - madeAt[0] <= DAYS14;
      return {
        ...r, days: daySet.size,
        secondBoard: !madeAt.length ? '—' : second ? 'yes' : now.getTime() - madeAt[0] <= DAYS14 ? 'not yet' : 'no',
      };
    }).sort((a, b) => b.last.localeCompare(a.last));
  }
}
