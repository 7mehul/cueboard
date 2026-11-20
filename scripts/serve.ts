// Serve dist/ on this machine only, rebuild the app when its sources change, and run model steps
// for the page with the credentials in this terminal, so no key ever reaches the browser.
// Usage: node scripts/serve.ts [port] [--fake-model] [--fake-granola] [--hosted]
//   With ANTHROPIC_API_KEY (or a signed-in profile) set, the page gets Claude (CUE_MODEL to pick).
//   With GRANOLA_API_KEY set, the page can bring in Granola notes (read-only).
//   With GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set, people can connect Google Calendar.
//   --fake-model answers for the sample documents only; --fake-granola serves two sample notes;
//   --fake-calendar serves a sample week of meetings and connects without Google.
//   --demo serves a whole founder's week to explore (scenarios/demo.ts): its calendar, its Granola
//   notes, and memory to start from, which the page offers to load. Add --fake-model to play it
//   without a key; with ANTHROPIC_API_KEY set, Claude reads it.
//   --hosted is the test version on the internet: invite codes, a daily allowance of model calls
//   per tester, and a usage log. It needs CUE_INVITES and CUE_SECRET; see README "Hosted test".
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from '../src/intel/schemas.ts';
import { LLMError } from '../src/intel/llm.ts';
import type { Found, LLM, Usage as Tokens } from '../src/intel/llm.ts';
import { Limiter, Usage, clientEvent, cookie, parseInvites, sessionName, sessionToken, SESSION_DAYS } from './gate.ts';
import { adminPage, joinPage } from './hosted-pages.ts';
import { GoogleError, authUrl, exchangeCode, listEvents, refreshAccess, revoke, sealer } from './google.ts';
import { LinkError, fetchFeed } from './calendar-link.ts';
import { parseIcs } from '../src/memory/ics.ts';

const args = process.argv.slice(2);
const hosted = args.includes('--hosted');
const argPort = Number(args.find(a => /^\d+$/.test(a)));
const port = hosted ? Number(process.env.PORT) || argPort || 10000 : argPort || 5180;
const dist = new URL('../dist/', import.meta.url);
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

// A sign-in saved by `ant auth login` on this machine counts as a key. The SDK finds it itself;
// this only asks whether there is one.
async function signedIn() {
  try { return !!(await (await import('@anthropic-ai/sdk/core/credentials')).loadCredentials()); } catch { return false; }
}

let llm: LLM | null = null;
if (args.includes('--fake-model')) llm = (await import('../scenarios/fake-model.ts')).fakeModel();
else if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE || (!hosted && await signedIn())) {
  llm = (await import('../src/intel/providers/claude.ts')).claude();
}

// The hosted version's settings. It refuses to start half-configured.
const fail = (msg: string): never => { console.error(`Can't start the hosted version: ${msg}`); process.exit(1); };
const H = hosted ? (() => {
  let invites: Map<string, string> = new Map();
  try { invites = parseInvites(process.env.CUE_INVITES ?? ''); } catch (e) { fail(`CUE_INVITES: ${(e as Error).message}`); }
  if (!invites.size) fail('set CUE_INVITES to name:code pairs (node scripts/invite.ts makes them)');
  const secret = process.env.CUE_SECRET ?? '';
  if (secret.length < 32) fail('set CUE_SECRET to at least 32 random characters; it signs everyone’s session');
  const names = new Set(invites.values());
  const admins = new Set((process.env.CUE_ADMINS ?? '').split(/[,\s]+/).filter(n => names.has(n)));
  const num = (v: string | undefined, d: number) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    invites, names, secret, admins, sample: /not-for-hosting/.test(secret),
    perTester: num(process.env.CUE_DAILY_CALLS, 150), total: num(process.env.CUE_DAILY_TOTAL, 1000),
    usage: new Usage(process.env.CUE_DATA_DIR || null), joins: new Limiter(10, 10 * 60_000),
  };
})() : null;
if (H) await H.usage.load();

// Granola, read-only, with a personal API key from Granola's Settings → Connectors → API keys.
// Never in the hosted version: the key would hand one person's notes to every tester.
const GRANOLA = 'https://public-api.granola.ai/v1';
const granolaKey = hosted ? undefined : process.env.GRANOLA_API_KEY;
if (hosted && process.env.GRANOLA_API_KEY) console.warn('GRANOLA_API_KEY is ignored in the hosted version');
const demo = !hosted && args.includes('--demo') ? await import('../scenarios/demo.ts') : null;
const sampleNotes = !hosted && args.includes('--fake-granola') ? (await import('../scenarios/granola.ts')).GRANOLA_NOTES : null;
// Sample notes, dated from today when they're the demo's.
const fakeNotes = () => (demo ? demo.demoWorld(new Date()).granola : sampleNotes);
const fakeGranola = !!(demo || sampleNotes);

// Google Calendar, read-only. The grant is sealed into a cookie with the hosted secret, or with a
// key this machine keeps in data/ (never committed), so restarting keeps people connected.
const googleId = process.env.GOOGLE_CLIENT_ID, googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const fakeCalendar = args.includes('--fake-calendar') || demo ? await import('../scenarios/calendar.ts') : null;
const sampleEvents = (now: Date) => (demo ? demo.demoWorld(now).events : fakeCalendar!.fakeEvents(now));
const calendarOn = !!(googleId && googleSecret) || !!fakeCalendar;
async function localKey(): Promise<string> {
  const dir = new URL('../data/', import.meta.url), file = new URL('local.key', dir);
  const k = (await readFile(file, 'utf8').catch(() => '')).trim();
  if (k.length >= 32) return k;
  await mkdir(dir, { recursive: true });
  const fresh = randomBytes(32).toString('hex');
  await writeFile(file, fresh, { mode: 0o600 });
  return fresh;
}
const seal = sealer(H ? H.secret : await localKey());

const build = fileURLToPath(new URL('./build-app.ts', import.meta.url));
if (hosted) { if (spawnSync(process.execPath, [build], { stdio: 'inherit' }).status !== 0) fail('the app didn’t build'); }
else spawn(process.execPath, [build, '--watch'], { stdio: 'inherit' });

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }).end(JSON.stringify(body));
};
const page = (res: ServerResponse, status: number, html: string) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
};
async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) return null; chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString('utf8');
}
const json = (raw: string | null): any => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

// Only the page served here may call the API: the request has to carry the header a cross-site
// form or image can't send, from this server's own origin, so other sites can't spend the key.
const https = (req: IncomingMessage) => String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
function allowed(req: IncomingMessage) {
  if (req.headers['x-cueboard'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return hosted ? origin === `${https(req) ? 'https' : 'http'}://${req.headers.host}` : origins.has(origin);
}
const notAllowed = (res: ServerResponse) => send(res, 403, { error: { code: 'other', message: 'Not allowed' } });

// The hosted allowance: model calls per tester per day, and for everyone together, counted when
// a call starts, so a failing call still counts. It resets at midnight UTC.
function overAllowance(res: ServerResponse, who: string | null): boolean {
  if (!H || !who) return false;
  const mine = H.usage.today(who, 'model'), all = H.usage.todayAll();
  if (mine < H.perTester && all < H.total) return false;
  send(res, 429, { error: { code: 'rate_limited', message: mine >= H.perTester
    ? `That’s today’s ${H.perTester} model calls for you, the test’s daily limit. It resets at midnight UTC; boards still open and Float still works.`
    : 'The test has used today’s model calls for everyone. It resets at midnight UTC.' } });
  return true;
}
const logModel = (who: string | null, kind: string, t0: number, tokens: number | undefined, ok: boolean) => {
  if (H && who) H.usage.record({ t: new Date().toISOString(), who, ev: 'model', kind, ms: Date.now() - t0, ok, ...(tokens ? { tokens } : {}) });
};
const tag = (who: string | null) => (who ? ` · ${who}` : '');

async function api(req: IncomingMessage, res: ServerResponse, who: string | null) {
  if (!allowed(req)) { notAllowed(res); return; }
  if (req.method === 'GET') { send(res, 200, { available: !!llm, chat: !!llm?.text, ...(llm ? { model: llm.name } : {}), ...(hosted ? { hosted: true } : {}) }); return; }
  if (req.method !== 'POST') { send(res, 405, { error: { code: 'other', message: 'Use POST' } }); return; }
  if (!llm) { send(res, 503, { error: { code: 'unavailable', message: 'No model: start the server with ANTHROPIC_API_KEY set' } }); return; }
  const body = json(await readBody(req, 2_000_000)) as { step?: string; system?: string; prompt?: string; effort?: 'low' | 'medium' | 'high'; maxTokens?: number } | null;
  const schema = body?.step ? SCHEMAS[body.step as keyof typeof SCHEMAS] : undefined;
  if (!body || !schema || typeof body.system !== 'string' || typeof body.prompt !== 'string') { send(res, 400, { error: { code: 'other', message: 'Unknown step or missing prompt' } }); return; }
  if (overAllowance(res, who)) return;
  const maxTokens = typeof body.maxTokens === 'number' ? (hosted ? Math.min(body.maxTokens, 32_000) : body.maxTokens) : undefined;
  const t0 = Date.now();
  try {
    const q = { step: body.step!, system: body.system, prompt: body.prompt, schema: schema as never, ...(body.effort ? { effort: body.effort } : {}), ...(maxTokens ? { maxTokens } : {}) };
    // Research searches the web; it's the one step that needs a model that can.
    if (body.step === 'research' && !llm.research) throw new LLMError('unavailable', 'This model can’t search the web');
    const r: { value: unknown; usage?: Tokens; found?: Found[] } = body.step === 'research' ? await llm.research!(q) : await llm.json(q);
    const tokens = r.usage ? r.usage.inputTokens + r.usage.outputTokens : undefined;
    console.log(`${body.step}${tag(who)} · ${((Date.now() - t0) / 1000).toFixed(1)}s${tokens ? ` · ${tokens.toLocaleString()} tokens` : ''}${r.found ? ` · ${r.found.length} pages` : ''}`);
    logModel(who, body.step!, t0, tokens, true);
    send(res, 200, { value: r.value, ...(r.found ? { found: r.found } : {}), ...(r.usage ? { usage: r.usage } : {}) });
  } catch (e) {
    const err = e instanceof LLMError ? { code: e.code, message: e.message } : { code: 'other', message: (e as Error).message };
    console.log(`${body.step}${tag(who)} failed · ${err.code}: ${err.message}`);
    logModel(who, body.step!, t0, undefined, false);
    send(res, 502, { error: err });
  }
}

// A conversation turn for the board assistant: plain text back, which the page parses.
async function chatApi(req: IncomingMessage, res: ServerResponse, who: string | null) {
  if (!allowed(req)) { notAllowed(res); return; }
  if (req.method !== 'POST') { send(res, 405, { error: { code: 'other', message: 'Use POST' } }); return; }
  if (!llm?.text) { send(res, 503, { error: { code: 'unavailable', message: 'No model for the assistant: start the server with ANTHROPIC_API_KEY set' } }); return; }
  const body = json(await readBody(req, 2_000_000)) as { messages?: { role: 'user' | 'assistant'; content: string }[]; effort?: 'low' | 'medium' | 'high' } | null;
  const ok = Array.isArray(body?.messages) && body!.messages!.length > 0 && body!.messages!.every(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  if (!ok) { send(res, 400, { error: { code: 'other', message: 'Missing messages' } }); return; }
  if (overAllowance(res, who)) return;
  const t0 = Date.now();
  try {
    const r = await llm.text({ messages: body!.messages!, effort: body!.effort ?? 'medium' });
    const tokens = r.usage ? r.usage.inputTokens + r.usage.outputTokens : undefined;
    console.log(`assistant${tag(who)} · ${((Date.now() - t0) / 1000).toFixed(1)}s${tokens ? ` · ${tokens.toLocaleString()} tokens` : ''}`);
    logModel(who, 'assistant', t0, tokens, true);
    send(res, 200, { text: r.text });
  } catch (e) {
    const err = e instanceof LLMError ? { code: e.code, message: e.message } : { code: 'other', message: (e as Error).message };
    console.log(`assistant${tag(who)} failed · ${err.code}: ${err.message}`);
    logModel(who, 'assistant', t0, undefined, false);
    send(res, 502, { error: err });
  }
}

// Granola's API, waiting and retrying when it asks us to slow down.
async function granolaGet(path: string): Promise<{ status: number; body: any }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(GRANOLA + path, { headers: { authorization: `Bearer ${granolaKey}` }, signal: AbortSignal.timeout(25_000) });
    if (r.status === 429) { await new Promise(ok => setTimeout(ok, (Number(r.headers.get('retry-after')) || attempt + 1) * 1000)); continue; }
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  return { status: 429, body: null };
}
const granolaError = (status: number) =>
  status === 401 || status === 403 ? { code: 'unauthorized', message: 'Granola didn’t accept the API key. Check GRANOLA_API_KEY.' }
    : status === 404 ? { code: 'not_ready', message: 'Granola has no finished notes for this meeting yet.' }
      : status === 429 ? { code: 'rate_limited', message: 'Granola asked us to slow down. Try again in a minute.' }
        : { code: 'other', message: `Granola answered ${status}.` };

async function granolaApi(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
  if (!allowed(req)) { notAllowed(res); return; }
  if (req.method !== 'GET') { send(res, 405, { error: { code: 'other', message: 'Read-only' } }); return; }
  if (path === '/api/granola') { send(res, 200, { available: !!(granolaKey || fakeGranola), ...(fakeGranola ? { fake: true } : {}), ...(hosted ? { hosted: true } : {}) }); return; }
  if (!granolaKey && !fakeGranola) { send(res, 503, { error: { code: 'unavailable', message: 'Start Cueboard with GRANOLA_API_KEY set to bring in Granola notes.' } }); return; }
  try {
    if (path === '/api/granola/notes') {
      const after = query.get('after') ?? '';
      const cursor = (query.get('cursor') ?? '').slice(0, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(after)) { send(res, 400, { error: { code: 'other', message: 'after must be a date' } }); return; }
      if (fakeGranola) {
        const notes = fakeNotes()!.filter(n => n.created_at.slice(0, 10) >= after).map(n => ({ id: n.id, title: n.title, created_at: n.created_at }));
        send(res, 200, { notes, hasMore: false, cursor: null }); return;
      }
      const r = await granolaGet(`/notes?created_after=${after}&page_size=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (r.status !== 200 || !r.body) { send(res, 502, { error: granolaError(r.status) }); return; }
      const notes = (r.body.notes ?? []).filter((n: { deleted_at?: string | null }) => !n.deleted_at)
        .map((n: { id: string; title: string | null; created_at: string }) => ({ id: n.id, title: n.title, created_at: n.created_at }));
      console.log(`granola · listed ${notes.length} notes`);
      send(res, 200, { notes, hasMore: !!r.body.hasMore, cursor: r.body.cursor ?? null }); return;
    }
    const m = /^\/api\/granola\/notes\/(not_[a-zA-Z0-9]{14})$/.exec(path);
    if (m) {
      const id = m[1];
      if (fakeGranola) { const n = fakeNotes()!.find(x => x.id === id); send(res, n ? 200 : 404, n ?? { error: granolaError(404) }); return; }
      let r = await granolaGet(`/notes/${id}?include=transcript`);
      // A transcript too long to send inline comes in pages.
      if (r.status === 413) {
        r = await granolaGet(`/notes/${id}`);
        if (r.status === 200 && r.body) {
          const items: unknown[] = [];
          let cursor: string | null = null;
          for (let page = 0; page < 40; page++) {
            const t = await granolaGet(`/notes/${id}/transcript?page_size=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
            if (t.status !== 200 || !t.body) break;
            items.push(...(t.body.transcript ?? []));
            if (!t.body.hasMore) break;
            cursor = t.body.cursor;
          }
          r.body.transcript = items;
        }
      }
      if (r.status !== 200 || !r.body) { send(res, 502, { error: granolaError(r.status) }); return; }
      console.log(`granola · fetched ${id}`);
      send(res, 200, r.body); return;
    }
    send(res, 404, { error: { code: 'other', message: 'Unknown Granola route' } });
  } catch (e) {
    send(res, 502, { error: { code: 'unavailable', message: `Couldn’t reach Granola: ${(e as Error).message}` } });
  }
}

// Google Calendar. The page asks for events; the server reads them with the grant in the cookie.
// Either a Google grant, or a calendar's private feed link (any calendar app), sealed the same way.
type Grant = { rt?: string; fake?: boolean; ics?: string; at: number };
const GCAL = 'cue_gcal', OAUTH = 'cue_oauth';
const access = new Map<string, { token: string; exp: number }>();
const cookieFlags = (req: IncomingMessage, maxAge: number) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https(req) ? '; Secure' : ''}`;
const grantOf = (req: IncomingMessage) => seal.open<Grant>(cookie(req.headers.cookie, GCAL));
const redirectUri = (req: IncomingMessage) => `${https(req) ? 'https' : 'http'}://${req.headers.host}/oauth/google/callback`;
const back = (res: ServerResponse, to: string, cookies: string[] = []) => res.writeHead(302, { location: to, 'cache-control': 'no-store', ...(cookies.length ? { 'set-cookie': cookies } : {}) }).end();

async function accessToken(rt: string, fresh = false): Promise<string> {
  const hit = access.get(rt);
  if (!fresh && hit && hit.exp > Date.now() + 60_000) return hit.token;
  const t = await refreshAccess({ clientId: googleId!, clientSecret: googleSecret!, refreshToken: rt });
  access.set(rt, { token: t.accessToken, exp: Date.now() + t.expiresIn * 1000 });
  if (access.size > 500) access.delete(access.keys().next().value!);
  return t.accessToken;
}

async function calendarApi(req: IncomingMessage, res: ServerResponse, path: string, who: string | null) {
  if (!allowed(req)) { notAllowed(res); return; }
  const grant = grantOf(req);
  const via = grant?.ics ? 'link' : grant?.fake && fakeCalendar ? 'sample' : grant?.rt && calendarOn ? 'google' : null;
  if (path === '/api/calendar' && req.method === 'GET') {
    send(res, 200, { configured: calendarOn, link: true, connected: !!via, ...(via ? { via } : {}), ...(fakeCalendar ? { fake: true } : {}), ...(hosted ? { hosted: true } : {}) }); return;
  }
  // Connecting by link: read it once to be sure it's a calendar, then keep it sealed in the cookie.
  if (path === '/api/calendar/link' && req.method === 'POST') {
    const body = json(await readBody(req, 8_000)) as { url?: unknown } | null;
    if (typeof body?.url !== 'string') { send(res, 400, { error: { code: 'bad_link', message: 'Paste your calendar’s link.' } }); return; }
    try {
      const now = Date.now();
      const cal = parseIcs(await fetchFeed(body.url), { from: new Date(now - 14 * 864e5).toISOString(), to: new Date(now + 14 * 864e5).toISOString() });
      console.log(`calendar link connected${tag(who)} · ${cal.events.length} events`);
      if (grant?.rt) { await revoke(grant.rt); access.delete(grant.rt); }
      const url = body.url.trim().replace(/^webcals?:\/\//i, 'https://');
      send(res, 200, { ok: true, ...(cal.email ? { email: cal.email } : {}), events: cal.events.length }, { 'set-cookie': `${GCAL}=${seal.seal({ ics: url, at: now })}; ${cookieFlags(req, 365 * 86400)}` });
    } catch (e) {
      const err = e instanceof LinkError ? { code: e.code, message: e.message } : { code: 'bad_link', message: (e as Error).message || 'Couldn’t read that calendar.' };
      console.log(`calendar link failed${tag(who)} · ${err.code}`);
      send(res, 400, { error: err });
    }
    return;
  }
  if (path === '/api/calendar/disconnect' && req.method === 'POST') {
    if (grant?.rt) { await revoke(grant.rt); access.delete(grant.rt); }
    send(res, 200, { ok: true }, { 'set-cookie': `${GCAL}=; ${cookieFlags(req, 0)}` }); return;
  }
  if (path === '/api/calendar/events' && req.method === 'GET' && grant?.ics) {
    const now = Date.now(), from = new Date(now - 14 * 864e5).toISOString(), to = new Date(now + 14 * 864e5).toISOString();
    try {
      const cal = parseIcs(await fetchFeed(grant.ics), { from, to });
      console.log(`calendar link${tag(who)} · ${cal.events.length} events`);
      send(res, 200, { ...(cal.email ? { email: cal.email } : {}), from, to, events: cal.events });
    } catch (e) {
      const gone = e instanceof LinkError && e.code === 'gone';
      console.log(`calendar link failed${tag(who)} · ${e instanceof LinkError ? e.code : 'parse'}`);
      if (gone) send(res, 401, { error: { code: 'reconnect', message: (e as Error).message } }, { 'set-cookie': `${GCAL}=; ${cookieFlags(req, 0)}` });
      else send(res, 502, { error: { code: 'unavailable', message: (e as Error).message || 'Couldn’t read your calendar.' } });
    }
    return;
  }
  if (path === '/api/calendar/events' && req.method === 'GET') {
    if (!calendarOn) { send(res, 503, { error: { code: 'unavailable', message: 'Google Calendar isn’t set up on this server.' } }); return; }
    if (!grant || (!grant.rt && !grant.fake)) { send(res, 401, { error: { code: 'reconnect', message: 'Connect your Google Calendar first.' } }); return; }
    const now = Date.now(), from = new Date(now - 14 * 864e5).toISOString(), to = new Date(now + 14 * 864e5).toISOString();
    if (grant.fake && fakeCalendar) { send(res, 200, { email: fakeCalendar.FAKE_SELF, from, to, events: sampleEvents(new Date(now)) }); return; }
    try {
      let r;
      try { r = await listEvents(await accessToken(grant.rt!), from, to); }
      catch (e) { if (e instanceof GoogleError && e.code === 'expired') r = await listEvents(await accessToken(grant.rt!, true), from, to); else throw e; }
      console.log(`calendar${tag(who)} · ${r.events.length} events`);
      send(res, 200, { ...(r.email ? { email: r.email } : {}), from, to, events: r.events });
    } catch (e) {
      const reconnect = e instanceof GoogleError && e.code === 'reconnect';
      console.log(`calendar${tag(who)} failed · ${(e as Error).message}`);
      if (reconnect) send(res, 401, { error: { code: 'reconnect', message: (e as Error).message } }, { 'set-cookie': `${GCAL}=; ${cookieFlags(req, 0)}` });
      else send(res, 502, { error: { code: 'unavailable', message: `Couldn’t read your calendar: ${(e as Error).message}` } });
    }
    return;
  }
  send(res, 404, { error: { code: 'other', message: 'Unknown calendar route' } });
}

// Connecting: off to Google with a one-time state tied to this browser, and back with a grant.
async function oauth(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
  if (!calendarOn || req.method !== 'GET') { res.writeHead(404).end('not found'); return; }
  if (path === '/oauth/google/start') {
    if (fakeCalendar) { back(res, '/?calendar=connected', [`${GCAL}=${seal.seal({ fake: true, at: Date.now() })}; ${cookieFlags(req, 180 * 86400)}`]); return; }
    const nonce = randomBytes(18).toString('base64url');
    back(res, authUrl({ clientId: googleId!, redirectUri: redirectUri(req), state: nonce }), [`${OAUTH}=${nonce}; ${cookieFlags(req, 600)}`]);
    return;
  }
  if (path === '/oauth/google/callback') {
    const clear = `${OAUTH}=; ${cookieFlags(req, 0)}`;
    const state = query.get('state') ?? '', nonce = cookie(req.headers.cookie, OAUTH) ?? '', code = query.get('code');
    const same = state.length > 0 && state.length === nonce.length && timingSafeEqual(Buffer.from(state), Buffer.from(nonce));
    if (!same) { back(res, '/?calendar=failed', [clear]); return; }
    if (query.get('error') || !code) { back(res, '/?calendar=denied', [clear]); return; }
    try {
      const t = await exchangeCode({ clientId: googleId!, clientSecret: googleSecret!, redirectUri: redirectUri(req), code });
      if (!t.scope.includes('calendar')) { back(res, '/?calendar=denied', [clear]); return; }
      if (!t.refreshToken) { back(res, '/?calendar=failed', [clear]); return; }
      access.set(t.refreshToken, { token: t.accessToken, exp: Date.now() + t.expiresIn * 1000 });
      console.log('calendar connected');
      back(res, '/?calendar=connected', [clear, `${GCAL}=${seal.seal({ rt: t.refreshToken, at: Date.now() })}; ${cookieFlags(req, 180 * 86400)}`]);
    } catch (e) {
      console.log(`calendar connect failed · ${(e as Error).message}`);
      back(res, '/?calendar=failed', [clear]);
    }
    return;
  }
  res.writeHead(404).end('not found');
}

// The hosted front door. Returns who is asking, or answers the request itself and returns null.
const SESSION = 'cue_session';
async function gate(req: IncomingMessage, res: ServerResponse, path: string): Promise<string | null> {
  const h = H!;
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('content-security-policy', "frame-ancestors 'self'");
  res.setHeader('x-robots-tag', 'noindex');
  if (https(req)) res.setHeader('strict-transport-security', 'max-age=31536000');
  // The sample settings in deploy/local.env are public, so with them only this machine gets in.
  const local = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress ?? '') && !req.headers['x-forwarded-for'];
  if (h.sample && !local) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('This server is using the sample settings from deploy/local.env. Set your own CUE_SECRET and CUE_INVITES.'); return null; }
  if (path === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return null; }
  if (path === '/join') { page(res, 200, joinPage()); return null; }
  if (path === '/api/join') {
    if (req.method !== 'POST' || !allowed(req)) { notAllowed(res); return null; }
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (!h.joins.allow(ip)) { send(res, 429, { error: { code: 'rate_limited', message: 'Too many tries. Wait ten minutes and try again.' } }); return null; }
    const code = json(await readBody(req, 2_000))?.code;
    const name = typeof code === 'string' ? h.invites.get(code.trim()) : undefined;
    if (!name) { send(res, 401, { error: { code: 'other', message: 'That code isn’t an invite. Check it and try again.' } }); return null; }
    const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${https(req) ? '; Secure' : ''}`;
    console.log(`joined · ${name}`);
    send(res, 200, { ok: true }, { 'set-cookie': `${SESSION}=${sessionToken(name, h.secret)}; ${flags}` });
    return null;
  }
  const who = sessionName(cookie(req.headers.cookie, SESSION), h.secret, h.names);
  if (!who) {
    if (path.startsWith('/api/')) send(res, 401, { error: { code: 'unavailable', message: 'Your invite has run out on this browser. Open your invite link again.' } });
    else res.writeHead(302, { location: '/join', 'cache-control': 'no-store' }).end();
    return null;
  }
  if (path === '/admin') {
    if (!h.admins.has(who)) { res.writeHead(404).end('not found'); return null; }
    page(res, 200, adminPage(h.usage.summary(), { today: h.usage.todayAll(), perTester: h.perTester, total: h.total, invited: [...h.names] }));
    return null;
  }
  if (path === '/api/event') {
    if (req.method !== 'POST' || !allowed(req)) { notAllowed(res); return null; }
    const e = clientEvent(who, json(await readBody(req, 2_000)));
    if (e && h.usage.today(who, 'event') < 2000) h.usage.record(e);
    res.writeHead(204).end();
    return null;
  }
  return who;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  let who: string | null = null;
  if (H) { who = await gate(req, res, path); if (!who) return; }
  else if (path === '/api/event') { res.writeHead(204).end(); return; }
  if (path === '/api/llm') { await api(req, res, who); return; }
  if (path === '/api/chat') { await chatApi(req, res, who); return; }
  if (path === '/api/granola' || path.startsWith('/api/granola/')) { await granolaApi(req, res, path, url.searchParams); return; }
  if (path === '/api/calendar' || path.startsWith('/api/calendar/')) { await calendarApi(req, res, path, who); return; }
  if (path === '/api/demo') {
    if (!demo) { send(res, 404, { error: { code: 'other', message: 'Start Cueboard with --demo for the demo week' } }); return; }
    if (!allowed(req) || req.method !== 'GET') { notAllowed(res); return; }
    const now = new Date(), w = demo.demoWorld(now);
    send(res, 200, { memory: demo.demoMemory(now), samples: w.samples, calendar: Object.fromEntries(w.events.map(e => [e.id, e.title])) });
    return;
  }
  if (path.startsWith('/oauth/google/')) { await oauth(req, res, path, url.searchParams); return; }
  const file = path === '/' ? 'cueboard.html' : path.slice(1);
  if (file.includes('..')) { res.writeHead(400).end(); return; }
  try {
    const body = await readFile(new URL(file, dist));
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, hosted ? '0.0.0.0' : '127.0.0.1', () => console.log(hosted
  ? `hosted test version on port ${port} · model: ${llm ? llm.name : 'none (set ANTHROPIC_API_KEY)'} · calendar: ${calendarOn ? 'on' : 'off (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)'} · ${H!.names.size} invites · ${H!.perTester} model calls per tester a day, ${H!.total} in all · usage log: ${process.env.CUE_DATA_DIR ? process.env.CUE_DATA_DIR + '/usage.jsonl' : 'stdout only (set CUE_DATA_DIR to keep it)'}`
  : `serving http://localhost:${port}${demo ? ' · the demo week' : ''} · model: ${llm ? llm.name : 'none (rules only; run `ant auth login` or set ANTHROPIC_API_KEY for Claude)'} · Granola: ${fakeGranola ? 'sample notes' : granolaKey ? 'connected' : 'off (set GRANOLA_API_KEY)'} · calendar: ${fakeCalendar ? 'sample week' : calendarOn ? 'on' : 'off (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)'}`));
