import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDescription, companyFromDomain, meetingInputs, nameFromEmail, prepPlan, syncCalendar } from '../src/memory/calendar.ts';
import type { CalendarEvent } from '../src/memory/calendar.ts';
import { emptyMemory } from '../src/memory/types.ts';
import type { Memory } from '../src/memory/types.ts';
import { packetFor } from '../src/memory/packet.ts';
import { todayModel } from '../src/memory/today.ts';
import { buildBoard } from '../src/engine.ts';
import { FAKE_SELF, fakeEvents } from '../scenarios/calendar.ts';

process.env.TZ = 'America/New_York';
const NOW = new Date('2026-10-28T09:00:00-04:00');
const window = { now: NOW.toISOString(), from: new Date(NOW.getTime() - 14 * 864e5).toISOString(), to: new Date(NOW.getTime() + 14 * 864e5).toISOString() };
const user = { name: 'Alex Rivera', email: FAKE_SELF, role: 'Founder & CEO', company: 'Cueboard' };
const fresh = () => emptyMemory('u-alex', user);
const sync = (m: Memory, events = fakeEvents(NOW)) => syncCalendar(m, events, window);
const titleOf = (m: Memory, id: string) => m.meetings.find(x => x.id === id)!.title;

test('meetings with someone from outside come in; the rest of a calendar doesn’t', () => {
  const { memory: m, added } = sync(fresh());
  assert.deepEqual(added.map(id => titleOf(m, id)).sort(), ['Call with Maya (Larkspur)', 'Intro: Priya (Northwind) <> Alex', 'Larkspur partner meeting: Cueboard'],
    'not the internal sync, focus time, the declined coffee or the all-day offsite');
  assert.deepEqual(m.people.map(p => `${p.name} <${p.email}>`).sort(), ['Ben Okoro <ben@larkspur.vc>', 'Maya Chen <maya@larkspur.vc>', 'Priya Raman <priya.raman@northwind.io>'],
    'guests by address, named from it when the calendar has no name, never you');
  assert.ok(m.people.every(p => p.resolved), 'the calendar says who is invited');
  assert.deepEqual(m.companies.map(c => `${c.name} (${c.domain})`).sort(), ['Larkspur (larkspur.vc)', 'Northwind (northwind.io)']);
  const partner = m.meetings.find(x => x.title.startsWith('Larkspur'))!;
  assert.equal(partner.durationMin, 45);
  assert.equal(partner.calendar?.joinUrl, 'https://zoom.us/j/8812345678');
  const doc = m.docs.find(d => d.sourceId === partner.sourceId)!;
  assert.match(doc.text, /Please bring the cohort data and your plan for the round\./);
  assert.doesNotMatch(doc.text, /Meeting ID|Passcode|zoom\.us|One tap|──/, 'dial-in text is left out');
  assert.equal(m.sources.find(s => s.id === partner.sourceId)?.url, 'https://calendar.google.com/calendar/event?eid=larkspur');
});

test('syncing again changes nothing; a moved, declined or deleted meeting is noticed', () => {
  const first = sync(fresh()).memory;
  const again = sync(first);
  assert.deepEqual([again.added, again.changed, again.cancelled], [[], [], []]);
  assert.equal(again.memory.people.length, first.people.length);
  assert.deepEqual(again.memory, first);

  const events = fakeEvents(NOW);
  const partner = events.find(e => e.id === 'evt_larkspur_partner')!;
  partner.start = new Date(new Date(partner.start).getTime() + 3600_000).toISOString();
  partner.end = new Date(new Date(partner.end).getTime() + 3600_000).toISOString();
  const moved = sync(first, events);
  assert.deepEqual(moved.changed.map(id => titleOf(moved.memory, id)), ['Larkspur partner meeting: Cueboard']);

  const declined = fakeEvents(NOW).map(e => e.id === 'evt_northwind_intro' ? { ...e, attendees: e.attendees.map(a => a.self ? { ...a, response: 'declined' as const } : a) } : e);
  const d = sync(first, declined);
  assert.deepEqual(d.cancelled.map(id => titleOf(d.memory, id)), ['Intro: Priya (Northwind) <> Alex']);
  const deleted = sync(first, fakeEvents(NOW).filter(e => e.id !== 'evt_maya_call'));
  assert.deepEqual(deleted.cancelled.map(id => titleOf(deleted.memory, id)), ['Call with Maya (Larkspur)']);
  const back = sync(deleted.memory);
  assert.ok(back.memory.meetings.every(x => !x.cancelled), 'and back again when it reappears');
});

test('the calendar joins what you pasted instead of doubling it', () => {
  const m = fresh();
  m.companies.push({ id: 'co-larkspur-ventures', name: 'Larkspur Ventures' });
  m.people.push({ id: 'p-maya-chen', name: 'Maya Chen', companyId: 'co-larkspur-ventures', resolved: true });
  m.sources.push({ id: 's-d5', kind: 'calendar', ref: 'Calendar invite', seenAt: '2026-10-14' });
  const start = fakeEvents(NOW).find(e => e.id === 'evt_larkspur_partner')!.start;
  m.meetings.push({ id: 'mtg-pasted', title: 'Larkspur partner meeting: Cueboard', startsAt: start, durationMin: 45, attendeeIds: ['p-maya-chen'], goal: 'Get to a term sheet', sourceId: 's-d5' });
  const s = sync(m);
  const partner = s.memory.meetings.filter(x => x.title.startsWith('Larkspur partner'));
  assert.equal(partner.length, 1, 'one meeting');
  assert.equal(partner[0].id, 'mtg-pasted');
  assert.equal(partner[0].goal, 'Get to a term sheet', 'your goal stays');
  assert.equal(s.memory.people.filter(p => p.name === 'Maya Chen').length, 1, 'Maya, known by name, gets her address');
  assert.equal(s.memory.people.find(p => p.name === 'Maya Chen')!.email, 'maya@larkspur.vc');
  assert.deepEqual(s.memory.companies.map(c => `${c.name} (${c.domain ?? '—'})`).sort(), ['Larkspur Ventures (larkspur.vc)', 'Northwind (northwind.io)'], 'the pasted company gets its domain');
});

test('a board’s inputs change with what memory knows about the people coming, not about others', () => {
  const m = sync(fresh()).memory;
  const partner = m.meetings.find(x => x.title.startsWith('Larkspur partner'))!;
  const maya = m.people.find(p => p.name === 'Maya Chen')!;
  const priya = m.people.find(p => p.name === 'Priya Raman')!;
  const before = meetingInputs(m, partner.id);
  const src = { id: 's-n', kind: 'notes' as const, ref: 'notes', seenAt: '2026-10-27' };
  const other = structuredClone(m);
  other.sources.push(src);
  other.facts.push({ id: 'f1', subject: { kind: 'person', id: priya.id }, text: 'Runs a 40-person field team', sourceIds: ['s-n'], confidence: 1, date: '2026-10-27' } as never);
  assert.equal(meetingInputs(other, partner.id), before, 'a fact about Priya doesn’t touch the Larkspur board');
  const about = structuredClone(m);
  about.facts.push({ id: 'f2', subject: { kind: 'person', id: maya.id }, text: 'Wants cohort data', sourceIds: ['s-n'], confidence: 1, date: '2026-10-27' } as never);
  assert.notEqual(meetingInputs(about, partner.id), before, 'a fact about Maya does');
  const moved = structuredClone(m);
  moved.meetings.find(x => x.id === partner.id)!.startsAt = new Date(NOW.getTime() + 30 * 3600_000).toISOString();
  assert.notEqual(meetingInputs(moved, partner.id), before, 'so does a new time');
});

test('every meeting today and tomorrow gets a board without asking; changed ones are refreshed', () => {
  const m = sync(fresh()).memory;
  const id = (t: string) => m.meetings.find(x => x.title.startsWith(t))!.id;
  const plan = prepPlan(m, [], NOW.toISOString());
  assert.deepEqual(plan.make.map(x => titleOf(m, x)), ['Larkspur partner meeting: Cueboard', 'Intro: Priya (Northwind) <> Alex'], 'soonest first, not the past call');
  assert.deepEqual(plan.refresh, []);
  const boards = [{ meetingId: id('Larkspur'), inputs: meetingInputs(m, id('Larkspur'))!, refreshable: true }, { meetingId: id('Intro'), inputs: 'old', refreshable: true }];
  assert.deepEqual(prepPlan(m, boards, NOW.toISOString()), { make: [], refresh: [id('Intro')] });
  assert.deepEqual(prepPlan(m, [{ ...boards[1], refreshable: false }, boards[0]], NOW.toISOString()), { make: [], refresh: [] }, 'a board from before drafts were kept isn’t touched');
  const later = new Date(NOW.getTime() + 3 * 864e5).toISOString();
  assert.deepEqual(prepPlan(m, [], later).make, [], 'nothing beyond tomorrow');
});

test('Today shows the drafted board as ready, and still asks for the last call’s notes', () => {
  const m = sync(fresh()).memory;
  const partner = m.meetings.find(x => x.title.startsWith('Larkspur partner'))!;
  const t = todayModel(m, NOW.toISOString(), [partner.id]);
  const card = t.sections.flatMap(s => s.meetings).find(x => x.id === partner.id)!;
  assert.equal(card.status, 'ready');
  assert.equal(titleOf(m, card.notesFor!), 'Call with Maya (Larkspur)', 'you met six days ago, and memory has no notes from it');
  assert.deepEqual([card.stage, card.meetingNo], ['followup', 2], 'that meeting still counts');
  assert.equal(card.joinUrl, 'https://zoom.us/j/8812345678');
  const intro = t.sections.flatMap(s => s.meetings).find(x => x.title.startsWith('Intro'))!;
  assert.deepEqual([intro.status, intro.notesFor], ['not_prepped', undefined]);
});

test('a follow-up whose last meeting has no notes says so, instead of pretending it’s a first meeting', () => {
  const m = sync(fresh()).memory;
  const partner = m.meetings.find(x => x.title.startsWith('Larkspur partner'))!;
  const board = buildBoard(packetFor(m, partner.id, NOW.toISOString())!);
  assert.equal(board.stage, 'followup');
  const left = board.blocks.flatMap(b => b.lines).find(l => l.label === 'Where we left off')!;
  assert.equal(left.text, 'Call with Maya (Larkspur). No notes from it yet.');
  assert.deepEqual(left.sourceIds, [m.meetings.find(x => x.title.startsWith('Call with Maya'))!.sourceId], 'sourced to the calendar');
});

test('a first meeting from the calendar alone still makes a sound board', () => {
  const m = sync(fresh()).memory;
  const intro = m.meetings.find(x => x.title.startsWith('Intro'))!;
  const p = packetFor(m, intro.id, NOW.toISOString())!;
  assert.ok((p.context ?? []).some(c => /field operations at Northwind/.test(c.text)), 'the invite’s words are there for the model');
  const board = buildBoard(p);
  assert.equal(board.stage, 'first');
  assert.ok(board.blocks.some(b => b.kind === 'person' && b.title === 'Priya Raman'));
});

test('names, companies and descriptions are read sensibly', () => {
  assert.equal(nameFromEmail('maya.chen@larkspur.vc'), 'Maya Chen');
  assert.equal(nameFromEmail('ben+deals@x.com'), 'Ben');
  assert.equal(companyFromDomain('larkspur.vc'), 'Larkspur');
  assert.equal(companyFromDomain('go.acme.co.uk'), 'Acme');
  assert.equal(companyFromDomain('northwind.io'), 'Northwind');
  assert.equal(cleanDescription('<p>Agenda:</p><ul><li>Pilot scope</li><li>Pricing</li></ul>Join with Google Meet: https://meet.google.com/x'), 'Agenda:\nPilot scope\nPricing');
  assert.equal(cleanDescription(undefined), '');
});

test('a calendar with you at a personal address counts everyone else as outside', () => {
  const events: CalendarEvent[] = [{ id: 'e1', title: 'Catch up', start: '2026-10-29T10:00:00-04:00', end: '2026-10-29T10:30:00-04:00', kind: 'default',
    attendees: [{ email: 'alex.rivera@gmail.com', self: true }, { email: 'jo@gmail.com', name: 'Jo Park' }] }];
  const s = syncCalendar(emptyMemory('u', { role: 'Founder', company: 'Cueboard' }), events, { ...window, selfEmail: 'alex.rivera@gmail.com' });
  assert.equal(s.added.length, 1);
  assert.equal(s.memory.companies.length, 0, 'gmail.com is nobody’s company');
});

test('a board goes out of date when an earlier meeting with the same people ends', () => {
  const m = sync(fresh()).memory;
  const partner = m.meetings.find(x => x.title.startsWith('Larkspur partner'))!;
  const call = structuredClone(m);
  const earlier = call.meetings.find(x => x.title.startsWith('Call with Maya'))!;
  earlier.startsAt = new Date(NOW.getTime() + 2 * 3600_000).toISOString();   // later today, before the partner meeting
  const before = meetingInputs(call, partner.id, NOW.getTime());
  assert.notEqual(meetingInputs(call, partner.id, NOW.getTime() + 4 * 3600_000), before, 'once that call is over');
  assert.equal(meetingInputs(call, partner.id, NOW.getTime() + 3600_000), before, 'not before');
});
