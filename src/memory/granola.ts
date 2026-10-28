import type { Doc } from './types.ts';

// Notes from Granola, through its public API (https://docs.granola.ai), as documents Cueboard
// reads like any other. Each keeps its parts apart and labelled, because they're not equally
// reliable: the person's own notes and the transcript are what was written and said; Granola's
// summary is its AI's paraphrase. The person themselves is "Me", never one of the attendees.

export interface GranolaUser { name: string | null; email: string }
export interface GranolaTranscriptItem {
  speaker: { source: 'microphone' | 'speaker'; attribution?: 'me' | 'them'; diarization_label?: string; name?: string };
  text: string;
  start_time?: string;
  end_time?: string;
}
export interface GranolaNote {
  id: string;
  title: string | null;
  owner: GranolaUser;
  created_at: string;
  web_url?: string;
  calendar_event?: { event_title: string | null; scheduled_start_time: string | null; scheduled_end_time: string | null } | null;
  attendees?: GranolaUser[];
  summary_markdown?: string | null;
  summary_text?: string | null;
  private_notes_markdown?: string | null;
  private_notes_text?: string | null;
  transcript?: GranolaTranscriptItem[] | null;
}
// What the list endpoint gives: enough to pick which notes to bring in.
export interface GranolaListItem { id: string; title: string | null; created_at: string }

export const NOTE_ID = /^not_[a-zA-Z0-9]{14}$/;
export const granolaDocId = (noteId: string) => `granola-${noteId}`;

const pad = (n: number) => String(n).padStart(2, '0');
// The meeting's day where the person is, which is the day they'd call it.
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const clock = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Consecutive lines from the same voice become one paragraph, labelled Me, a name, or Them.
export function transcriptText(items: GranolaTranscriptItem[]): string {
  const label = (s: GranolaTranscriptItem['speaker']) =>
    s.attribution === 'me' ? 'Me' : s.name ? `Them (${s.name})` : s.diarization_label ? s.diarization_label : s.attribution === 'them' ? 'Them' : s.source === 'microphone' ? 'Me' : 'Them';
  const out: { who: string; text: string }[] = [];
  for (const it of items) {
    const text = it.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const who = label(it.speaker);
    const last = out.at(-1);
    if (last && last.who === who) last.text += ' ' + text;
    else out.push({ who, text });
  }
  return out.map(x => `${x.who}: ${x.text}`).join('\n');
}

export function granolaToDoc(note: GranolaNote, opts: { maxTranscript?: number } = {}): Doc {
  const max = opts.maxTranscript ?? 60_000;
  const title = (note.title || note.calendar_event?.event_title || 'Untitled meeting').trim();
  const start = note.calendar_event?.scheduled_start_time || note.created_at;
  const end = note.calendar_event?.scheduled_end_time;
  const me = note.owner.email.toLowerCase();
  const others = (note.attendees ?? []).filter(a => a.email.toLowerCase() !== me);
  const parts: string[] = [];
  parts.push(`Granola notes: ${title}`);
  parts.push(`Meeting: ${localDay(start)} ${clock(start)}${end ? `–${clock(end)}` : ''}`);
  if (others.length) parts.push(`With: ${others.map(a => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ')}`);
  const mine = (note.private_notes_markdown || note.private_notes_text || '').trim();
  if (mine) parts.push('', 'MY NOTES', mine);
  const summary = (note.summary_markdown || note.summary_text || '').trim();
  if (summary) parts.push('', 'GRANOLA’S SUMMARY (written by Granola’s AI)', summary);
  const said = note.transcript?.length ? transcriptText(note.transcript) : '';
  if (said) parts.push('', 'TRANSCRIPT', said.length > max ? said.slice(0, max).replace(/\s+\S*$/, '') + '\n[The transcript goes on; the rest was left out to keep this readable.]' : said);
  return {
    id: granolaDocId(note.id),
    kind: said ? 'transcript' : 'notes',
    text: parts.join('\n'),
    date: localDay(start),
    title: `Granola: ${title}`,
    ...(note.web_url && /^https:\/\//.test(note.web_url) ? { url: note.web_url } : {}),
  };
}
