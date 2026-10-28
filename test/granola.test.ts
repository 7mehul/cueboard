import { test } from 'node:test';
import assert from 'node:assert/strict';
import { granolaToDoc, transcriptText } from '../src/memory/granola.ts';
import { commit, inDocument, propose } from '../src/memory/extract.ts';
import { emptyMemory } from '../src/memory/types.ts';
import { packetFor } from '../src/memory/packet.ts';
import { buildBoard } from '../src/engine.ts';
import { toCanvas } from '../src/export.ts';
import { GRANOLA_NOTES } from '../scenarios/granola.ts';
import { STORY, STORY_USER, bindKnown } from '../scenarios/docs.ts';

process.env.TZ = 'America/New_York';
const call = GRANOLA_NOTES[0];

test('a Granola note becomes one document with its parts labelled, and you as “Me”', () => {
  const doc = granolaToDoc(call);
  assert.equal(doc.id, 'granola-not_LarkspurCall01');
  assert.equal(doc.kind, 'transcript');
  assert.equal(doc.date, '2026-10-08', 'the meeting’s day where you are');
  assert.equal(doc.title, 'Granola: Call with Maya (Larkspur)');
  assert.equal(doc.url, call.web_url);
  const lines = doc.text.split('\n');
  assert.equal(lines[1], 'Meeting: 2026-10-08 10:00–10:30');
  assert.equal(lines[2], 'With: Maya Chen <maya@larkspur.vc>', 'you are not one of the people you met');
  for (const heading of ['MY NOTES', 'GRANOLA’S SUMMARY (written by Granola’s AI)', 'TRANSCRIPT']) assert.ok(lines.includes(heading), heading);
  assert.match(doc.text, /^Them \(Maya Chen\): Thanks for making time\. How does churn look for the small teams\?$/m, 'one voice, one paragraph');
  assert.match(doc.text, /^Me: We’re at 3\.1% a month/m);
});

test('long transcripts are cut at a word, and a note without one is just notes', () => {
  const long = { ...call, transcript: Array.from({ length: 400 }, (_, i) => ({ speaker: { source: 'speaker' as const, attribution: (i % 2 ? 'me' : 'them') as 'me' | 'them' }, text: `Line number ${i} about the pilot.` })) };
  const doc = granolaToDoc(long, { maxTranscript: 2000 });
  assert.match(doc.text, /\[The transcript goes on; the rest was left out to keep this readable\.\]$/);
  assert.ok(doc.text.length < 3600);
  assert.equal(granolaToDoc({ ...call, transcript: null }).kind, 'notes');
  assert.equal(transcriptText([{ speaker: { source: 'speaker', diarization_label: 'Speaker A' }, text: 'Hi' }]), 'Speaker A: Hi');
});

test('read into memory, the call keeps its link back to Granola, all the way to the board', () => {
  let m = emptyMemory('u-alex', STORY_USER);
  const known = () => ({ maya: m.people.find(p => p.name === 'Maya Chen')?.id, larkspur: m.companies[0]?.id });
  // The invite and intro first, so Maya is known; then the Granola note in place of pasted notes.
  for (const id of ['d1', 'd2']) {
    const s = STORY.find(x => x.doc.id === id)!;
    const p = propose(m, s.doc, bindKnown(s.ideal, known()));
    m = commit(m, s.doc, p, { people: p.people.map(x => x.ref), items: p.items.map(i => i.id) }).memory;
  }
  const meetingId = m.meetings[0].id;
  const doc = granolaToDoc(call);
  const p = propose(m, doc, bindKnown(STORY.find(x => x.doc.id === 'd3')!.ideal, known()));
  assert.deepEqual(p.dropped, [], 'everything the notes say is in the Granola document');
  for (const i of p.items) assert.ok(inDocument(doc.text, i.quote));
  m = commit(m, doc, p, { people: p.people.map(x => x.ref), items: p.items.map(i => i.id) }).memory;
  const src = m.sources.find(s => s.id === 's-granola-not_LarkspurCall01')!;
  assert.equal(src.kind, 'debrief', 'notes of a call that happened are memory of that meeting');
  assert.equal(src.url, call.web_url);

  // A follow-up with Maya now knows where things were left, and links to the Granola note.
  m.meetings.push({ ...m.meetings.find(x => x.id === meetingId)!, id: 'mtg-next', startsAt: '2026-10-22T11:00:00-04:00', title: 'Larkspur partner meeting' });
  const packet = packetFor(m, 'mtg-next', '2026-10-21T09:00:00-04:00')!;
  const board = buildBoard(packet);
  assert.equal(board.stage, 'followup');
  const canvas = toCanvas(board, packet);
  const cites = canvas.elements.flatMap(e => ('lines' in e ? e.lines : []).flatMap(l => l.cite ?? []));
  assert.ok(cites.some(c => c.label.startsWith('Granola: Call with Maya') && c.url === call.web_url));
});
