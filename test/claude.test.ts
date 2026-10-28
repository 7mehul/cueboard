import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod/v4';
import { claude, parseJson } from '../src/intel/providers/claude.ts';

// The adapter against a stand-in API, so its recovery paths are tested without credentials.

const Answer = z.object({ ok: z.boolean(), n: z.number() });
const req = { step: 'extract', system: 'sys', prompt: 'go', schema: Answer };
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const bad = (message: string) => new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message } }, message, new Headers());

function fakeClient(o: { parse?: (p: Record<string, unknown>) => unknown; create?: (p: Record<string, unknown>) => unknown }) {
  const calls: { kind: string; fallbacks: boolean; content: string }[] = [];
  const log = (kind: string, p: Record<string, unknown>) =>
    calls.push({ kind, fallbacks: 'fallbacks' in p, content: String((p.messages as { content: string }[])[0].content) });
  const client = {
    beta: { messages: {
      parse: async (p: Record<string, unknown>) => { log('parse', p); return o.parse!(p); },
      create: async (p: Record<string, unknown>) => { log('create', p); return o.create!(p); },
    } },
  } as unknown as Anthropic;
  return { client, calls };
}

test('a schema the API won’t compile is asked for as plain JSON, validated, and remembered', async () => {
  const { client, calls } = fakeClient({
    parse: () => { throw bad('The compiled grammar is too large, which would cause performance issues.'); },
    create: () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n{"ok": true, "n": 3}\n```' }], usage }),
  });
  const llm = claude({ client });
  assert.deepEqual((await llm.json(req)).value, { ok: true, n: 3 });
  assert.match(calls[1].content, /JSON Schema/, 'the schema goes in the prompt');
  assert.ok(calls[1].fallbacks, 'refusal fallback stays on: the grammar was the problem');
  await llm.json(req);
  assert.deepEqual(calls.map(c => c.kind), ['parse', 'create', 'create'], 'the second call skips straight to plain JSON');
});

test('a plain answer that doesn’t fit the schema is still rejected', async () => {
  const { client } = fakeClient({
    parse: () => { throw bad('The compiled grammar is too large'); },
    create: () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok": "yes"}' }], usage }),
  });
  await assert.rejects(claude({ client }).json(req), /schema/);
  assert.throws(() => parseJson('no json here'), /no JSON/);
});

test('refusal fallback is dropped only when a retry without it works', async () => {
  let n = 0;
  const unrelated = fakeClient({ parse: () => { n++; throw bad('messages: text content blocks must be non-empty'); } });
  const llm = claude({ client: unrelated.client });
  await assert.rejects(llm.json(req));
  await assert.rejects(llm.json(req));
  assert.deepEqual(unrelated.calls.map(c => c.fallbacks), [true, false, true, false], 'still tried with fallback the second time');

  const noBeta = fakeClient({ parse: p => { if ('fallbacks' in p) throw bad('fallbacks: not available for this account'); return { stop_reason: 'end_turn', parsed_output: { ok: true, n: 1 }, usage }; } });
  const llm2 = claude({ client: noBeta.client });
  await llm2.json(req); await llm2.json(req);
  assert.deepEqual(noBeta.calls.map(c => c.fallbacks), [true, false, false]);
});

test('a refusal or a cut-off answer is an error, not an answer', async () => {
  const refused = fakeClient({ parse: () => ({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, parsed_output: null, usage }) });
  await assert.rejects(claude({ client: refused.client }).json(req), /Declined/);
  const cut = fakeClient({ parse: () => ({ stop_reason: 'max_tokens', parsed_output: null, usage }) });
  await assert.rejects(claude({ client: cut.client }).json(req), /cut off/);
});
