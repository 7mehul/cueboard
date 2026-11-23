import type { Doc } from './types.ts';

// Meeting notes from a notes app (Granola, and any other connector in connectors/), in one shape.
// A connector turns its app's API into this; everything after is shared: the import sheet, the
// checks, and the document memory reads. Each document keeps its parts apart and labelled,
// because they're not equally reliable: the person's own notes and the transcript are what was
// written and said; the app's summary is its AI's paraphrase. The person themselves is "Me",
// never one of the people they met.

// One line of a transcript, and who said it: you (`me`), someone the app could name (and their
// email, when it matched the voice to a guest), or a voice it only tells apart ("Speaker 2").
export interface SaidLine { text: string; me?: boolean; name?: string; email?: string; label?: string }

export interface NotesPerson { name?: string; email?: string }

export interface MeetingNotes {
  // The note's id in the app, as the connector's `noteId` pattern describes it.
  id: string;
  title: string;
  // When the meeting started (and ended), as ISO 8601 with a zone or offset.
  start: string;
  end?: string;
  // Where to open the note in the app. https only.
  url?: string;
  // Whose account this is, when the app says so for certain. Leave it out when it can't (a
  // meeting a colleague shared, say): Cueboard then goes by the person's About you.
  me?: { name?: string; email: string };
  // Everyone in the meeting, as the app lists them; `me` may be among them.
  people: NotesPerson[];
  // What the person wrote themselves.
  myNotes?: string;
  // What the app's AI wrote about the meeting.
  summary?: string;
  // What was said, line by line, or as text the app already labelled ("Maya: …").
  transcript?: SaidLine[] | string;
}

// What a list of notes gives: enough to pick which ones to bring in. `at` is when the meeting
// was, or when the note was made if the app's list doesn't say.
export interface NoteListItem { id: string; title: string; at: string }

// The app a note came from, as the page knows it.
export interface NotesApp { id: string; name: string }

export const notesDocId = (app: string, noteId: string) => `${app}-${noteId}`;

const pad = (n: number) => String(n).padStart(2, '0');
// The meeting's day where the person is, which is the day they'd call it.
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const clock = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Who the person is (their About you, and the app's `me`): their lines are "Me", and they aren't
// among the people they met. An email decides when there is one; otherwise the name does.
export interface Self { email?: string; name?: string }

const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const isSelf = (selves: Self[], email?: string, name?: string) =>
  selves.some(s => (email ? same(email, s.email) : same(name, s.name)));

// Consecutive lines from the same voice become one paragraph, labelled Me, Them (a name), a voice
// label, or Them. A line is Me when the app says so, or when its voice is the person's own.
export function transcriptText(lines: SaidLine[], selves: Self[] = []): string {
  const who = (l: SaidLine) => (l.me || isSelf(selves, l.email, l.name) ? 'Me' : l.name ? `Them (${l.name})` : l.label || 'Them');
  const out: { who: string; text: string }[] = [];
  for (const l of lines) {
    const text = l.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const w = who(l);
    const last = out.at(-1);
    if (last && last.who === w) last.text += ' ' + text;
    else out.push({ who: w, text });
  }
  return out.map(x => `${x.who}: ${x.text}`).join('\n');
}

// `self` is the person's About you.
export function notesToDoc(app: NotesApp, n: MeetingNotes, opts: { maxTranscript?: number; self?: Self } = {}): Doc {
  const max = opts.maxTranscript ?? 60_000;
  const title = n.title.trim() || 'Untitled meeting';
  const selves = [opts.self, n.me].filter((s): s is Self => !!s);
  const others = n.people.filter(p => (p.name || p.email) && !isSelf(selves, p.email, p.name));
  const parts: string[] = [];
  parts.push(`${app.name} notes: ${title}`);
  parts.push(`Meeting: ${localDay(n.start)} ${clock(n.start)}${n.end ? `–${clock(n.end)}` : ''}`);
  if (others.length) parts.push(`With: ${others.map(p => (p.name && p.email ? `${p.name} <${p.email}>` : p.name || p.email)).join(', ')}`);
  const mine = (n.myNotes ?? '').trim();
  if (mine) parts.push('', 'MY NOTES', mine);
  const summary = (n.summary ?? '').trim();
  if (summary) parts.push('', `AI SUMMARY (written by ${app.name}, not by me)`, summary);
  const said = (typeof n.transcript === 'string' ? n.transcript : transcriptText(n.transcript ?? [], selves)).trim();
  if (said) parts.push('', 'TRANSCRIPT', said.length > max ? said.slice(0, max).replace(/\s+\S*$/, '') + '\n[The transcript goes on; the rest was left out to keep this readable.]' : said);
  return {
    id: notesDocId(app.id, n.id),
    kind: said ? 'transcript' : 'notes',
    text: parts.join('\n'),
    date: localDay(n.start),
    title: `${app.name}: ${title}`,
    ...(n.url && /^https:\/\//.test(n.url) ? { url: n.url } : {}),
  };
}
