import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commit, inDocument, numbersIn, propose, readDoc, readPrompt } from '../src/memory/extract.ts';
import type { Proposal } from '../src/memory/extract.ts';
import { packetFor } from '../src/memory/packet.ts';
import { emptyMemory } from '../src/memory/types.ts';
import type { Memory } from '../src/memory/types.ts';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import { scripted } from '../src/intel/providers/scripted.ts';
import type { Extraction } from '../src/intel/schemas.ts';
import { STORY, STORY_USER, bindKnown } from '../scenarios/docs.ts';

const idsFrom = (m: Memory) => ({
  maya: m.people.find(p => p.name === 'Maya Chen')?.id,
  ben: m.people.find(p => p.name === 'Ben Okoro')?.id,
  larkspur: m.companies.find(c => c.name === 'Larkspur Ventures')?.id,
  cohort: m.commitments.find(c => /cohort/i.test(c.text))?.id,
  'intro-ben': m.commitments.find(c => /Ben/.test(c.text))?.id,
});
const all = (p: Proposal) => ({ people: p.people.map(x => x.ref), items: p.items.map(i => i.id) });

// Read the story's documents one by one, accepting everything, as a user clicking Save would.
function ingest(upTo = STORY.length, m: Memory = emptyMemory('u-alex', STORY_USER)) {
  const meetings: string[] = [];
  for (const s of STORY.slice(0, upTo)) {
    const p = propose(m, s.doc, bindKnown(s.ideal, idsFrom(m)));
    const r = commit(m, s.doc, p, all(p));
    m = r.memory;
    if (r.meetingId) meetings.push(r.meetingId);
  }
  return { m, meetings };
}

test('the ideal readings only keep what the documents say', () => {
  let m = emptyMemory('u-alex', STORY_USER);
  for (const s of STORY) {
    const p = propose(m, s.doc, bindKnown(s.ideal, idsFrom(m)));
    assert.deepEqual(p.dropped, [], `${s.doc.id} dropped ${JSON.stringify(p.dropped)}`);
    for (const i of p.items) assert.ok(inDocument(s.doc.text, i.quote), `${s.doc.id}: ${i.quote}`);
    m = commit(m, s.doc, p, all(p)).memory;
  }
});

test('a quote that isn’t in the document is thrown away, however plausible', () => {
  const s = STORY[2];
  const x: Extraction = structuredClone(bindKnown(s.ideal, {}));
  x.facts[0].quote = 'She has done three seed deals in workflow tools'; // a paraphrase
  x.promises.push({ by: 'them', personRef: 'p1', text: 'Lead the round', due: null, quote: 'She will lead the round' });
  const p = propose(emptyMemory('u', STORY_USER), s.doc, x);
  assert.ok(!p.items.some(i => /3 seed deals|Lead the round/.test(i.text)));
  assert.equal(p.dropped.filter(d => d.why === 'not_in_document').length, 2);
});

test('a number has to be written in its own quote: no arithmetic, no rounding, no guessing', () => {
  const s = STORY[2];
  const x: Extraction = structuredClone(bindKnown(s.ideal, {}));
  x.numbers[1].value = 33500; // the notes say $33k
  x.numbers.push({ owner: 'self', label: 'ARR', value: 396000, prefix: '$', suffix: '', asOf: null, better: 'up', sharedWith: [], quote: 'Told her MRR is $33k as of October 1.' });
  const p = propose(emptyMemory('u', STORY_USER), s.doc, x);
  const nums = p.items.filter(i => i.kind === 'number');
  assert.deepEqual(nums.map(i => i.text), ['Small-team churn 3.1%']);
  assert.equal(p.dropped.filter(d => d.why === 'number_not_in_quote').length, 2);
  assert.deepEqual([...new Set(numbersIn('MRR from $12k in May to $2.5M, 1,200 teams'))].sort((a, b) => a - b), [2.5, 12, 1200, 12000, 2500000]);
});

test('people: never the user, no made-up emails, unknown ids don’t link', () => {
  const s = STORY[1];
  const x: Extraction = structuredClone(bindKnown(s.ideal, {}));
  x.people.push({ ref: 'p9', knownId: null, name: 'Alex Rivera', email: 'alex@cueboard.app', companyRef: null });
  x.people[1].email = 'sam.patel@gmail.com'; // not in the email
  x.people[0].knownId = 'p-ghost';
  x.facts.push({ about: 'p9', topic: 'role', text: 'Founder of Cueboard', quote: 'Alex is building Cueboard' });
  const p = propose(emptyMemory('u', STORY_USER), s.doc, x);
  assert.ok(!p.people.some(q => q.name === 'Alex Rivera'));
  assert.equal(p.people.find(q => q.name === 'Sam Patel')?.email, undefined);
  assert.equal(p.people.find(q => q.name === 'Maya Chen')?.knownId, undefined);
  assert.ok(!p.items.some(i => i.text === 'Founder of Cueboard'));
});

test('reading the same document twice adds nothing', () => {
  const { m } = ingest(3);
  const s = STORY[2];
  const p = propose(m, s.doc, bindKnown(s.ideal, idsFrom(m)));
  assert.deepEqual(p.items, []);
  assert.ok(p.dropped.length > 5 && p.dropped.every(d => d.why === 'already_known'));
});

test('a person the user doesn’t confirm brings nothing with them', () => {
  const { m } = ingest(2);
  const s = STORY[2];
  const p = propose(m, s.doc, bindKnown(s.ideal, idsFrom(m)));
  const ben = p.people.find(q => q.name === 'Ben Okoro')!;
  assert.ok(!ben.knownId);
  const r = commit(m, s.doc, p, { people: [], items: p.items.map(i => i.id) });
  assert.ok(!r.memory.people.some(q => q.name === 'Ben Okoro'));
  assert.ok(!r.memory.facts.some(f => /Partner at Larkspur/.test(f.text)));
  assert.ok(r.memory.facts.some(f => /3 seed deals/.test(f.text)), 'facts about known people still land');
});

test('only what the document is about goes to the model', async () => {
  const { m } = ingest(2);
  m.people.push({ id: 'p-grace', name: 'Grace Okafor', email: 'grace@ridgeway.com', resolved: true });
  const prompt = readPrompt(m, STORY[2].doc);
  assert.match(prompt, /Maya Chen/);
  assert.doesNotMatch(prompt, /Grace/);
  assert.match(prompt, /Alex Rivera <alex@cueboard.app>, Founder & CEO at Cueboard/);
  const llm = scripted({ extract: () => bindKnown(STORY[2].ideal, idsFrom(m)) });
  const r = await readDoc(llm, m, STORY[2].doc);
  assert.ok(r.proposal.items.length > 5);
  await assert.rejects(readDoc(scripted({ extract: () => ({ nope: 1 }) }), m, STORY[2].doc), /schema/);
});

test('first meeting: the board knows Maya from the invite and the intro', () => {
  const { m, meetings } = ingest(2);
  const p = packetFor(m, meetings[0], '2026-10-07T18:00:00-04:00')!;
  const b = buildBoard(p);
  assert.deepEqual(checkBoard(b, p), []);
  assert.equal(b.stage, 'first');
  const maya = b.blocks.find(x => x.kind === 'person')!;
  assert.equal(maya.title, 'Maya Chen');
  assert.ok(maya.lines.some(l => /Fieldwork and Tally/.test(l.text)));
  assert.ok(p.context!.some(d => /meet Alex/.test(d.text)), 'the intro email is there for the model to read');
});

test('follow-up: the partner meeting board remembers the call, the numbers she heard and the promises', () => {
  const { m, meetings } = ingest();
  assert.equal(meetings.length, 2);
  const p = packetFor(m, meetings[1], '2026-10-21T09:00:00-04:00')!;
  const b = buildBoard(p);
  assert.deepEqual(checkBoard(b, p), []);
  assert.equal(b.stage, 'followup');
  const key = b.blocks.find(x => x.kind === 'keynotes')!;
  const left = key.lines.find(l => l.label === 'Where we left off')!;
  assert.match(left.text, /cohort table/);
  assert.ok(left.memory, 'it’s marked as memory of the call');
  const mrr = b.blocks.find(x => x.kind === 'number' && x.title === 'MRR')!;
  assert.equal(mrr.lines[0].text, '$38.5k');
  assert.match(mrr.lines[1].text, /was \$33k/);
  const obj = b.blocks.find(x => x.kind === 'note' && /Zoom feature/.test(x.title));
  assert.ok(obj && obj.lines.some(l => /Meet and Teams/.test(l.text)), 'her objection, with the answer');
  assert.ok(b.blocks.some(x => x.kind === 'note' && x.lines.some(l => /market-size/i.test(l.text))), 'what not to repeat');
  const tl = b.blocks.find(x => x.kind === 'timeline')!;
  assert.ok(tl.lines.some(l => /cohort/i.test(l.text) && l.tone === 'done'));
  assert.ok(b.blocks.some(x => x.kind === 'person' && x.title === 'Ben Okoro'));
  assert.ok(m.sources.every(s => s.ownerId === 'u-alex'), 'everything in memory is the user’s own');
});

test('the packet only carries documents about the people coming', () => {
  const { m, meetings } = ingest();
  m.docs.push({ id: 'dx', kind: 'notes', title: 'Notes about someone else', text: 'SECRET other deal', date: '2026-10-10', sourceId: 's-dx', personIds: ['p-someone'] });
  const p = packetFor(m, meetings[1], '2026-10-21T09:00:00-04:00')!;
  assert.ok(!p.context!.some(d => /SECRET/.test(d.text)));
});
