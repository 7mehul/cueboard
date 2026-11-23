import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { NOTES_APPS } from '../../connectors/index.ts';
import example from '../../connectors/example.ts';
import { SourceError, cleanList, cleanNotes, connectorContext, problemFor, sampleConnector } from '../../connectors/kit.ts';
import type { MeetingNotes } from '../../connectors/kit.ts';
import { checkConnector, checkShape, fakeApi, reply } from '../../connectors/testing.ts';

test('every notes app listed has a test of its own and a unique id', () => {
  assert.equal(new Set(NOTES_APPS.map(c => c.id)).size, NOTES_APPS.length);
  for (const c of NOTES_APPS) {
    checkShape(c);
    assert.ok(existsSync(new URL(`./${c.id}.test.ts`, import.meta.url)), `test/connectors/${c.id}.test.ts`);
  }
  assert.ok(!NOTES_APPS.includes(example), 'the example is never offered');
});

const ctxWith = (routes: Parameters<typeof fakeApi>[0], waits: number[] = []) => {
  const api = fakeApi(routes);
  return { api, ctx: connectorContext(example, { EXAMPLE_NOTES_API_KEY: 'k-1234', ANTHROPIC_API_KEY: 'not-yours' }, { fetch: api.fetch, wait: async ms => { waits.push(ms); } }) };
};

test('a connector sees only its own settings and reaches only its own hosts, over https', async () => {
  const { ctx, api } = ctxWith({ 'GET /v1/x': { ok: true } });
  assert.deepEqual(Object.keys(ctx.env), ['EXAMPLE_NOTES_API_KEY']);
  assert.deepEqual(await ctx.http('https://api.notes.example/v1/x'), { ok: true });
  await assert.rejects(ctx.http('https://evil.example/v1/x'), /tried to reach evil\.example, which isn’t one of its hosts/);
  await assert.rejects(ctx.http('http://api.notes.example/v1/x'), /isn’t one of its hosts/);
  assert.equal(api.calls.length, 1, 'nothing sent anywhere else');
});

test('slow down is waited out; other failures and non-JSON are errors the page can show', async () => {
  const waits: number[] = [];
  let n = 0;
  const { ctx } = ctxWith({
    'GET /v1/busy': () => (++n < 3 ? reply(429, {}, { 'retry-after': '2' }) : { done: n }),
    'GET /v1/always-busy': () => reply(429),
    'GET /v1/gone': () => reply(410),
    'GET /v1/html': () => new Response('<html>', { status: 200 }),
    'POST /v1/graphql': ({ body, headers }) => ({ query: body.query, type: headers.get('content-type') }),
  }, waits);
  assert.deepEqual(await ctx.http('https://api.notes.example/v1/busy'), { done: 3 });
  assert.deepEqual(waits, [2000, 2000], 'as long as the API asked');
  await assert.rejects(ctx.http('https://api.notes.example/v1/always-busy'), (e: unknown) => e instanceof SourceError && e.status === 429);
  await assert.rejects(ctx.http('https://api.notes.example/v1/gone'), (e: unknown) => e instanceof SourceError && e.status === 410);
  await assert.rejects(ctx.http('https://api.notes.example/v1/html'), /isn’t JSON/);
  assert.deepEqual(await ctx.http('https://api.notes.example/v1/graphql', { method: 'POST', body: { query: '{ notes }' } }), { query: '{ notes }', type: 'application/json' }, 'APIs that read through POST, like GraphQL');
});

test('errors read plainly, naming the setting to check', () => {
  assert.match(problemFor(example, new SourceError(401)).message, /Example Notes didn’t accept the key\. Check EXAMPLE_NOTES_API_KEY/);
  assert.equal(problemFor(example, new SourceError(429)).code, 'rate_limited');
  assert.equal(problemFor(example, new SourceError(404, 'Not finished yet.')).message, 'Not finished yet.', 'the connector’s own words win');
  assert.match(problemFor(example, Object.assign(new Error('x'), { name: 'TimeoutError' })).message, /took too long/);
  assert.match(problemFor(example, new TypeError('fetch failed')).message, /^Couldn’t reach Example Notes: fetch failed$/);
});

const good: MeetingNotes = {
  id: 'mtg_a1b2c3d4', title: ' Call ', start: '2026-10-08T14:00:00Z', end: '2026-10-08T14:30:00Z', url: 'https://app.notes.example/m/1',
  me: { email: 'Alex@Cueboard.example' }, people: [{ name: 'Maya Chen', email: 'maya@larkspur.example' }], summary: 'Churn.',
  transcript: [{ text: ' Hi ', me: true }, { text: '' }],
};

test('what a connector sends back is checked: usable parts kept, the rest dropped and reported', () => {
  const problems: string[] = [];
  assert.deepEqual(cleanNotes(example, good, problems), { ...good, title: 'Call', me: { email: 'alex@cueboard.example' }, transcript: [{ text: 'Hi', me: true }] });
  assert.deepEqual(problems, []);
  const bad = cleanNotes(example, { ...good, url: 'javascript:alert(1)', end: '2026-10-08T13:00:00Z', people: [{ email: 'not an email' }, { name: 'Ben' }], me: { email: 'nope' } } as MeetingNotes, problems);
  assert.equal(bad.url, undefined);
  assert.equal(bad.end, undefined);
  assert.equal(bad.me, undefined);
  assert.deepEqual(bad.people, [{ name: 'Ben' }]);
  assert.equal(problems.length, 5, problems.join('; '));
  assert.throws(() => cleanNotes(example, { ...good, id: '../../etc' }), /doesn’t match noteId/);
  assert.throws(() => cleanNotes(example, { ...good, start: 'last Tuesday' }), /start should be an ISO date/);
  const list = cleanList(example, { notes: [{ id: 'mtg_a1b2c3d4', title: 'A', at: good.start }, { id: 'x', title: 'B', at: good.start }], cursor: '' }, problems);
  assert.deepEqual(list, { notes: [{ id: 'mtg_a1b2c3d4', title: 'A', at: good.start }], cursor: null });
});

test('sample notes stand in for an app in the demo week', async () => {
  const s = sampleConnector(example, () => [good, { ...good, id: 'mtg_00000old', start: '2025-01-01T09:00:00Z' }]);
  const ctx = connectorContext(s, {});
  assert.deepEqual((await s.list(ctx, { after: '2026-01-01' })).notes.map(n => n.id), ['mtg_a1b2c3d4']);
  assert.equal((await s.fetch(ctx, 'mtg_a1b2c3d4')).title, ' Call ');
  await assert.rejects(s.fetch(ctx, 'mtg_zzzzzzzz'), (e: unknown) => e instanceof SourceError && e.status === 404);
});

test('checkConnector catches the usual mistakes', async () => {
  const meetings = [{ id: 'mtg_a1b2c3d4', name: 'Call', started_at: '2026-10-08T14:00:00Z', owner: { email: 'alex@cueboard.example' }, participants: [], ai_summary: 'Churn.' }];
  const api = () => fakeApi({ 'GET /v1/meetings': { meetings, next_page_token: null }, 'GET /v1/meetings/:id': meetings[0] });
  const env = { EXAMPLE_NOTES_API_KEY: 'k-1234' };
  const fails = (c: typeof example, why: RegExp) => assert.rejects(checkConnector(c, { env, api: api() }), why);
  await fails({ ...example, list: async (ctx, o) => { try { return await example.list(ctx, o); } catch { return { notes: [] }; } } }, /refused key should end up as a SourceError/);
  await fails({ ...example, list: async ctx => { await ctx.http(`https://api.notes.example/v1/meetings?api_key=${ctx.env.EXAMPLE_NOTES_API_KEY}`); return { notes: [{ id: 'mtg_a1b2c3d4', title: 'Call', at: meetings[0].started_at }] }; } }, /sent in the URL/);
  await fails({ ...example, list: async () => ({ notes: [{ id: 'mtg_a1b2c3d4', title: 'Call', at: 'Oct 8' }] }) }, /what Cueboard would have to fix or drop/);
  await fails({ ...example, fetch: async (ctx, id) => ({ ...(await example.fetch(ctx, id)), people: [{ email: 'Maya' }] }) }, /what Cueboard would have to fix or drop/);
  await fails({ ...example, noteId: /mtg_[a-z0-9]{8}/ }, /anchored with \^ and \$/);
  await fails({ ...example, hosts: ['https://api.notes.example'] }, /bare host name/);
});
