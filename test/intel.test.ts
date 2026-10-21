import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardSmart } from '../src/intel/smart.ts';
import { scripted } from '../src/intel/providers/scripted.ts';
import type { Script } from '../src/intel/providers/scripted.ts';
import { checkBoard } from '../src/check.ts';
import { buildBoard } from '../src/engine.ts';
import { scenarios } from '../scenarios/scenarios.ts';
import { judge, onBoard } from '../scenarios/judge.ts';
import { danaFollowup } from './fixtures.ts';

// Two kinds of test. First: given the judgment a good model should reach, the engine can express
// the right board for every persona (if it can't, the engine is missing a capability, not the
// model). Second: the guard rails hold whatever the model says.

type Rank = Record<string, number>;
const brief = (b: { type: string; goal: string; numbers: string; decides?: string; opener?: string; ask?: string }) => ({
  persona: 'other', meetingType: b.type, process: 'p', step: 's', purpose: 'p',
  goal: { text: b.goal, basis: 'inferred', alternatives: [] }, theyWant: [], decides: [b.decides ?? 'What they need to hear'],
  opener: b.opener ?? '', ask: b.ask ?? '', risks: [],
  numbers: b.numbers, needs: [], unknowns: [],
});
const ranking = (scores: Rank, questions: string[] = []) => ({
  items: Object.entries(scores).map(([id, score]) => ({ id, score, why: 'because' })),
  questions: questions.map(text => ({ text, why: 'unknown' })),
});
const model = (b: object, r: object): Script => ({ understand: () => b, rank: () => r });

const IDEAL: Record<string, Script> = {
  'founder-investor-first': model(
    brief({ type: 'investor', goal: 'Get to Monday’s partner meeting', numbers: 'ours', decides: 'Showing retention cohorts convincingly' }),
    ranking({ 'p:p-dana': 3, 'f-int': 3, 'f-conn': 2, 'f-role': 2, 'f-bg1': 2, 'f-bg2': 1, 'f-noise-marathon': 0, 'm:nrr': 3, 'm:mrr': 3, 'm:customers': 1, 'o:o-feature': 2, 'o:o-size': 1, 'gap:fund': 2, 'gap:portfolio': 1, 'gap:decision': 2, 'q:q-who': 2, 'q:q-inc': 1 },
      ['What would you need to see in our cohorts before Monday?'])),
  'founder-investor-followup': model(
    brief({ type: 'investor', goal: 'Get a November date with the full partnership', numbers: 'ours' }),
    ranking({ 'f-churn': 3, 'f-quote': 3, 'f-pricing': 2, 'f-avoid': 2, 'f-noise-miami': 0, 'm:churn': 3, 'm:mrr': 3, 'm:customers': 2, 'o:o-churn': 3, 'o:o-feature': 1 })),
  'discovery-first-interview': model(
    brief({ type: 'customer', goal: 'Learn how duplicate tickets hit Grace’s 40 agents', numbers: 'theirs' }),
    ranking({ 'p:p-grace': 3, 'f-grace-int': 3, 'f-grace-role': 2, 'f-grace-bg': 1, 'f-ridge-co': 2, 'f-ridge-tools': 3, 'f-ridge-delivery': 2, 'f-noise-sponsor': 0, 'f-proof': 0,
      'm:tickets': 3, 'm:agents': 2, 'm:customers': 0, 'o:o-tool': 2, 'q:q-last': 3, 'q:q-measure': 3, 'gap:pain': 1, 'gap:tools': 0, 'gap:decision': 2 },
      ['How often does the same customer open duplicate tickets?'])),
  'investor-founder-first': model(
    brief({ type: 'investor', goal: 'Decide whether Parcelwise goes to the partner meeting', numbers: 'theirs' }),
    ranking({ 'p:p-lena': 3, 'p:p-omar': 2, 'f-conflict': 3, 'f-thesis': 0, 'f-pw-round': 3, 'f-pw-pilots': 3, 'f-pw-what': 2, 'f-lena-bg': 3, 'f-omar-bg': 2, 'f-lena-role': 2, 'f-omar-role': 2,
      'm:pw-mrr': 3, 'm:pw-couriers': 2, 'gap:fund': 0, 'gap:portfolio': 0, 'gap:decision': 0, 'q:q-who': 0 },
      ['What do the three unpaid design partners need before they pay?', 'How do you win against incumbent routing tools?'])),
  'partnerships-first-meeting': model(
    brief({ type: 'partnership', goal: 'Agree a first joint DACH opportunity and its owner', numbers: 'both' }),
    ranking({ 'p:p-ines': 3, 'p:p-felix': 3, 'f-ines-decision': 3, 'f-calder-overlap': 3, 'f-calder-resells': 3, 'f-calder-program': 2, 'f-calder-paris': 2, 'f-noise-summit': 0,
      'f-ines-role': 2, 'f-ines-bg': 1, 'f-felix-role': 2, 'f-felix-int': 3, 'm:emea': 2, 'm:pipeline': 1, 'o:o-whats-in': 3, 'gap:decision': 0, 'gap:portfolio': 1 },
      ['Which DACH customers ask most about duplicate tickets?'])),
  'ae-demo-new-stakeholders': model(
    brief({ type: 'customer', goal: 'Clear security and pricing so Ravi and Tomás back a pilot', numbers: 'theirs' }),
    ranking({ 'p:p-ravi': 3, 'p:p-tomas': 3, 'p:p-hannah': 2, 'f-ravi-int': 3, 'f-tomas-int': 3, 'f-hannah-int': 2, 'f-hannah-role': 2, 'f-ravi-role': 2, 'f-tomas-role': 2,
      'f-bright-co': 1, 'm:b-tickets': 2, 'm:b-agents': 2, 'o:o-builtin': 3, 'gap:decision': 2 },
      ['What would Tomás need to sign off on SSO and EU data?'])),
};

for (const s of scenarios()) {
  test(`with good judgment, the board is right for: ${s.persona}, ${s.situation}`, async () => {
    const r = await buildBoardSmart(s.packet, scripted(IDEAL[s.id]));
    assert.equal(r.mode, 'model', `fell back: ${r.issues.map(i => i.code).join(', ')} ${r.steps.map(x => x.error ?? '').join(' ')}`);
    assert.deepEqual(checkBoard(r.board, s.packet), []);
    assert.deepEqual(judge(r.board, s.packet, s.expect), []);
  });
}

test('the rules engine alone misses these scenarios (why the model is there)', () => {
  const failing = scenarios().filter(s => judge(buildBoard(s.packet), s.packet, s.expect).length);
  assert.ok(failing.length >= 5, `only ${failing.length} fail without a model`);
});

// ---------- guard rails ----------

const s0 = () => scenarios()[0];

test('an answer that doesn’t fit the schema falls back to the rules', async () => {
  const r = await buildBoardSmart(s0().packet, scripted({ understand: () => ({ nonsense: true }) }));
  assert.equal(r.mode, 'rules');
  assert.ok(r.steps.some(x => !x.ok && /schema/.test(x.error ?? '')));
  assert.deepEqual(checkBoard(r.board, s0().packet), []);
});

test('a failed ranking still uses the brief; made-up ids are ignored', async () => {
  const s = s0();
  const r1 = await buildBoardSmart(s.packet, scripted({ understand: IDEAL[s.id].understand, rank: () => { throw new Error('timeout'); } }));
  assert.equal(r1.mode, 'model');
  assert.match(r1.board.blocks.find(b => b.kind === 'keynotes')!.lines.find(l => l.label === 'Goal')!.text, /partner/);
  const r2 = await buildBoardSmart(s.packet, scripted({ understand: IDEAL[s.id].understand, rank: () => ranking({ 'f-made-up': 3, 'm:invented': 3 }) }));
  assert.equal(r2.ranking!.items.length, 0);
  assert.deepEqual(checkBoard(r2.board, s.packet), []);
});

test('the model never sees another user’s private notes or facts about unconfirmed people', async () => {
  const s = s0();
  s.packet.sources.push({ id: 's-theirs', kind: 'notes', ref: 'x', seenAt: '2026-09-01', ownerId: 'u-other' });
  s.packet.facts.push(
    { id: 'f-secret', subject: { kind: 'person', id: 'p-dana' }, topic: 'interest', text: 'SECRET-from-another-user', sourceIds: ['s-theirs'], confidence: 1 },
    { id: 'f-secret2', subject: { kind: 'person', id: 'p-dana' }, topic: 'interest', text: 'SECRET-not-yours', sourceIds: ['s-team'], confidence: 1, visibleTo: 'u-other' },
  );
  s.packet.context!.push({ id: 'd-x', kind: 'notes', text: 'SECRET-doc', sourceId: 's-theirs' });
  const llm = scripted(IDEAL[s.id]);
  await buildBoardSmart(s.packet, llm);
  for (const c of llm.calls) assert.ok(!/SECRET/.test(c.prompt), `${c.step} prompt leaked private data`);
});

test('the user’s stated goal beats the model’s', async () => {
  const p = danaFollowup();
  const r = await buildBoardSmart(p, scripted({ understand: () => brief({ type: 'investor', goal: 'Something else entirely', numbers: 'ours' }), rank: () => ranking({}) }));
  const goal = r.board.blocks.find(b => b.kind === 'keynotes')!.lines.find(l => l.label === 'Goal')!;
  assert.equal(goal.text, 'A date for the full-partner meeting');
  assert.ok(!goal.suggested);
});

test('a suggested goal is marked as a suggestion, not a fact', async () => {
  const s = s0();
  const r = await buildBoardSmart(s.packet, scripted(IDEAL[s.id]));
  const goal = r.board.blocks.find(b => b.kind === 'keynotes')!.lines.find(l => l.label === 'Goal')!;
  assert.ok(goal.suggested && !goal.claim && goal.sourceIds.length === 0);
});

test('the model’s opener and ask fill the run of show as suggestions; the user’s own playbook wins', async () => {
  const keyLine = (r: Awaited<ReturnType<typeof buildBoardSmart>>, label: string) => r.board.blocks.find(b => b.kind === 'keynotes')!.lines.find(l => l.label === label)!;
  const draft = { opener: 'Ask how Calder’s DACH customers handle duplicate tickets', ask: 'A call with Felix’s team about one DACH customer' };

  const p = scenarios().find(s => s.id === 'partnerships-first-meeting')!;
  const r = await buildBoardSmart(p.packet, scripted({ understand: () => brief({ type: 'partnership', goal: 'Agree a first joint opportunity', numbers: 'both', ...draft }), rank: () => ranking({}) }));
  assert.equal(r.mode, 'model');
  for (const label of ['Open with', 'Ask']) {
    const l = keyLine(r, label);
    assert.ok(l.suggested && !l.gap && !l.claim && l.sourceIds.length === 0, `${label} should be a suggestion`);
  }

  const f = s0(); // this founder keeps their own opener and ask in their profile
  const r2 = await buildBoardSmart(f.packet, scripted({ understand: () => brief({ type: 'investor', goal: 'x', numbers: 'ours', ...draft }), rank: () => ranking({}) }));
  assert.equal(keyLine(r2, 'Open with').text, 'The customer story, not the market');
  assert.ok(!keyLine(r2, 'Ask').suggested);
});

test('a drafted line that runs long keeps its first whole clause instead of a mid-sentence cut', async () => {
  const s = scenarios().find(x => x.id === 'ae-demo-new-stakeholders')!;
  const r = await buildBoardSmart(s.packet, scripted({
    understand: () => brief({ type: 'customer', goal: 'Answer Ravi’s 120-seat price and Tomás’s SSO/EU residency; agree proposal next step', numbers: 'theirs',
      ask: 'Agree a proposal review date with Ravi, Tomás and Hannah, and a pilot start in November.' }),
    rank: () => ranking({}),
  }));
  const key = r.board.blocks.find(b => b.kind === 'keynotes')!;
  assert.equal(key.lines.find(l => l.label === 'Goal')!.text, 'Answer Ravi’s 120-seat price and Tomás’s SSO/EU residency');
  assert.equal(key.lines.find(l => l.label === 'Ask')!.text, 'Agree a proposal review date with Ravi, Tomás and Hannah');
  assert.deepEqual(checkBoard(r.board, s.packet), []);
});

test('must-show items survive even if the model scores them 0', async () => {
  const p = danaFollowup();
  p.metrics.find(m => m.id === 'mrr')!.points.at(-1)!.value = 37000; // MRR fell since it was shared
  const r = await buildBoardSmart(p, scripted({
    understand: () => brief({ type: 'investor', goal: 'x', numbers: 'ours' }),
    rank: () => ranking({ 'o:o-churn': 0, 'm:churn': 3 }),
  }));
  assert.equal(r.mode, 'model');
  assert.ok(onBoard(r.board, 'o:o-churn'), 'an objection they raised stays');
  assert.ok(r.board.blocks.some(b => b.id === 'note:worse:mrr'), 'bad news stays');
  assert.ok(r.board.blocks.some(b => b.lines.some(l => l.tone === 'overdue')), 'overdue promise stays');
});

test('history decides first meeting vs follow-up, not the model', async () => {
  const s = s0();
  const r = await buildBoardSmart(s.packet, scripted(IDEAL[s.id]));
  assert.equal(r.board.stage, 'first');
});

test('no model at all: the rules board, unchanged', async () => {
  const s = s0();
  const r = await buildBoardSmart(s.packet, null);
  assert.equal(r.mode, 'rules');
  assert.deepEqual(r.board, buildBoard(s.packet));
});
