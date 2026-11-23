import type { MeetingNotes, NoteListItem, NotesPerson, SaidLine } from '../src/memory/notes.ts';

// What a notes connector is, and what Cueboard gives it. A connector is one file in this folder:
// it says which app it reads, which settings it needs, which hosts it talks to, and how to list
// and fetch notes from that app's API. Everything else is shared: the routes the page calls, the
// import sheet, retries and timeouts, the checks on what comes back, and plain error messages.
// CONNECTORS.md walks through writing one.

export type { MeetingNotes, NoteListItem, NotesPerson, SaidLine };

export interface NotesConnector {
  // Lowercase letters, digits and dashes. Part of every document's id in people's memory, so it
  // never changes once released.
  id: string;
  // The app as people know it: "Granola".
  name: string;
  // The settings it needs, by name (`GRANOLA_API_KEY`). It's offered once all are set.
  env: string[];
  // The only hosts it may call, over https. Its key goes nowhere else.
  hosts: string[];
  // How to get the key, step by step, for the page to show when it isn't set up yet. Cueboard
  // adds where to put it and the restart.
  setup: string[];
  // What a note id looks like. The page's ids are checked against it before the connector sees
  // them, so a crafted one never reaches a URL.
  noteId: RegExp;
  // Notes from meetings on or after `after` (YYYY-MM-DD), newest first if the API allows, a page at
  // a time. Return the API's cursor for the next page, or null when there are no more.
  list(ctx: Ctx, opts: { after: string; cursor?: string }): Promise<NotesPage>;
  // One note, whole: notes, summary, transcript.
  fetch(ctx: Ctx, id: string): Promise<MeetingNotes>;
}

export interface NotesPage { notes: NoteListItem[]; cursor?: string | null }

export interface Ctx {
  // Only the settings in `env`.
  env: Readonly<Record<string, string>>;
  // JSON from the app's API. Waits and tries again when the API asks to slow down (up to five
  // times, a minute at most each); throws a SourceError for any answer that isn't a success, so the
  // page can say what went wrong.
  http<T = any>(url: string, opts?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown }): Promise<T>;
}

// An answer from the app that wasn't a success. Give a message when you can say more than the
// status does ("Granola has no finished notes for this meeting yet.").
export class SourceError extends Error {
  readonly status: number;
  constructor(status: number, message = '') { super(message); this.name = 'SourceError'; this.status = status; }
}

const MAX_BYTES = 30_000_000;

export function connectorContext(c: NotesConnector, env: Record<string, string | undefined>, opts: { fetch?: typeof fetch; wait?: (ms: number) => Promise<void> } = {}): Ctx {
  const doFetch = opts.fetch ?? fetch;
  const wait = opts.wait ?? (ms => new Promise<void>(ok => setTimeout(ok, ms)));
  const only = Object.freeze(Object.fromEntries(c.env.map(k => [k, env[k] ?? ''])));
  return {
    env: only,
    async http(url, o = {}) {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !c.hosts.includes(u.hostname)) throw new Error(`the ${c.name} connector tried to reach ${u.host}, which isn’t one of its hosts`);
      const body = o.body === undefined ? undefined : JSON.stringify(o.body);
      for (let attempt = 0; ; attempt++) {
        const r = await doFetch(u, {
          method: o.method ?? 'GET',
          headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...o.headers },
          body,
          // A redirect could carry the key somewhere else.
          redirect: 'error',
          signal: AbortSignal.timeout(25_000),
        });
        if (r.status === 429 && attempt < 5) {
          await r.body?.cancel();
          await wait(Math.min(Number(r.headers.get('retry-after')) || 2 ** attempt, 60) * 1000);
          continue;
        }
        if (!r.ok) { await r.body?.cancel(); throw new SourceError(r.status); }
        if (Number(r.headers.get('content-length')) > MAX_BYTES) { await r.body?.cancel(); throw new SourceError(413, `${c.name} sent more than Cueboard reads at once.`); }
        const text = await r.text();
        if (text.length > MAX_BYTES) throw new SourceError(413, `${c.name} sent more than Cueboard reads at once.`);
        try { return JSON.parse(text); } catch { throw new SourceError(502, `${c.name} answered with something that isn’t JSON.`); }
      }
    },
  };
}

// What the page is told when something goes wrong. Never the key, never the note.
export function problemFor(c: NotesConnector, e: unknown): { status: number; code: string; message: string } {
  if (e instanceof SourceError) {
    const s = e.status;
    const code = s === 401 || s === 403 ? 'unauthorized' : s === 404 ? 'not_found' : s === 429 ? 'rate_limited' : 'other';
    const message = e.message
      || (code === 'unauthorized' ? `${c.name} didn’t accept the key. Check ${c.env.join(' and ')} in Cueboard’s settings.`
        : code === 'not_found' ? `${c.name} doesn’t have that note, or hasn’t finished it yet.`
          : code === 'rate_limited' ? `${c.name} asked Cueboard to slow down. Try again in a minute.`
            : `${c.name} answered ${s}.`);
    // Never a 401: to the page, that means signed out of Cueboard.
    return { status: s === 404 ? 404 : 502, code, message };
  }
  const err = e as Error;
  if (err?.name === 'TimeoutError') return { status: 504, code: 'unavailable', message: `${c.name} took too long to answer. Try again.` };
  return { status: 502, code: 'unavailable', message: `Couldn’t reach ${c.name}: ${err?.message ?? e}` };
}

// ---------- What comes back, checked ----------
// A connector's answer is the app's data, so it's checked before the page sees it: right types,
// sane sizes, https links only. The server keeps what's usable and drops the rest; the tests in
// connectors/testing.ts use the problems list to tell a connector's author what to fix.

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// A moment, not a wall-clock time: without its zone, a time would be read in wherever Cueboard runs.
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));
const DATE_HELP = 'should be an ISO date and time with its zone, like 2026-10-08T14:00:00Z';
const EMAIL = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
const email = (v: unknown) => { const s = str(v, 254).toLowerCase(); return EMAIL.test(s) ? s : ''; };

export class NotesProblem extends Error { constructor(message: string) { super(message); this.name = 'NotesProblem'; } }

export function cleanList(c: NotesConnector, page: NotesPage, problems: string[] = []): { notes: NoteListItem[]; cursor: string | null } {
  if (!page || !Array.isArray(page.notes)) throw new NotesProblem('list() has to return { notes: [...] }');
  const notes: NoteListItem[] = [];
  for (const [i, n] of page.notes.entries()) {
    if (typeof n?.id !== 'string' || !matches(c.noteId, n.id)) { problems.push(`notes[${i}].id ${JSON.stringify(n?.id)} doesn’t match noteId`); continue; }
    if (!isDate(n.at)) { problems.push(`notes[${i}].at ${DATE_HELP}, got ${JSON.stringify(n.at)}`); continue; }
    const title = str(n.title, 200);
    if (!title) problems.push(`notes[${i}].title is empty`);
    notes.push({ id: n.id, title: title || 'Untitled meeting', at: n.at });
  }
  const cursor = page.cursor == null || page.cursor === '' ? null : String(page.cursor).slice(0, 500);
  return { notes, cursor };
}

export function cleanNotes(c: NotesConnector, n: MeetingNotes, problems: string[] = []): MeetingNotes {
  if (!n || typeof n !== 'object') throw new NotesProblem('fetch() has to return a note');
  if (typeof n.id !== 'string' || !matches(c.noteId, n.id)) throw new NotesProblem(`id ${JSON.stringify(n.id)} doesn’t match noteId`);
  if (!isDate(n.start)) throw new NotesProblem(`start ${DATE_HELP}, got ${JSON.stringify(n.start)}`);
  const title = str(n.title, 200);
  if (!title) problems.push('title is empty');
  const out: MeetingNotes = { id: n.id, title: title || 'Untitled meeting', start: n.start, people: [] };
  if (n.end != null) {
    if (isDate(n.end) && Date.parse(n.end) >= Date.parse(n.start)) out.end = n.end;
    else problems.push(`end ${JSON.stringify(n.end)} ${isDate(n.end) ? 'isn’t after start' : DATE_HELP}`);
  }
  if (n.url != null) {
    if (typeof n.url === 'string' && /^https:\/\/[^\s]+$/.test(n.url) && n.url.length <= 2000) out.url = n.url;
    else problems.push('url should be an https link');
  }
  if (n.me != null) {
    const e = email(n.me.email);
    if (e) out.me = { email: e, ...(str(n.me.name, 120) ? { name: str(n.me.name, 120) } : {}) };
    else problems.push(`me.email ${JSON.stringify(n.me.email)} isn’t an email address`);
  }
  if (!Array.isArray(n.people)) problems.push('people should be a list (it can be empty)');
  for (const [i, p] of (Array.isArray(n.people) ? n.people : []).slice(0, 300).entries()) {
    const name = str(p?.name, 120), e = email(p?.email);
    if (p?.email != null && p.email !== '' && !e) problems.push(`people[${i}].email ${JSON.stringify(p.email)} isn’t an email address`);
    if (!name && !e) { problems.push(`people[${i}] has neither a name nor an email`); continue; }
    out.people.push({ ...(name ? { name } : {}), ...(e ? { email: e } : {}) });
  }
  const mine = str(n.myNotes, 200_000), summary = str(n.summary, 200_000);
  if (mine) out.myNotes = mine;
  if (summary) out.summary = summary;
  if (typeof n.transcript === 'string') { const t = str(n.transcript, 2_000_000); if (t) out.transcript = t; }
  else if (Array.isArray(n.transcript)) {
    const lines: SaidLine[] = [];
    for (const [i, l] of n.transcript.slice(0, 20_000).entries()) {
      const text = str(l?.text, 20_000);
      if (typeof l?.text !== 'string') { problems.push(`transcript[${i}].text should be text`); continue; }
      if (!text) continue;
      const name = str(l.name, 120), label = str(l.label, 60), e = email(l.email);
      if (l.email != null && l.email !== '' && !e) problems.push(`transcript[${i}].email ${JSON.stringify(l.email)} isn’t an email address`);
      lines.push({ text, ...(l.me === true ? { me: true } : {}), ...(name ? { name } : {}), ...(e ? { email: e } : {}), ...(label ? { label } : {}) });
    }
    if (lines.length) out.transcript = lines;
  } else if (n.transcript != null) problems.push('transcript should be a list of lines or text');
  if (!out.myNotes && !out.summary && !out.transcript) problems.push('the note has no notes, summary or transcript');
  return out;
}

// A RegExp with the g or y flag remembers where it last matched, so test() alternates.
const matches = (re: RegExp, s: string) => { re.lastIndex = 0; return re.test(s); };
export const idMatches = matches;

// Notes kept in memory instead of an app, for the demo week and tests.
export function sampleConnector(c: NotesConnector, notes: () => MeetingNotes[]): NotesConnector {
  return {
    ...c,
    async list(_ctx, { after }) {
      const ns = notes().filter(n => n.start.slice(0, 10) >= after).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
      return { notes: ns.map(n => ({ id: n.id, title: n.title, at: n.start })), cursor: null };
    },
    async fetch(_ctx, id) {
      const n = notes().find(x => x.id === id);
      if (!n) throw new SourceError(404);
      return n;
    },
  };
}
