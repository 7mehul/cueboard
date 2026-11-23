// The Cueboard app on your computer (what `npm start` and `npx cueboard` run): it serves the page,
// rebuilds it when its sources change in a clone, and runs model steps
// for the page with the credentials in its own environment, so no key ever reaches the browser.
// Usage: node scripts/serve.ts [port] [--demo] [--fake-model] [--fake-granola] [--fake-calendar] [--no-watch]
//   With ANTHROPIC_API_KEY (or an `ant auth login` sign-in) the page gets Claude (CUE_MODEL to pick).
//   With a notes app's key set (GRANOLA_API_KEY; see CONNECTORS.md), the page can bring in its notes.
//   With GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set, you can sign in to Google Calendar.
//   --fake-model answers for the sample documents only; --fake-granola serves two sample notes;
//   --fake-calendar serves a sample week of meetings and connects without Google.
//   --demo serves a whole founder's week to explore (scenarios/demo.ts): its calendar, its Granola
//   notes, and memory to start from, which the page offers to load. Add --fake-model to play it
//   without a key; with ANTHROPIC_API_KEY set, Claude reads it.
// On a server (README "Optional: run it on a server"): by default it answers this machine only, with no password.
// With CUE_PASSWORD set, every page and call needs that password once per browser, and CUE_HOST
// can open it to other machines (0.0.0.0; the Docker image does this). PORT picks the port, and
// CUE_DATA_DIR where the key that seals sign-ins and calendar access is kept (./data by default).
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { SCHEMAS } from '../src/intel/schemas.ts';
import { LLMError } from '../src/intel/llm.ts';
import type { Found, LLM, Usage as Tokens } from '../src/intel/llm.ts';
import { Limiter, MIN_PASSWORD, SESSION_DAYS, clientAddress, cookie, passwordMatches, sessionToken, sessionValid, signInPage } from './auth.ts';
import { GoogleError, authUrl, exchangeCode, listEvents, refreshAccess, revoke, sealer } from './google.ts';
import { LinkError, fetchFeed } from './calendar-link.ts';
import { parseIcs } from '../src/memory/ics.ts';
import { NOTES_APPS } from '../connectors/index.ts';
import { NotesProblem, cleanList, cleanNotes, connectorContext, idMatches, problemFor, sampleConnector } from '../connectors/kit.ts';
import { granolaNotes } from '../connectors/granola.ts';

// A setting left empty (a copied .env.example) counts as not set.
const notesSettings = new Set(NOTES_APPS.flatMap(c => c.env));
for (const k of Object.keys(process.env)) if ((/^(CUE_|ANTHROPIC_|GOOGLE_|PORT$)/.test(k) || notesSettings.has(k)) && !process.env[k]?.trim()) delete process.env[k];

const args = process.argv.slice(2);
const argPort = Number(args.find(a => /^\d+$/.test(a)));
const port = argPort || Number(process.env.PORT) || 5180;
const host = process.env.CUE_HOST || '127.0.0.1';
const password = process.env.CUE_PASSWORD ?? '';
const locked = !!password;
const dist = process.env.CUE_DIST ? pathToFileURL(resolve(process.env.CUE_DIST) + '/') : new URL('../dist/', import.meta.url);
const data = process.env.CUE_DATA_DIR ? pathToFileURL(resolve(process.env.CUE_DATA_DIR) + '/') : new URL('../data/', import.meta.url);
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

const fail = (msg: string): never => { console.error(`Cueboard didn’t start: ${msg}`); process.exit(1); };
if (!/^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|localhost)$/i.test(host) && !locked) {
  fail(`CUE_HOST=${host} lets other machines reach Cueboard, so set CUE_PASSWORD too. Without it, anyone who finds the address could use your Anthropic key and read your notes.`);
}
if (locked && password.length < MIN_PASSWORD) fail(`CUE_PASSWORD needs at least ${MIN_PASSWORD} characters. One way to make one: openssl rand -base64 18`);

// A sign-in saved by `ant auth login` on this machine counts as a key. The SDK finds it itself;
// this only asks whether there is one.
async function signedIn() {
  try { return !!(await (await import('@anthropic-ai/sdk/core/credentials')).loadCredentials()); } catch { return false; }
}

let llm: LLM | null = null;
if (args.includes('--fake-model')) llm = (await import('../scenarios/fake-model.ts')).fakeModel();
else if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE || await signedIn()) {
  llm = (await import('../src/intel/providers/claude.ts')).claude();
}

// Notes apps (connectors/), read-only, each with its own key from this machine's settings. In the
// demo week, or with --fake-granola, Granola answers from sample notes instead (dated from today
// when they're the demo's).
const demo = args.includes('--demo') ? await import('../scenarios/demo.ts') : null;
const sampleNotes = args.includes('--fake-granola') ? (await import('../scenarios/granola.ts')).GRANOLA_NOTES : null;
const fakeGranola = demo || sampleNotes ? () => (demo ? demo.demoWorld(new Date()).granola : sampleNotes!).map(granolaNotes) : null;
const notesApps = NOTES_APPS.map(c => {
  const fake = c.id === 'granola' ? fakeGranola : null;
  return { c: fake ? sampleConnector(c, fake) : c, fake: !!fake, on: !!fake || c.env.every(k => process.env[k]) };
});

// Google Calendar, read-only. The grant is sealed into a cookie with a key this server keeps in its
// data folder (never committed), so restarting keeps you connected and signed in.
const googleId = process.env.GOOGLE_CLIENT_ID, googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const fakeCalendar = args.includes('--fake-calendar') || demo ? await import('../scenarios/calendar.ts') : null;
const sampleEvents = (now: Date) => (demo ? demo.demoWorld(now).events : fakeCalendar!.fakeEvents(now));
const calendarOn = !!(googleId && googleSecret) || !!fakeCalendar;
async function serverKey(): Promise<string> {
  const file = new URL('local.key', data);
  const k = (await readFile(file, 'utf8').catch(() => '')).trim();
  if (k.length >= 32) return k;
  const fresh = randomBytes(32).toString('hex');
  try {
    await mkdir(data, { recursive: true });
    await writeFile(file, fresh, { mode: 0o600 });
  } catch (e) { fail(`couldn’t keep its key in ${fileURLToPath(data)} (${(e as Error).message}). Set CUE_DATA_DIR to a folder it can write to.`); }
  return fresh;
}
const key = await serverKey();
const seal = sealer(key);
const sessionSecret = 'cueboard/session/' + key;

const build = fileURLToPath(new URL('./build-app.ts', import.meta.url));
// Installed from npm (`npx cueboard`), the app comes built and its sources aren't there. In a
// clone it rebuilds on every change while you work on it; on a server (a password,
// NODE_ENV=production, or --no-watch) it builds once.
if (!existsSync(build)) { if (!existsSync(new URL('cueboard.html', dist))) fail('this copy of Cueboard is missing its app. Install it again.'); }
else if (locked || process.env.NODE_ENV === 'production' || args.includes('--no-watch')) { if (spawnSync(process.execPath, [build], { stdio: 'inherit' }).status !== 0) fail('the app didn’t build'); }
else spawn(process.execPath, [build, '--watch'], { stdio: 'inherit' });

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }).end(JSON.stringify(body));
};
const page = (res: ServerResponse, status: number, html: string) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
};
// A body that's too big, or that the client stops sending halfway, is no body.
async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  let size = 0; const chunks: Buffer[] = [];
  try {
    for await (const c of req) { size += (c as Buffer).length; if (size > limit) return null; chunks.push(c as Buffer); }
  } catch { return null; }
  return Buffer.concat(chunks).toString('utf8');
}
const json = (raw: string | null): any => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

// Only the page served here may call the API: the request has to carry the header a cross-site
// form or image can't send, from this server's own origin, so other sites can't spend the key.
const https = (req: IncomingMessage) => String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
// Without a password the server also checks it was addressed as this machine: a page on another
// site that rebinds its own name to 127.0.0.1 would otherwise count as "same origin". With one,
// it answers to whatever name it's reached by (a domain, behind a proxy) and the password guards it.
const hostOk = (req: IncomingMessage) => locked || origins.has(`http://${String(req.headers.host ?? '').toLowerCase()}`);
function allowed(req: IncomingMessage) {
  if (req.headers['x-cueboard'] !== '1' || !hostOk(req)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return locked ? origin === `${https(req) ? 'https' : 'http'}://${req.headers.host}` : origins.has(origin);
}
const notAllowed = (res: ServerResponse) => send(res, 403, { error: { code: 'other', message: 'Not allowed' } });

const log = (what: string, t0: number, tokens?: number, extra = '') =>
  console.log(`${what} · ${((Date.now() - t0) / 1000).toFixed(1)}s${tokens ? ` · ${tokens.toLocaleString()} tokens` : ''}${extra}`);

const EFFORTS = new Set(['low', 'medium', 'high']);
async function api(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req)) { notAllowed(res); return; }
  if (req.method === 'GET') { send(res, 200, { available: !!llm, chat: !!llm?.text, ...(llm ? { model: llm.name } : {}) }); return; }
  if (req.method !== 'POST') { send(res, 405, { error: { code: 'other', message: 'Use POST' } }); return; }
  if (!llm) { send(res, 503, { error: { code: 'unavailable', message: 'No model: start the server with ANTHROPIC_API_KEY set' } }); return; }
  const body = json(await readBody(req, 2_000_000)) as { step?: string; system?: string; prompt?: string; effort?: 'low' | 'medium' | 'high'; maxTokens?: number } | null;
  const schema = typeof body?.step === 'string' && Object.hasOwn(SCHEMAS, body.step) ? SCHEMAS[body.step as keyof typeof SCHEMAS] : undefined;
  if (!body || !schema || typeof body.system !== 'string' || typeof body.prompt !== 'string') { send(res, 400, { error: { code: 'other', message: 'Unknown step or missing prompt' } }); return; }
  const maxTokens = Number.isInteger(body.maxTokens) && body.maxTokens! > 0 ? Math.min(body.maxTokens!, 128_000) : undefined;
  if (body.effort !== undefined && !EFFORTS.has(body.effort)) { send(res, 400, { error: { code: 'other', message: 'Unknown effort' } }); return; }
  const t0 = Date.now();
  try {
    const q = { step: body.step!, system: body.system, prompt: body.prompt, schema: schema as never, ...(body.effort ? { effort: body.effort } : {}), ...(maxTokens ? { maxTokens } : {}) };
    // Research searches the web; it's the one step that needs a model that can.
    if (body.step === 'research' && !llm.research) throw new LLMError('unavailable', 'This model can’t search the web');
    const r: { value: unknown; usage?: Tokens; found?: Found[] } = body.step === 'research' ? await llm.research!(q) : await llm.json(q);
    const tokens = r.usage ? r.usage.inputTokens + r.usage.outputTokens : undefined;
    log(body.step!, t0, tokens, r.found ? ` · ${r.found.length} pages` : '');
    send(res, 200, { value: r.value, ...(r.found ? { found: r.found } : {}), ...(r.usage ? { usage: r.usage } : {}) });
  } catch (e) {
    const err = e instanceof LLMError ? { code: e.code, message: e.message } : { code: 'other', message: (e as Error).message };
    console.log(`${body.step} failed · ${err.code}: ${err.message}`);
    send(res, 502, { error: err });
  }
}

// A conversation turn for the board assistant: plain text back, which the page parses.
async function chatApi(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req)) { notAllowed(res); return; }
  if (req.method !== 'POST') { send(res, 405, { error: { code: 'other', message: 'Use POST' } }); return; }
  if (!llm?.text) { send(res, 503, { error: { code: 'unavailable', message: 'No model for the assistant: start the server with ANTHROPIC_API_KEY set' } }); return; }
  const body = json(await readBody(req, 2_000_000)) as { messages?: { role: 'user' | 'assistant'; content: string }[]; effort?: 'low' | 'medium' | 'high' } | null;
  const ok = Array.isArray(body?.messages) && body!.messages!.length > 0 && body!.messages!.every(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  if (!ok) { send(res, 400, { error: { code: 'other', message: 'Missing messages' } }); return; }
  const t0 = Date.now();
  try {
    const r = await llm.text({ messages: body!.messages!, effort: EFFORTS.has(body!.effort as string) ? body!.effort! : 'medium' });
    const tokens = r.usage ? r.usage.inputTokens + r.usage.outputTokens : undefined;
    log('assistant', t0, tokens);
    send(res, 200, { text: r.text });
  } catch (e) {
    const err = e instanceof LLMError ? { code: e.code, message: e.message } : { code: 'other', message: (e as Error).message };
    console.log(`assistant failed · ${err.code}: ${err.message}`);
    send(res, 502, { error: err });
  }
}

// The notes apps. The page lists which there are and which are set up, lists a page of notes from
// one, and fetches one note. The connector does the talking to its app; what it sends back is
// checked before the page sees it (connectors/kit.ts).
async function notesApi(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
  if (!allowed(req)) { notAllowed(res); return; }
  if (req.method !== 'GET') { send(res, 405, { error: { code: 'other', message: 'Read-only' } }); return; }
  if (path === '/api/notes') {
    send(res, 200, { sources: notesApps.map(({ c, on, fake }) => ({ id: c.id, name: c.name, available: on, ...(fake ? { fake: true } : {}), env: c.env, setup: c.setup })) });
    return;
  }
  const m = /^\/api\/notes\/([a-z0-9-]+)(?:\/([^/]+))?$/.exec(path);
  const app = m && notesApps.find(a => a.c.id === m[1]);
  if (!m || !app) { send(res, 404, { error: { code: 'other', message: 'No such notes app' } }); return; }
  const { c } = app;
  if (!app.on) { send(res, 503, { error: { code: 'unavailable', message: `Add ${c.env.join(' and ')} to Cueboard’s settings to bring in ${c.name} notes.` } }); return; }
  const ctx = connectorContext(c, process.env);
  try {
    if (!m[2]) {
      const after = query.get('after') ?? '';
      const cursor = (query.get('cursor') ?? '').slice(0, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(after)) { send(res, 400, { error: { code: 'other', message: 'after must be a date' } }); return; }
      const page = cleanList(c, await c.list(ctx, { after, ...(cursor ? { cursor } : {}) }));
      console.log(`${c.id} · listed ${page.notes.length} notes`);
      send(res, 200, page); return;
    }
    let id = '';
    try { id = decodeURIComponent(m[2]); } catch { }
    if (!idMatches(c.noteId, id)) { send(res, 400, { error: { code: 'other', message: `That isn’t a ${c.name} note.` } }); return; }
    const notes = cleanNotes(c, await c.fetch(ctx, id));
    console.log(`${c.id} · fetched ${id}`);
    send(res, 200, notes);
  } catch (e) {
    if (e instanceof NotesProblem) {
      console.error(`${c.id} · the connector sent something Cueboard can’t use: ${e.message}`);
      send(res, 502, { error: { code: 'other', message: `${c.name} sent a note Cueboard couldn’t read.` } }); return;
    }
    const p = problemFor(c, e);
    console.log(`${c.id} · ${p.code}: ${p.message}`);
    send(res, p.status, { error: { code: p.code, message: p.message } });
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

// The zone the person reading is in, for calendar times that don't name one.
const zoneOf = (req: IncomingMessage) => {
  const z = new URL(req.url ?? '/', 'http://x').searchParams.get('tz') ?? '';
  try { return z && z.length < 64 ? (new Intl.DateTimeFormat('en-US', { timeZone: z }), z) : undefined; } catch { return undefined; }
};
async function calendarApi(req: IncomingMessage, res: ServerResponse, path: string) {
  if (!allowed(req)) { notAllowed(res); return; }
  const grant = grantOf(req);
  const via = grant?.ics ? 'link' : grant?.fake && fakeCalendar ? 'sample' : grant?.rt && calendarOn ? 'google' : null;
  if (path === '/api/calendar' && req.method === 'GET') {
    send(res, 200, { configured: calendarOn, link: true, connected: !!via, ...(via ? { via } : {}), ...(fakeCalendar ? { fake: true } : {}) }); return;
  }
  // Connecting by link: read it once to be sure it's a calendar, then keep it sealed in the cookie.
  if (path === '/api/calendar/link' && req.method === 'POST') {
    const body = json(await readBody(req, 8_000)) as { url?: unknown } | null;
    if (typeof body?.url !== 'string') { send(res, 400, { error: { code: 'bad_link', message: 'Paste your calendar’s link.' } }); return; }
    try {
      const now = Date.now();
      const cal = parseIcs(await fetchFeed(body.url), { from: new Date(now - 14 * 864e5).toISOString(), to: new Date(now + 14 * 864e5).toISOString() }, { zone: zoneOf(req) });
      console.log(`calendar link connected · ${cal.events.length} events`);
      if (grant?.rt) { await revoke(grant.rt); access.delete(grant.rt); }
      const url = body.url.trim().replace(/^webcals?:\/\//i, 'https://');
      send(res, 200, { ok: true, ...(cal.email ? { email: cal.email } : {}), events: cal.events.length }, { 'set-cookie': `${GCAL}=${seal.seal({ ics: url, at: now })}; ${cookieFlags(req, 365 * 86400)}` });
    } catch (e) {
      const err = e instanceof LinkError ? { code: e.code, message: e.message } : { code: 'bad_link', message: (e as Error).message || 'Couldn’t read that calendar.' };
      console.log(`calendar link failed · ${err.code}`);
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
      const cal = parseIcs(await fetchFeed(grant.ics), { from, to }, { zone: zoneOf(req) });
      console.log(`calendar link · ${cal.events.length} events${cal.complete ? '' : ' (more than are read)'}`);
      // Cut short, the list only speaks for the time it reaches; later meetings aren't "gone".
      const until = cal.complete || !cal.events.length ? to : cal.events.at(-1)!.start;
      send(res, 200, { ...(cal.email ? { email: cal.email } : {}), from, to: until, events: cal.events });
    } catch (e) {
      const gone = e instanceof LinkError && e.code === 'gone';
      console.log(`calendar link failed · ${e instanceof LinkError ? e.code : 'parse'}`);
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
      console.log(`calendar · ${r.events.length} events`);
      send(res, 200, { ...(r.email ? { email: r.email } : {}), from, to, events: r.events });
    } catch (e) {
      const reconnect = e instanceof GoogleError && e.code === 'reconnect';
      console.log(`calendar failed · ${(e as Error).message}`);
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
    const a = Buffer.from(state), b = Buffer.from(nonce);
    const same = a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
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

// The password, when there is one. Returns whether the request may go on; if not, it's answered.
const SESSION = 'cue_session';
const tries = new Limiter(10, 10 * 60_000), allTries = new Limiter(100, 10 * 60_000);
let warnedHttp = false;
async function door(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (path === '/api/signin') {
    if (req.method !== 'POST' || !allowed(req)) { notAllowed(res); return false; }
    // Per address, and for everyone together, so guessing from many addresses is slow too.
    if (!tries.allow(clientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'])) || !allTries.allow('*')) {
      send(res, 429, { error: { code: 'rate_limited', message: 'Too many tries. Wait ten minutes and try again.' } }); return false;
    }
    if (!passwordMatches(json(await readBody(req, 2_000))?.password, password)) {
      console.log('sign-in refused');
      send(res, 401, { error: { code: 'other', message: 'That isn’t the password.' } }); return false;
    }
    if (!https(req) && !/^(127\.|::1$|::ffff:127\.)/.test(req.socket.remoteAddress ?? '') && !warnedHttp) {
      warnedHttp = true;
      console.warn('signed in over plain http from another machine: put Cueboard behind HTTPS (README "Optional: run it on a server")');
    }
    console.log('signed in');
    send(res, 200, { ok: true }, { 'set-cookie': `${SESSION}=${sessionToken(sessionSecret, password)}; ${cookieFlags(req, SESSION_DAYS * 86400)}` });
    return false;
  }
  if (sessionValid(cookie(req.headers.cookie, SESSION), sessionSecret, password)) return true;
  if (path.startsWith('/api/')) send(res, 401, { error: { code: 'unavailable', message: 'You’re signed out of Cueboard. Reload the page to sign in again.' } });
  else if (path === '/') page(res, 200, signInPage());
  else res.writeHead(302, { location: '/', 'cache-control': 'no-store' }).end();
  return false;
}

async function route(req: IncomingMessage, res: ServerResponse) {
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://localhost'); } catch { res.writeHead(400).end(); return; }
  const path = url.pathname;
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('content-security-policy', "frame-ancestors 'self'");
  if (locked) { res.setHeader('x-robots-tag', 'noindex'); if (https(req)) res.setHeader('strict-transport-security', 'max-age=31536000'); }
  if (path === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }
  // Without a password, only this machine's own names. Reached by any other (a proxy, a rebinding
  // page), it says what to do instead of half-working.
  if (!hostOk(req)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end(`This Cueboard only answers at http://localhost:${port}. To open it from anywhere else, set CUE_PASSWORD (README, "Optional: run it on a server").`);
    return;
  }
  if (locked && !await door(req, res, path)) return;
  if (path === '/api/session') {
    if (!allowed(req)) { notAllowed(res); return; }
    if (req.method === 'GET') { send(res, 200, { locked }); return; }
    if (req.method === 'DELETE' && locked) { send(res, 200, { ok: true }, { 'set-cookie': `${SESSION}=; ${cookieFlags(req, 0)}` }); return; }
    send(res, 405, { error: { code: 'other', message: 'Use GET' } }); return;
  }
  if (path === '/api/llm') { await api(req, res); return; }
  if (path === '/api/chat') { await chatApi(req, res); return; }
  if (path === '/api/notes' || path.startsWith('/api/notes/')) { await notesApi(req, res, path, url.searchParams); return; }
  if (path === '/api/calendar' || path.startsWith('/api/calendar/')) { await calendarApi(req, res, path); return; }
  if (path === '/api/demo') {
    if (!demo) { send(res, 404, { error: { code: 'other', message: 'Start Cueboard with --demo for the demo week' } }); return; }
    if (!allowed(req) || req.method !== 'GET') { notAllowed(res); return; }
    const now = new Date(), w = demo.demoWorld(now);
    send(res, 200, { memory: demo.demoMemory(now), samples: w.samples, calendar: Object.fromEntries(w.events.map(e => [e.id, e.title])) });
    return;
  }
  if (path.startsWith('/oauth/google/')) { await oauth(req, res, path, url.searchParams); return; }
  // The app is one page. Nothing else on disk is served, whatever the path says.
  if (path !== '/' && path !== '/cueboard.html') { res.writeHead(404).end('not found'); return; }
  try {
    const body = await readFile(new URL('cueboard.html', dist));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

// Anything that throws while answering is a 500 for that request, never the end of the server.
process.on('unhandledRejection', e => console.error('unhandled', (e as Error)?.message ?? e));
createServer(async (req, res) => {
  try { await route(req, res); }
  catch (e) {
    console.error(`error · ${(e as Error)?.message ?? e}`);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end();
  }
}).listen(port, host, () => {
  const where = locked ? `serving on ${host}:${port}, behind its password` : `serving http://localhost:${port}`;
  console.log(`${where}${demo ? ' · the demo week' : ''} · model: ${llm ? llm.name : 'none (rules only; run `ant auth login` or set ANTHROPIC_API_KEY for Claude)'} · notes: ${notesApps.filter(a => a.on).map(a => a.c.name + (a.fake ? ' (sample notes)' : '')).join(', ') || 'none connected'} · calendar: ${fakeCalendar ? 'sample week' : calendarOn ? 'links and Google' : 'links (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Google sign-in)'}`);
});
