import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASTE_BREAK, firstDate, splitPaste } from '../src/memory/split.ts';
import { todayModel } from '../src/memory/today.ts';
import { commit, propose } from '../src/memory/extract.ts';
import { emptyMemory } from '../src/memory/types.ts';
import type { Memory } from '../src/memory/types.ts';
import { STORY, STORY_USER, bindKnown } from '../scenarios/docs.ts';

// Days are counted in the viewer's time zone; pin one so these don't depend on the machine.
process.env.TZ = 'America/New_York';

const TODAY = '2026-10-21';
const doc = (id: string) => STORY.find(s => s.doc.id === id)!.doc;

test('one paste of everything splits back into the documents, each recognised', () => {
  const all = STORY.map(s => s.doc.text).join(PASTE_BREAK);
  const chunks = splitPaste(all, TODAY);
  assert.deepEqual(chunks.map(c => c.kind), ['invite', 'email', 'notes', 'email', 'invite', 'other']);
  assert.deepEqual(chunks.map(c => c.text), STORY.map(s => s.doc.text.trim()));
  assert.equal(chunks[2].date, '2026-10-08', 'the notes are dated from their first line');
  assert.equal(chunks[5].date, '2026-10-20');
  assert.equal(chunks[0].date, TODAY, 'an invite is dated when it arrived; the meeting time is read later');
  assert.equal(chunks[1].title, 'Email from Sam Patel');
  assert.equal(chunks[0].title, 'Invite: Cueboard <> Larkspur Ventures');
});

test('without separators, a new email header still starts a new document', () => {
  const chunks = splitPaste(`${doc('d3').text}\n\n${doc('d4').text}\n\n${doc('d2').text}`, TODAY);
  assert.deepEqual(chunks.map(c => c.kind), ['notes', 'email', 'email']);
});

test('calendar files, transcripts and dated email headers', () => {
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Brightdesk evaluation\nDTSTART:20261023T140000Z\nEND:VEVENT\nEND:VCALENDAR';
  assert.deepEqual(splitPaste(ics, TODAY).map(c => [c.kind, c.title]), [['invite', 'Invite: Brightdesk evaluation']]);
  const transcript = ['[00:01] Hannah Becker: Thanks for joining.', '[00:04] Ravi Iyer: Can we start with pricing?', 'Alex Rivera: Sure, 120 seats is...', 'Ravi Iyer: And the annual discount?', 'Alex Rivera: Fifteen percent.', 'Tomás Alvarez: SSO first, please.'].join('\n');
  assert.equal(splitPaste(transcript, TODAY)[0].kind, 'transcript');
  const mail = 'From: Ravi Iyer <ravi@brightdesk.example>\nDate: Thu, 9 Oct 2026 14:02\nSubject: Pricing\n\nCan you send the 120-seat price?';
  assert.equal(splitPaste(mail, TODAY)[0].date, '2026-10-09');
});

test('dates: written any common way; no year means the latest one not in the future', () => {
  assert.equal(firstDate('Wed, Oct 8, 2026 at 3:12 PM', TODAY), '2026-10-08');
  assert.equal(firstDate('Call on 8 Oct', TODAY), '2026-10-08');
  assert.equal(firstDate('Notes from Dec 3', TODAY), '2025-12-03');
  assert.equal(firstDate('2026-09-30 sync', TODAY), '2026-09-30');
  assert.equal(firstDate('We decided 3 things', TODAY), null);
});

// The story, read up to some document, everything accepted.
function story(ids: string[]): { m: Memory; meetings: Record<string, string> } {
  let m = emptyMemory('u-alex', STORY_USER);
  const meetings: Record<string, string> = {};
  const known = (mm: Memory) => ({
    maya: mm.people.find(p => p.name === 'Maya Chen')?.id, ben: mm.people.find(p => p.name === 'Ben Okoro')?.id,
    larkspur: mm.companies[0]?.id, cohort: mm.commitments.find(c => /cohort/i.test(c.text))?.id, 'intro-ben': mm.commitments.find(c => /Ben/.test(c.text))?.id,
  });
  for (const id of ids) {
    const s = STORY.find(x => x.doc.id === id)!;
    const p = propose(m, s.doc, bindKnown(s.ideal, known(m)));
    const r = commit(m, s.doc, p, { people: p.people.map(x => x.ref), items: p.items.map(i => i.id) });
    m = r.memory;
    if (r.meetingId) meetings[id] = r.meetingId;
  }
  return { m, meetings };
}

test('Today: tomorrow’s partner meeting, what changed since she heard the numbers, and whether it’s ready', () => {
  const { m, meetings } = story(['d1', 'd2', 'd3', 'd4', 'd5', 'd6']);
  const t = todayModel(m, '2026-10-21T09:00:00-04:00', []);
  assert.deepEqual(t.sections.map(s => s.key), ['tomorrow']);
  const mtg = t.sections[0].meetings[0];
  assert.equal(mtg.title, 'Larkspur partner meeting: Cueboard');
  assert.deepEqual(mtg.people, ['Maya Chen', 'Ben Okoro']);
  assert.equal(mtg.stage, 'followup');
  assert.equal(mtg.meetingNo, 2);
  assert.equal(mtg.status, 'not_prepped');
  assert.equal(mtg.since, 'MRR $38.5k, up from the $33k you told Maya');
  assert.deepEqual(mtg.owed, [], 'both promises were kept');
  assert.equal(todayModel(m, '2026-10-21T09:00:00-04:00', [meetings.d5]).sections[0].meetings[0].status, 'ready');
});

test('Today: a follow-up whose last call has no notes says so first', () => {
  const { m, meetings } = story(['d1', 'd2', 'd5']);
  const mtg = todayModel(m, '2026-10-21T09:00:00-04:00', []).sections.flatMap(s => s.meetings)[0];
  assert.equal(mtg.status, 'needs_notes');
  assert.equal(mtg.notesFor, meetings.d1);
});

test('Today: a call that just ended asks what happened; promises owed show, overdue first', () => {
  const after = todayModel(story(['d1', 'd2']).m, '2026-10-09T09:00:00-04:00', []);
  assert.equal(after.sections[0].key, 'earlier');
  assert.equal(after.sections[0].meetings[0].status, 'add_notes');

  const { m } = story(['d1', 'd2', 'd3']);
  const t = todayModel(m, '2026-10-12T09:00:00-04:00', []);
  assert.deepEqual(t.owed.map(o => [o.text, o.overdue, o.theirs]), [
    ['You → Maya: Send the cohort table', true, false],
    ['Maya → you: Introduce you to her partner Ben Okoro', false, true],
  ]);
  assert.ok(!t.sections.some(s => s.key === 'earlier'), 'the call has its notes now');
});
