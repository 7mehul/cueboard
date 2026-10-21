import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import { classifyByTitle } from '../src/frame.ts';
import { rewriteBoard } from '../src/models.ts';
import { citeOf, toCanvas } from '../src/export.ts';
import { fitText, gapText, LIMITS, fits } from '../src/text.ts';
import type { Board, Packet } from '../src/types.ts';
import { generate } from '../synth/generate.ts';
import { danaFirst, danaFollowup } from './fixtures.ts';

const blk = (b: Board, id: string) => b.blocks.find(x => x.id === id);
const texts = (b: Board) => b.blocks.flatMap(x => x.lines.map(l => l.text));
const clean = (b: Board, p: Packet) => assert.deepEqual(checkBoard(b, p), []);

// ---------- the two boards from the mockup ----------

test('first meeting: research, numbers and a trend, no memory', () => {
  const p = danaFirst();
  const b = buildBoard(p);
  clean(b, p);
  assert.equal(b.stage, 'first');
  assert.equal(b.type, 'investor');
  assert.ok(texts(b).includes('Led 3 dev-tools seed rounds'));
  assert.equal(blk(b, 'trend:mrr')?.chart?.points.length, 5, 'MRR is the chart: it moves and she cares about traction');
  assert.ok(!blk(b, 'timeline'), 'no relationship to draw yet');
  assert.ok(!b.blocks.flatMap(x => x.lines).some(l => l.memory), 'nothing from memory on a first meeting');
  assert.ok(blk(b, 'questions')!.lines.some(l => l.gap === 'ask' && /check size/.test(l.text)), 'unknown fund becomes a question');
});

test('follow-up: where you left off, changes since you last spoke, promises', () => {
  const p = danaFollowup();
  const b = buildBoard(p);
  clean(b, p);
  assert.equal(b.stage, 'followup');
  const keys = blk(b, 'keynotes')!.lines;
  assert.deepEqual(keys.map(l => l.label), ['Where we left off', 'Goal', 'Open with', 'Ask']);
  assert.ok(keys[0].memory);
  assert.equal(keys[2].text, 'SMB churn down 22% since Sep 16', 'opens with the number she asked about');
  assert.equal(blk(b, 'number:mrr')!.lines[1].text, 'was $40.8k · +18%');
  const tl = blk(b, 'timeline')!;
  assert.equal(tl.events!.length, 5);
  assert.equal(tl.events!.at(-1)!.kind, 'today');
  assert.ok(tl.lines.some(l => l.tone === 'overdue' && l.text.startsWith('Dana:')));
  assert.ok(blk(b, 'questions')!.lines[0].text.startsWith('Any update on'), 'what she owes you is asked first');
  assert.ok(blk(b, 'note:obj:o-churn'), 'her open objection is on the board');
  assert.equal(blk(b, 'person:p-dana')!.lines[0].text, 'Asked twice about SMB churn', 'memory leads the person card');
});

// ---------- safety ----------

test('an unconfirmed person gets a confirm prompt and no research or history', () => {
  const p = danaFollowup();
  p.people[0].resolved = false;
  const b = buildBoard(p);
  clean(b, p);
  assert.equal(b.stage, 'first', 'history with an unconfirmed person is not trusted');
  const card = blk(b, 'person:p-dana')!;
  assert.deepEqual(card.lines.map(l => l.gap), ['confirm']);
  assert.ok(!texts(b).some(t => /seed rounds|SMB churn/.test(t) && !t.startsWith('[')));
});

test('another user’s private facts and sources never appear', () => {
  const p = danaFirst();
  p.sources.push({ id: 's-other', kind: 'notes', ref: 'x', seenAt: '2026-09-01', ownerId: 'u-other' });
  p.facts.push(
    { id: 'f-x1', subject: { kind: 'person', id: 'p-dana' }, topic: 'interest', text: 'Secret one', sourceIds: ['s-team'], confidence: 1, visibleTo: 'u-other' },
    { id: 'f-x2', subject: { kind: 'person', id: 'p-dana' }, topic: 'interest', text: 'Secret two', sourceIds: ['s-other'], confidence: 1 },
  );
  const b = buildBoard(p);
  clean(b, p);
  assert.ok(!texts(b).some(t => t.startsWith('Secret')));
});

test('conflicting facts: a clearly newer one wins, a tie shows neither', () => {
  const p = danaFirst();
  p.facts.push({ id: 'f-role-old', subject: { kind: 'person', id: 'p-dana' }, topic: 'role', text: 'Principal at Halyard Ventures', sourceIds: ['s-team'], confidence: 0.9, key: 'title', value: 'Principal' });
  let b = buildBoard(p);
  assert.ok(!texts(b).some(t => /Partner at|Principal at/.test(t)), 'undated tie: neither title shown');
  assert.ok(texts(b).some(t => t.includes('sources disagree on title')));
  clean(b, p);

  p.facts.find(f => f.id === 'f-role')!.date = '2026-09-01';
  p.facts.find(f => f.id === 'f-role-old')!.date = '2025-01-01';
  b = buildBoard(p);
  assert.ok(texts(b).includes('Partner at Halyard Ventures'));
  assert.ok(b.warnings.some(w => w.code === 'fact_changed'));
  clean(b, p);
});

test('a number that got worse since you shared it is marked and prepared for', () => {
  const p = danaFollowup();
  p.metrics.find(m => m.id === 'mrr')!.points.at(-1)!.value = 37000;
  const b = buildBoard(p);
  clean(b, p);
  assert.equal(blk(b, 'number:mrr')!.lines[1].tone, 'bad');
  assert.ok(blk(b, 'note:worse:mrr'));
  assert.ok(!/MRR up/.test(blk(b, 'keynotes')!.lines.find(l => l.label === 'Open with')!.text), 'never opens with bad news');
});

// ---------- visuals and budget ----------

test('charts only when the rule allows', () => {
  const p = danaFirst();
  for (const m of p.metrics) m.points = m.points.slice(-2);
  p.amounts[0].items = Array.from({ length: 8 }, (_, i) => ({ label: `Item ${i}`, value: i + 1 }));
  const b = buildBoard(p);
  clean(b, p);
  assert.ok(!b.blocks.some(x => x.kind === 'trend'), 'two points is not a trend');
  assert.ok(!b.blocks.some(x => x.kind === 'bars'), 'eight bars is too many');
  assert.ok(b.warnings.some(w => w.code === 'bars_skipped'));
});

test('a short meeting gets a smaller board, dropping the least important blocks', () => {
  const p = danaFollowup();
  p.meeting.durationMin = 15;
  const b = buildBoard(p);
  clean(b, p);
  assert.equal(b.budget.max, 8);
  assert.ok(b.budget.used <= 8);
  assert.ok(b.budget.dropped.includes('bars:use-of-funds'));
  assert.ok(blk(b, 'keynotes') && blk(b, 'person:p-dana'), 'required blocks stay');
});

test('missing goal and type become a gap and a guess', () => {
  const p = danaFirst();
  delete p.meeting.goal;
  delete p.meeting.type;
  const b = buildBoard(p);
  clean(b, p);
  assert.equal(b.type, 'investor');
  assert.ok(b.typeGuessed);
  assert.ok(blk(b, 'keynotes')!.lines.find(l => l.label === 'Goal')!.text.startsWith('['));
  assert.ok(b.gaps.length >= 1);
});

// ---------- engine properties ----------

test('deterministic and never changes its input', () => {
  for (const make of [danaFirst, danaFollowup]) {
    const p = make();
    const before = JSON.stringify(p);
    assert.equal(JSON.stringify(buildBoard(p)), JSON.stringify(buildBoard(p)));
    assert.equal(JSON.stringify(p), before);
  }
});

test('2,000 synthetic packets pass every rule', () => {
  const failures: string[] = [];
  for (let seed = 1; seed <= 2000; seed++) {
    const { packet } = generate(seed);
    const issues = checkBoard(buildBoard(packet), packet);
    if (issues.length) failures.push(`seed ${seed}: ${issues.map(i => i.code).join(', ')}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
});

// ---------- pieces ----------

test('fitText keeps limits and marks cuts', () => {
  const lim = { words: 4, chars: 30 };
  assert.deepEqual(fitText('Short line', lim), { text: 'Short line', trimmed: false });
  const r = fitText('One two three four five six seven', lim);
  assert.ok(r.trimmed && r.text.endsWith('…') && fits(r.text, lim));
  assert.ok(fits(fitText('x'.repeat(200), lim).text, lim));
  const g = gapText('look up their fund size and stage focus and more', LIMITS.line);
  assert.ok(g.startsWith('[') && g.endsWith(']') && fits(g, LIMITS.line));
});

test('title classifier', () => {
  assert.equal(classifyByTitle('Halyard Ventures <> Cueboard'), 'investor');
  assert.equal(classifyByTitle('Ridgeway Foods discovery'), 'customer');
  assert.equal(classifyByTitle('Parcelwise contract renewal'), 'negotiation');
  assert.equal(classifyByTitle('Bluefin Logistics partnership'), 'partnership');
  assert.equal(classifyByTitle('Coffee with Sam'), 'other');
});

test('a model rewrite is used only when it stays within limits', async () => {
  const p = danaFirst();
  const b = buildBoard(p);
  const ok = await rewriteBoard(b, { rewrite: async ({ block }) => block.lines.map(l => (l.gap ? l.text : l.text.toUpperCase())) });
  assert.equal(blk(ok, 'person:p-dana')!.lines[0].text, 'PARTNER AT HALYARD VENTURES');
  clean(ok, p);
  const tooLong = await rewriteBoard(b, { rewrite: async ({ block }) => block.lines.map(() => 'word '.repeat(30)) });
  assert.deepEqual(tooLong.blocks, b.blocks);
  const gapChanged = await rewriteBoard(b, { rewrite: async ({ block }) => block.lines.map(l => (l.gap ? 'filled in' : l.text)) });
  assert.deepEqual(gapChanged.blocks.find(x => x.id === 'questions'), blk(b, 'questions'));
});

test('exports to freeform canvas items, keeping memory and gap markers', () => {
  const b = buildBoard(danaFollowup());
  const out = toCanvas(b);
  assert.ok(out.elements.length >= b.blocks.length);
  assert.ok(out.elements.every(e => Number.isFinite(e.x) && Number.isFinite(e.y) && /^[\w-]{1,48}$/.test(e.id)));
  assert.equal(new Set(out.elements.map(e => e.id)).size, out.elements.length);
  const person = out.elements.find(e => e.type === 'person');
  assert.ok(person && person.type === 'person' && person.lines[0].memory);
  const tl = out.elements.find(e => e.type === 'timeline');
  assert.ok(tl && tl.type === 'timeline' && tl.events.at(-1)!.today);
  assert.ok(out.elements.some(e => e.type === 'chart' && e.kind === 'line'));
});

test('exported lines say where they came from, and only from their own sources', () => {
  const p = danaFollowup();
  const b = buildBoard(p);
  const out = toCanvas(b, p);
  const person = out.elements.find(e => e.type === 'person');
  assert.ok(person && person.type === 'person');
  const first = b.blocks.find(x => x.kind === 'person')!.lines[0];
  assert.deepEqual(person.lines[0].cite?.map(c => c.label), first.sourceIds.map(id => citeOf(p.sources.find(s => s.id === id)!).label));
  const web = person.lines.flatMap(l => l.cite ?? []).find(c => c.url);
  assert.ok(web && /^https:\/\//.test(web.url!) && !web.label.startsWith('http'), 'web sources show the site, linked');
  const stat = out.elements.find(e => e.type === 'stat');
  assert.ok(stat && stat.type === 'stat' && stat.cite?.length, 'numbers show their source');
  // Suggested and unknown lines have no source to show.
  for (const e of out.elements) if ('lines' in e) for (const l of e.lines) if (l.suggested || l.gap) assert.equal(l.cite, undefined);
  assert.equal(JSON.stringify(toCanvas(b)).includes('"cite"'), false, 'without the packet, nothing is cited');
});
