import type { NotesConnector } from './kit.ts';

// A connector for a made-up notes app, "Example Notes", to copy when you write one for a real app.
// It isn't in index.ts, so Cueboard never offers it. CONNECTORS.md walks through it line by line.
// Its test is test/connectors/example.test.ts.

const API = 'https://api.notes.example/v1';

// What the app's API sends, as far as this connector reads it.
interface ApiMeeting {
  id: string;
  name: string;
  started_at: string;
  ended_at?: string;
  share_url?: string;
  owner: { name?: string; email: string };
  participants: { name?: string; email?: string }[];
  user_notes?: string;
  ai_summary?: string;
  transcript?: { speaker_name?: string; is_owner?: boolean; text: string }[];
}

const example: NotesConnector = {
  id: 'example',
  name: 'Example Notes',
  env: ['EXAMPLE_NOTES_API_KEY'],
  hosts: ['api.notes.example'],
  setup: ['In Example Notes, open Settings → Developers and create an API key.'],
  noteId: /^mtg_[a-z0-9]{8}$/,

  async list(ctx, { after, cursor }) {
    const q = new URLSearchParams({ since: after, limit: '50', ...(cursor ? { page_token: cursor } : {}) });
    const b = await ctx.http(`${API}/meetings?${q}`, { headers: { 'x-api-key': ctx.env.EXAMPLE_NOTES_API_KEY } });
    return {
      notes: b.meetings.map((m: ApiMeeting) => ({ id: m.id, title: m.name, at: m.started_at })),
      cursor: b.next_page_token ?? null,
    };
  },

  async fetch(ctx, id) {
    const m: ApiMeeting = await ctx.http(`${API}/meetings/${id}?include=transcript`, { headers: { 'x-api-key': ctx.env.EXAMPLE_NOTES_API_KEY } });
    return {
      id: m.id,
      title: m.name,
      start: m.started_at,
      ...(m.ended_at ? { end: m.ended_at } : {}),
      ...(m.share_url ? { url: m.share_url } : {}),
      me: m.owner,
      people: m.participants,
      ...(m.user_notes ? { myNotes: m.user_notes } : {}),
      ...(m.ai_summary ? { summary: m.ai_summary } : {}),
      ...(m.transcript ? { transcript: m.transcript.map(l => ({ text: l.text, ...(l.is_owner ? { me: true } : l.speaker_name ? { name: l.speaker_name } : {}) })) } : {}),
    };
  },
};

export default example;
