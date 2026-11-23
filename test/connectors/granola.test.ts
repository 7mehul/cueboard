import { test } from 'node:test';
import assert from 'node:assert/strict';
import granola, { granolaNotes } from '../../connectors/granola.ts';
import type { GranolaNote } from '../../connectors/granola.ts';
import { checkConnector, fakeApi, reply } from '../../connectors/testing.ts';
import { connectorContext } from '../../connectors/kit.ts';
import { notesToDoc, transcriptText } from '../../src/memory/notes.ts';
import { commit, inDocument, propose } from '../../src/memory/extract.ts';
import { emptyMemory } from '../../src/memory/types.ts';
import { packetFor } from '../../src/memory/packet.ts';
import { buildBoard } from '../../src/engine.ts';
import { toCanvas } from '../../src/export.ts';
import { GRANOLA_NOTES } from '../../scenarios/granola.ts';
import { STORY, STORY_USER, bindKnown } from '../../scenarios/docs.ts';

process.env.TZ = 'America/New_York';
const call = GRANOLA_NOTES[0];
const toDoc = (n: GranolaNote) => notesToDoc(granola, granolaNotes(n));
const KEY = 'grn_test_not_real';

// Granola's API as its docs describe it: notes listed a page at a time, each fetched with its
// transcript inline, or, when that's too long, with the transcript in pages of its own.
const granolaApi = (notes: GranolaNote[], opts: { longTranscript?: string } = {}) => fakeApi({
  'GET /v1/notes': ({ url }) => {
    const second = url.searchParams.get('cursor') === 'c2';
    const page = second ? notes.slice(1) : notes.slice(0, 1);
    return { notes: page.map(n => ({ id: n.id, title: n.title, created_at: n.created_at, deleted_at: null })), hasMore: !second && notes.length > 1, cursor: second ? null : 'c2' };
  },
  'GET /v1/notes/:id': ({ params, url }) => {
    const n = notes.find(x => x.id === params.id);
    if (!n) return reply(404);
    if (url.searchParams.get('include') === 'transcript') return params.id === opts.longTranscript ? reply(413) : n;
    return { ...n, transcript: null };
  },
  'GET /v1/notes/:id/transcript': ({ params, url }) => {
    const t = notes.find(x => x.id === params.id)!.transcript ?? [];
    const first = !url.searchParams.get('cursor');
    return { transcript: first ? t.slice(0, 2) : t.slice(2), hasMore: first, cursor: first ? 't2' : null };
  },
});

test('the Granola connector passes every check, including a transcript that comes in pages', async () => {
  const api = granolaApi(GRANOLA_NOTES, { longTranscript: call.id });
  const { listed, docs } = await checkConnector(granola, { env: { GRANOLA_API_KEY: KEY }, api });
  assert.deepEqual(listed.map(n => n.id), GRANOLA_NOTES.map(n => n.id));
  assert.ok(api.calls.some(c => c.url.pathname.endsWith('/transcript')), 'the long transcript was fetched in pages');
  assert.equal(docs[0].text, toDoc(call).text, 'paged or not, the same document');
  assert.ok(api.calls.every(c => c.headers.get('authorization') === `Bearer ${KEY}`));
});

test('a note Granola hasn’t finished says so', async () => {
  const ctx = connectorContext(granola, { GRANOLA_API_KEY: KEY }, { fetch: granolaApi([]).fetch });
  await assert.rejects(granola.fetch(ctx, 'not_Missing0000001'), /no finished notes for this meeting yet/);
});

test('a Granola note becomes one document with its parts labelled, and you as “Me”', () => {
  const doc = toDoc(call);
  assert.equal(doc.id, 'granola-not_LarkspurCall01', 'the same id as before connectors, so memory matches');
  assert.equal(doc.kind, 'transcript');
  assert.equal(doc.date, '2026-10-08', 'the meeting’s day where you are');
  assert.equal(doc.title, 'Granola: Call with Maya (Larkspur)');
  assert.equal(doc.url, call.web_url);
  const lines = doc.text.split('\n');
  assert.equal(lines[1], 'Meeting: 2026-10-08 10:00–10:30');
  assert.equal(lines[2], 'With: Maya Chen <maya@larkspur.example>', 'you are not one of the people you met');
  for (const heading of ['MY NOTES', 'AI SUMMARY (written by Granola, not by me)', 'TRANSCRIPT']) assert.ok(lines.includes(heading), heading);
  assert.match(doc.text, /^Them \(Maya Chen\): Thanks for making time\. How does churn look for the small teams\?$/m, 'one voice, one paragraph');
  assert.match(doc.text, /^Me: We’re at 3\.1% a month/m);
});

test('long transcripts are cut at a word, and a note without one is just notes', () => {
  const long = { ...call, transcript: Array.from({ length: 400 }, (_, i) => ({ speaker: { source: 'speaker' as const, attribution: (i % 2 ? 'me' : 'them') as 'me' | 'them' }, text: `Line number ${i} about the pilot.` })) };
  const doc = notesToDoc(granola, granolaNotes(long), { maxTranscript: 2000 });
  assert.match(doc.text, /\[The transcript goes on; the rest was left out to keep this readable\.\]$/);
  assert.ok(doc.text.length < 3600);
  assert.equal(toDoc({ ...call, transcript: null }).kind, 'notes');
  assert.equal(transcriptText(granolaNotes({ ...call, transcript: [{ speaker: { source: 'speaker', diarization_label: 'Speaker A' }, text: 'Hi' }] }).transcript as never), 'Speaker A: Hi');
  assert.equal(transcriptText(granolaNotes({ ...call, transcript: [{ speaker: { source: 'microphone' }, text: 'Hi' }] }).transcript as never), 'Me: Hi', 'the microphone is you');
  assert.equal(toDoc({ ...call, title: null }).title, 'Granola: Cueboard <> Larkspur Ventures', 'no title: the calendar event’s');
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
  const doc = toDoc(call);
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
