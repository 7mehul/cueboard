import { SourceError } from './kit.ts';
import type { Ctx, MeetingNotes, NotesConnector, SaidLine } from './kit.ts';

// Fathom, read-only, through its public API (https://developers.fathom.ai), with a personal API key
// from User Settings → API Access. Written from Fathom's API reference; not yet tried with a real
// Fathom account.
//
// Fathom has no call that returns one meeting: title, time and guests only come from the list of
// meetings, and the recordings endpoints give a summary or transcript without them. So a note's id
// carries when Fathom made the recording as well as the recording's number, and fetch() asks the
// list for the two minutes around that time, with the summary and transcript included.
//
// The list also holds meetings colleagues shared, and nothing in the API says whose key this is,
// so the connector doesn't say who "me" is: Cueboard goes by the person's About you, matching
// Fathom's speakers by the guest email it matched them to, or else by name.

const API = 'https://api.fathom.ai/external/v1';

// What Fathom's API sends, as far as this connector reads it (its OpenAPI spec, `Meeting`).
export interface FathomUser { name: string; email: string; email_domain?: string; team?: string | null }
export interface FathomInvitee { name: string | null; email: string | null; email_domain?: string | null; is_external?: boolean }
export interface FathomTranscriptItem { speaker: { display_name: string; matched_calendar_invitee_email?: string | null }; text: string; timestamp: string }
export interface FathomActionItem {
  description: string;
  user_generated: boolean;
  completed: boolean;
  recording_timestamp?: string;
  recording_playback_url?: string;
  assignee?: { name: string | null; email: string | null; team?: string | null } | null;
}
export interface FathomMeeting {
  title: string;
  meeting_title: string | null;
  recording_id: number;
  url: string;
  share_url?: string;
  created_at: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  recording_start_time?: string | null;
  recording_end_time?: string | null;
  recorded_by: FathomUser;
  calendar_invitees: FathomInvitee[];
  transcript?: FathomTranscriptItem[] | null;
  default_summary?: { template_name: string | null; markdown_formatted: string | null } | null;
  action_items?: FathomActionItem[] | null;
}
interface FathomPage { items: FathomMeeting[]; next_cursor: string | null; limit?: number | null }

// "123456789-1740848490": the recording, then when Fathom made it, in seconds.
const noteIdFor = (m: FathomMeeting) => `${m.recording_id}-${Math.floor(Date.parse(m.created_at) / 1000)}`;

const auth = (ctx: Ctx) => ({ 'x-api-key': ctx.env.FATHOM_API_KEY });

const actionLines = (items: FathomActionItem[]) =>
  items.map(a => `- ${a.description.trim()}${a.assignee?.name ? ` (${a.assignee.name})` : ''}${a.completed ? ' [done]' : ''}`).join('\n');

export function fathomNotes(m: FathomMeeting): MeetingNotes {
  // The calendar's times when there's an invite; the recording's for a call nobody scheduled.
  const [start, end] = m.scheduled_start_time ? [m.scheduled_start_time, m.scheduled_end_time] : [m.recording_start_time || m.created_at, m.recording_end_time];
  // Fathom names each voice, and matches it to an invitee's email when it can.
  const said = (t: FathomTranscriptItem): SaidLine => ({
    text: t.text,
    ...(t.speaker.display_name ? { name: t.speaker.display_name } : {}),
    ...(t.speaker.matched_calendar_invitee_email ? { email: t.speaker.matched_calendar_invitee_email } : {}),
  });
  // Action items Fathom's AI found belong with its summary; ones the person added are their own notes.
  const actions = m.action_items ?? [];
  const theirs = actions.filter(a => !a.user_generated), added = actions.filter(a => a.user_generated);
  const summary = [m.default_summary?.markdown_formatted?.trim(), theirs.length ? `Action items\n${actionLines(theirs)}` : ''].filter(Boolean).join('\n\n');
  return {
    id: noteIdFor(m),
    title: (m.title || m.meeting_title || '').trim(),
    start,
    ...(end ? { end } : {}),
    url: m.url,
    people: m.calendar_invitees.filter(p => p.name || p.email).map(p => ({ ...(p.name ? { name: p.name } : {}), ...(p.email ? { email: p.email } : {}) })),
    ...(added.length ? { myNotes: `Action items I added\n${actionLines(added)}` } : {}),
    ...(summary ? { summary } : {}),
    ...(m.transcript?.length ? { transcript: m.transcript.map(said) } : {}),
  };
}

const fathom: NotesConnector = {
  id: 'fathom',
  name: 'Fathom',
  env: ['FATHOM_API_KEY'],
  hosts: ['api.fathom.ai'],
  setup: ['In Fathom, open your User Settings, go to API Access, and generate an API key. Copy it somewhere safe.'],
  noteId: /^\d{1,15}-\d{9,11}$/,

  async list(ctx, { after, cursor }) {
    const q = new URLSearchParams({ created_after: `${after}T00:00:00Z`, ...(cursor ? { cursor } : {}) });
    const b: FathomPage = await ctx.http(`${API}/meetings?${q}`, { headers: auth(ctx) });
    return {
      notes: b.items.map(m => ({
        id: noteIdFor(m),
        title: (m.title || m.meeting_title || '').trim(),
        at: m.scheduled_start_time || m.recording_start_time || m.created_at,
      })),
      cursor: b.next_cursor ?? null,
    };
  },

  async fetch(ctx, id) {
    const [recording, made] = id.split('-');
    const t = Number(made) * 1000;
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const q = new URLSearchParams({
        created_after: new Date(t - 60_000).toISOString(),
        created_before: new Date(t + 60_000).toISOString(),
        include_summary: 'true',
        include_transcript: 'true',
        include_action_items: 'true',
        ...(cursor ? { cursor } : {}),
      });
      const b: FathomPage = await ctx.http(`${API}/meetings?${q}`, { headers: auth(ctx) });
      const m = b.items.find(x => String(x.recording_id) === recording);
      if (m) {
        const n = fathomNotes(m);
        if (!n.myNotes && !n.summary && !n.transcript) throw new SourceError(404, 'Fathom hasn’t finished the summary and transcript for this meeting yet.');
        return n;
      }
      if (!b.next_cursor) break;
      cursor = b.next_cursor;
    }
    throw new SourceError(404, 'Fathom doesn’t have this meeting any more, or this key can’t see it.');
  },
};

export default fathom;
