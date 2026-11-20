import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_USER, demoAnswer, demoMemory, demoWorld } from '../scenarios/demo.ts';
import { fakeModel } from '../scenarios/fake-model.ts';
import { buildBoardSmart } from '../src/intel/smart.ts';
import { commit, propose } from '../src/memory/extract.ts';
import { syncCalendar } from '../src/memory/calendar.ts';
import { packetFor } from '../src/memory/packet.ts';
import { todayModel } from '../src/memory/today.ts';
import { granolaToDoc } from '../src/memory/granola.ts';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import type { Memory } from '../src/memory/types.ts';

process.env.TZ = 'America/New_York';
const NOW = new Date('2026-10-29T13:10:00-04:00');
const world = demoWorld(NOW);
const synced = () => syncCalendar(demoMemory(NOW), world.events, { now: NOW.toISOString(), from: new Date(NOW.getTime() - 14 * 864e5).toISOString(), to: new Date(NOW.getTime() + 14 * 864e5).toISOString() }).memory;
const read = (m: Memory, docId: string) => {
  const d = [...world.seed, ...world.known].find(x => x.doc.id === docId)!;
  const ideal = demoAnswer(['KNOWN OPEN PROMISES', ...m.commitments.filter(c => !c.doneAt).map(c => `- [${c.id}] ${c.text}`), '', d.doc.text].join('\n'), NOW)!;
  return { doc: d.doc, p: propose(m, d.doc, ideal) };
};

test('every demo document reads cleanly: nothing its reading claims is missing from it', () => {
  let m: Memory = { ...demoMemory(NOW), people: [], companies: [], sources: [], facts: [], metrics: [], disclosures: [], touches: [], commitments: [], objections: [], meetings: [], docs: [] };
  for (const d of world.seed) {
    const { p } = read(m, d.doc.id);
    assert.deepEqual(p.dropped, [], d.doc.id);
    m = commit(m, d.doc, p, { people: p.people.map(x => x.ref), items: p.items.map(i => i.id), meeting: null }).memory;
  }
  assert.equal(m.user?.name, DEMO_USER.name);
  assert.deepEqual(m.people.map(p => p.name).sort(), ['Hana Ito', 'Jordan Ellis', 'Maya Chen', 'Omar Haddad', 'Priya Raman', 'Sam Patel', 'Sofia Marin']);
  assert.ok(m.commitments.find(c => c.text.includes('API overview'))?.doneAt, 'the API overview email keeps that promise');
});

test('the week on Today: a renewal soon, a coffee waiting for notes, the partner meeting asking for last call’s notes', () => {
  const m = synced();
  const t = todayModel(m, NOW.toISOString(), []);
  const where = Object.fromEntries(t.sections.flatMap(s => s.meetings.map(x => [x.title, s.key])));
  assert.deepEqual(where, {
    'Coffee with Lena (Loomwise)': 'earlier', 'Brightline renewal check-in': 'today',
    'Larkspur partner meeting: Cueboard': 'tomorrow', 'Intro: Priya (Northwind) <> Alex': 'tomorrow',
    'Fieldstone integration: technical follow-up': 'week',
  });
  const card = (title: string) => t.sections.flatMap(s => s.meetings).find(x => x.title === title)!;
  assert.equal(card('Coffee with Lena (Loomwise)').status, 'add_notes');
  assert.equal(card('Larkspur partner meeting: Cueboard').status, 'needs_notes', 'the Maya call is in the calendar, not in memory');
  assert.deepEqual([card('Brightline renewal check-in').stage, card('Brightline renewal check-in').owed[0]], ['followup', { text: 'You owe Jordan: send the SSO timeline', overdue: true }]);
  assert.equal(card('Fieldstone integration: technical follow-up').stage, 'followup');
  assert.equal(card('Intro: Priya (Northwind) <> Alex').stage, 'first');
  assert.ok(t.owed.some(o => o.overdue && /SSO/.test(o.text)));
});

test('every meeting ahead gets a board that passes every rule', () => {
  const m = synced();
  for (const mt of m.meetings.filter(x => !x.cancelled && new Date(x.startsAt) > NOW)) {
    const p = packetFor(m, mt.id, NOW.toISOString())!;
    const b = buildBoard(p);
    assert.deepEqual(checkBoard(b, p), [], mt.title);
  }
  const brightline = buildBoard(packetFor(m, m.meetings.find(x => x.title.startsWith('Brightline'))!.id, NOW.toISOString())!);
  const text = JSON.stringify(brightline.blocks);
  assert.match(text, /"title":"Otter is half the price"/, 'their objection, with your answer');
  assert.match(text, /SSO/);
});

test('what arrives while exploring reads cleanly too, in the order the guide suggests', () => {
  let m = synced();
  const save = (docId: string, title?: string) => {
    const { doc, p } = read(m, docId);
    assert.deepEqual(p.dropped, [], docId);
    m = commit(m, title ? { ...doc, title } : doc, p, { people: p.people.map(x => x.ref), items: p.items.map(i => i.id), meeting: null }).memory;
    return p;
  };
  // The Granola import of the call with Maya.
  const note = world.granola.find(n => n.id === 'not_DemoMayaCall01')!;
  const gdoc = granolaToDoc(note);
  assert.ok(gdoc.text.includes(world.known.find(k => k.doc.id === 'demo-maya-call')!.doc.text), 'the stand-in recognises the Granola note by its notes');
  const ideal = demoAnswer(gdoc.text, NOW)!;
  const gp = propose(m, gdoc, ideal);
  assert.deepEqual(gp.dropped, []);
  m = commit(m, gdoc, gp, { people: gp.people.map(x => x.ref), items: gp.items.map(i => i.id), meeting: null }).memory;
  const partner = todayModel(m, NOW.toISOString(), []).sections.flatMap(s => s.meetings).find(x => x.title.startsWith('Larkspur'))!;
  assert.equal(partner.status, 'not_prepped', 'the call’s notes are in now');
  assert.match(partner.since ?? '', /MRR \$38\.5k, up from the \$33k you told Maya/);

  save('demo-cohort-email');
  assert.ok(m.commitments.find(c => /cohort/i.test(c.text))?.doneAt, 'the cohort promise is kept');
  const lena = save('demo-lena-notes');
  assert.ok(lena.items.some(i => i.kind === 'fact' && /pushes on churn/.test(i.text)));
  const maya = m.people.find(p => p.name === 'Maya Chen')!;
  assert.ok(m.facts.some(f => f.subject.id === maya.id && /pushes on churn/.test(f.text)), 'what Lena said about Maya is about Maya');
  save('demo-sofia-email');
  save('demo-hana-profile');
});

test('a goal in one line redraws the board around it, with no key: the stand-in reads each demo meeting', async () => {
  const m = synced();
  const llm = fakeModel();
  const parts = (b: { blocks: { kind: string; title: string }[] }) => b.blocks.filter(x => x.kind === 'phase').map(x => x.title);
  for (const mt of m.meetings.filter(x => !x.cancelled && new Date(x.startsAt) > NOW)) {
    const p = packetFor(m, mt.id, NOW.toISOString())!;
    const r = await buildBoardSmart(p, llm);
    assert.deepEqual([r.mode, r.issues], ['model', []], mt.title);
    assert.ok(r.brief!.goal.alternatives.length, 'other goals to pick from');
    assert.ok(r.board.blocks.find(b => b.kind === 'keynotes')!.lines.find(l => l.label === 'Goal')!.suggested, 'a suggestion until the user says theirs');
    // Each goal on offer is a different meeting: a different plan, and the board still keeps every rule.
    for (const goal of r.brief!.goal.alternatives) {
      const p2 = { ...p, meeting: { ...p.meeting, goal } };
      const r2 = await buildBoardSmart(p2, llm);
      assert.deepEqual([r2.mode, checkBoard(r2.board, p2)], ['model', []], goal);
      assert.notDeepEqual(parts(r2.board), parts(r.board), goal);
      const line = r2.board.blocks.find(b => b.kind === 'keynotes')!.lines.find(l => l.label === 'Goal')!;
      assert.deepEqual([line.text, !!line.suggested], [goal, false], 'their goal, in their words');
    }
  }
  const bl = m.meetings.find(x => x.title.startsWith('Brightline'))!;
  const p = packetFor(m, bl.id, NOW.toISOString())!;
  const typed = await buildBoardSmart({ ...p, meeting: { ...p.meeting, goal: 'I want to understand why their seats keep falling' } }, llm);
  assert.deepEqual(parts(typed.board), ['Open', 'Why seats fell', 'What you’d change', 'Who to talk to'], 'typed in their own words, the closest reading is used');
  assert.ok(typed.board.blocks.find(b => b.kind === 'questions')!.lines.some(l => /stopped using it/.test(l.text)));
});

test('the demo week reads right in any month: no number from the future, no deadline already past', () => {
  for (const when of ['2027-02-10T13:00:00-05:00', '2027-07-01T09:00:00-04:00', '2026-12-31T16:00:00-05:00']) {
    const at = new Date(when);
    const m = demoMemory(at);
    for (const x of m.metrics) for (const p of x.points) assert.ok(Date.parse(p.date) <= at.getTime(), `${x.label} on ${p.date} at ${when}`);
    const w = demoWorld(at);
    const text = [...w.seed, ...w.known].map(d => d.doc.text).join('\n');
    for (const d of text.matchAll(/(?:renewal date is|decision by) (\w+ \d+)/g)) {
      const due = new Date(`${d[1]}, ${at.getFullYear()}`), due2 = new Date(`${d[1]}, ${at.getFullYear() + 1}`);
      assert.ok(due.getTime() > at.getTime() || due2.getTime() - at.getTime() < 60 * 864e5, `${d[0]} at ${when}`);
    }
  }
});
