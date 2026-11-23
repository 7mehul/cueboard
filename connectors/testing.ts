import assert from 'node:assert/strict';
import { notesToDoc } from '../src/memory/notes.ts';
import type { Self } from '../src/memory/notes.ts';
import type { Doc } from '../src/memory/types.ts';
import { NotesProblem, SourceError, cleanList, cleanNotes, connectorContext, idMatches } from './kit.ts';
import type { MeetingNotes, NoteListItem, NotesConnector } from './kit.ts';

// Testing a connector without its app: a fake of the app's API, and one call that runs the
// connector against it and checks everything Cueboard relies on. See CONNECTORS.md.

export interface FakeRequest { method: string; url: URL; headers: Headers; body: any; params: Record<string, string> }
// A route's answer: a JSON body, a Response (for a status or headers), or a function of the request
// that returns either.
export type Route = ((req: FakeRequest) => unknown) | Response | Record<string, unknown> | unknown[];

// Routes are keyed 'GET /v1/notes' or 'POST /graphql', by path; ':name' matches one part of the
// path and lands in `params`. A request with no route gets a 404 and is listed in `unmatched`.
export function fakeApi(routes: Record<string, Route>) {
  const calls: FakeRequest[] = [], unmatched: string[] = [];
  const table = Object.entries(routes).map(([k, answer]) => {
    const [method, path] = k.split(' ');
    return { method, parts: path.split('/'), answer };
  });
  const fetchFake = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? (() => { try { return JSON.parse(init.body as string); } catch { return init.body; } })() : init.body;
    const parts = url.pathname.split('/');
    for (const r of table) {
      if (r.method !== method || r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      if (!r.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(parts[i])), true) : p === parts[i]))) continue;
      const req = { method, url, headers, body, params };
      calls.push(req);
      const out = typeof r.answer === 'function' ? await (r.answer as (q: FakeRequest) => unknown)(req) : r.answer;
      return out instanceof Response ? out : Response.json(out);
    }
    unmatched.push(`${method} ${url.pathname}${url.search}`);
    return new Response('{"error":"no such route in the fake API"}', { status: 404 });
  }) as typeof fetch;
  return { fetch: fetchFake, calls, unmatched };
}

export const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => Response.json(body, { status, headers });

// The connector's own description: its id, settings, hosts and setup steps.
export function checkShape(c: NotesConnector) {
  assert.match(c.id, /^[a-z][a-z0-9-]{1,30}$/, 'id: lowercase letters, digits and dashes');
  assert.ok(c.name.trim(), 'name: the app as people know it');
  assert.ok(c.env.length, 'env: the settings it needs, at least one');
  for (const k of c.env) assert.match(k, /^[A-Z][A-Z0-9_]{2,}$/, `env: ${k} should look like ${c.id.toUpperCase().replace(/-/g, '_')}_API_KEY`);
  assert.ok(c.hosts.length, 'hosts: the hosts it calls');
  for (const h of c.hosts) assert.match(h, /^[a-z0-9.-]+\.[a-z]{2,}$/, `hosts: ${h} should be a bare host name, like api.example.com`);
  assert.ok(c.setup.length && c.setup.every(s => s.trim()), 'setup: how to get the key, at least one step');
  assert.ok(c.noteId instanceof RegExp && c.noteId.source.startsWith('^') && c.noteId.source.endsWith('$'), 'noteId: a pattern anchored with ^ and $, so it matches whole ids only');
}

// Runs the connector against a fake API: lists every page, fetches every note listed, and checks
// what comes back the way the server does, failing on anything it would have to drop or fix. Then
// checks that errors from the API reach the page instead of being swallowed. Gives back what it
// got, for your own checks of what your connector made of the API's answers. `self` stands in for
// the person's About you, as the page passes it when reading a note.
export async function checkConnector(c: NotesConnector, opts: { env: Record<string, string>; api: ReturnType<typeof fakeApi>; after?: string; self?: Self }) {
  checkShape(c);
  for (const k of c.env) assert.ok(opts.env[k], `give the test a value for ${k}`);
  const ctx = connectorContext(c, opts.env, { fetch: opts.api.fetch, wait: async () => { } });
  const after = opts.after ?? '2000-01-01';
  // A problem found while checking what a call gave back says which call it was.
  const named = async <T>(call: string, run: () => Promise<T>): Promise<T> => {
    try { return await run(); } catch (e) { if (e instanceof NotesProblem) e.message = `${call}: ${e.message}`; throw e; }
  };

  const listed: NoteListItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const problems: string[] = [];
    const call = `list(${cursor ? `cursor ${cursor}` : 'first page'})`;
    const p = await named(call, async () => cleanList(c, await c.list(ctx, { after, ...(cursor ? { cursor } : {}) }), problems));
    assert.deepEqual(problems, [], `${call}: what Cueboard would have to fix or drop`);
    listed.push(...p.notes);
    if (!p.cursor) break;
    assert.notEqual(p.cursor, cursor, 'list(): the next cursor should differ from the last');
    cursor = p.cursor;
  }
  assert.deepEqual(opts.api.unmatched, [], 'calls the fake API has no route for');
  assert.ok(listed.length, 'list() found no notes: give the fake API at least one');
  assert.equal(new Set(listed.map(n => n.id)).size, listed.length, 'list(): each note once');

  const notes: MeetingNotes[] = [], docs: Doc[] = [];
  for (const item of listed) {
    const problems: string[] = [];
    const n = await named(`fetch(${item.id})`, async () => cleanNotes(c, await c.fetch(ctx, item.id), problems));
    assert.deepEqual(problems, [], `fetch(${item.id}): what Cueboard would have to fix or drop`);
    assert.equal(n.id, item.id, `fetch(${item.id}) gave back a different note`);
    const doc = notesToDoc(c, n, { self: opts.self });
    const withLine = (/^With: .*$/m.exec(doc.text)?.[0] ?? '').toLowerCase();
    for (const me of [n.me?.email, opts.self?.email]) if (me) assert.ok(!withLine.includes(me.toLowerCase()), `fetch(${item.id}): you are listed among the people you met`);
    notes.push(n); docs.push(doc);
  }
  assert.deepEqual(opts.api.unmatched, [], 'calls the fake API has no route for');

  // The key goes in a header, never in the address, where proxies and logs would keep it.
  const keys = c.env.map(k => opts.env[k]).filter(v => v.length >= 4);
  const where = (q: FakeRequest) => `${q.method} ${q.url.pathname}`;
  for (const q of opts.api.calls) {
    assert.ok(keys.every(k => !q.url.href.includes(k)), `${where(q)}: a key was sent in the URL; send it in a header`);
    assert.ok(keys.some(k => [...q.headers.values()].some(v => v.includes(k))), `${where(q)}: this call went without the key`);
  }

  // An API that refuses the key: the page should hear it, not get an empty list.
  const refused = connectorContext(c, opts.env, { fetch: (async () => reply(401, { error: 'bad key' })) as typeof fetch, wait: async () => { } });
  const isRefusal = (e: unknown) => e instanceof SourceError && e.status === 401;
  await assert.rejects(c.list(refused, { after }), isRefusal, 'list(): a refused key should end up as a SourceError (let ctx.http’s errors through)');
  await assert.rejects(c.fetch(refused, listed[0].id), isRefusal, 'fetch(): a refused key should end up as a SourceError');

  assert.ok(listed.every(n => idMatches(c.noteId, n.id)));
  return { listed, notes, docs };
}
