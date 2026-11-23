import { SourceError } from './kit.ts';
import type { Ctx, MeetingNotes, NotesConnector, SaidLine } from './kit.ts';

// Granola, read-only, through its public API (https://docs.granola.ai), with a personal API key
// from Settings → Connectors → API keys (Business plan).

const API = 'https://public-api.granola.ai/v1';

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

// Granola says who spoke three ways: attribution (me or them), a name, or a diarization label.
// Without any, the microphone is you.
const said = (it: GranolaTranscriptItem): SaidLine => {
  const s = it.speaker;
  const me = s.attribution === 'me' || (!s.name && !s.diarization_label && s.attribution !== 'them' && s.source === 'microphone');
  return { text: it.text, ...(me ? { me: true } : s.name ? { name: s.name } : s.diarization_label ? { label: s.diarization_label } : {}) };
};

export function granolaNotes(note: GranolaNote): MeetingNotes {
  const user = (u: GranolaUser) => ({ ...(u.name ? { name: u.name } : {}), email: u.email });
  const end = note.calendar_event?.scheduled_end_time;
  return {
    id: note.id,
    title: (note.title || note.calendar_event?.event_title || '').trim(),
    start: note.calendar_event?.scheduled_start_time || note.created_at,
    ...(end ? { end } : {}),
    ...(note.web_url ? { url: note.web_url } : {}),
    me: user(note.owner),
    people: (note.attendees ?? []).map(user),
    ...(note.private_notes_markdown || note.private_notes_text ? { myNotes: (note.private_notes_markdown || note.private_notes_text)! } : {}),
    ...(note.summary_markdown || note.summary_text ? { summary: (note.summary_markdown || note.summary_text)! } : {}),
    ...(note.transcript?.length ? { transcript: note.transcript.map(said) } : {}),
  };
}

const auth = (ctx: Ctx) => ({ authorization: `Bearer ${ctx.env.GRANOLA_API_KEY}` });

const granola: NotesConnector = {
  id: 'granola',
  name: 'Granola',
  env: ['GRANOLA_API_KEY'],
  hosts: ['public-api.granola.ai'],
  setup: ['In Granola, open Settings → Connectors → API keys and create a key. It needs a Business plan.'],
  noteId: /^not_[a-zA-Z0-9]{14}$/,

  async list(ctx, { after, cursor }) {
    const b = await ctx.http(`${API}/notes?created_after=${after}&page_size=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: auth(ctx) });
    const notes = (b?.notes ?? []).filter((n: { deleted_at?: string | null }) => !n.deleted_at)
      .map((n: { id: string; title: string | null; created_at: string }) => ({ id: n.id, title: n.title ?? '', at: n.created_at }));
    return { notes, cursor: b?.hasMore ? b.cursor : null };
  },

  async fetch(ctx, id) {
    let note: GranolaNote;
    try {
      note = await ctx.http(`${API}/notes/${id}?include=transcript`, { headers: auth(ctx) });
    } catch (e) {
      if (e instanceof SourceError && e.status === 404) throw new SourceError(404, 'Granola has no finished notes for this meeting yet.');
      if (!(e instanceof SourceError && e.status === 413)) throw e;
      // A transcript too long to send inline comes in pages. A page that fails ends it there.
      note = await ctx.http(`${API}/notes/${id}`, { headers: auth(ctx) });
      const items: GranolaTranscriptItem[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 40; page++) {
        let t;
        try { t = await ctx.http(`${API}/notes/${id}/transcript?page_size=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: auth(ctx) }); } catch { break; }
        items.push(...(t?.transcript ?? []));
        if (!t?.hasMore || !t.cursor) break;
        cursor = t.cursor;
      }
      note.transcript = items;
    }
    return granolaNotes(note);
  },
};

export default granola;
