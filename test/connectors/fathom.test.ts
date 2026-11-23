import { test } from 'node:test';
import assert from 'node:assert/strict';
import fathom from '../../connectors/fathom.ts';
import type { FathomMeeting } from '../../connectors/fathom.ts';
import { connectorContext } from '../../connectors/kit.ts';
import { checkConnector, fakeApi } from '../../connectors/testing.ts';

// Fathom's API as its OpenAPI spec describes it (developers.fathom.ai): one list of meetings, a
// page at a time, newest first, with the summary, transcript and action items only when asked
// for. The reference has no whole example answer, so these are built from the spec's Meeting
// schema, with made-up people.

process.env.TZ = 'America/New_York';
const KEY = 'fathom-test-key-not-real';
const alex = { name: 'Alex Rivera', email: 'alex@cueboard.example', email_domain: 'cueboard.example', team: 'Founders' };
// The person reading, as their About you says.
const self = { name: 'Alex Rivera', email: 'alex@cueboard.example' };

const meetings: FathomMeeting[] = [
  {
    title: 'Weekly team sync', meeting_title: null, recording_id: 123456790,
    url: 'https://fathom.video/calls/123456790', share_url: 'https://fathom.video/share/kq2Xz8wPfT',
    created_at: '2026-10-19T16:25:40Z',
    // Nobody scheduled it: no calendar times, the recording's instead.
    scheduled_start_time: null, scheduled_end_time: null,
    recording_start_time: '2026-10-19T16:00:12Z', recording_end_time: '2026-10-19T16:24:58Z',
    recorded_by: alex,
    calendar_invitees: [
      { name: 'Alex Rivera', email: 'alex@cueboard.example', email_domain: 'cueboard.example', is_external: false },
      { name: 'Priya Shah', email: null, email_domain: null, is_external: false },
      { name: null, email: null, email_domain: null, is_external: false },
    ],
    transcript: null,
    default_summary: { template_name: 'General', markdown_formatted: '## Meeting Purpose\nWeekly sync.\n\n## Key Takeaways\n- Shipped the Today view' },
    action_items: [],
  },
  {
    title: 'Call with Maya (Larkspur)', meeting_title: 'Alex <> Maya: Larkspur intro', recording_id: 123456789,
    url: 'https://fathom.video/calls/123456789', share_url: 'https://fathom.video/share/Hn3pQwLx9a',
    created_at: '2026-10-08T14:31:05Z',
    scheduled_start_time: '2026-10-08T14:00:00Z', scheduled_end_time: '2026-10-08T14:30:00Z',
    recording_start_time: '2026-10-08T14:01:12Z', recording_end_time: '2026-10-08T14:30:55Z',
    recorded_by: alex,
    calendar_invitees: [
      { name: 'Alex Rivera', email: 'alex@cueboard.example', email_domain: 'cueboard.example', is_external: false },
      { name: 'Maya Chen', email: 'maya@larkspur.example', email_domain: 'larkspur.example', is_external: true },
    ],
    transcript: [
      { speaker: { display_name: 'Maya Chen', matched_calendar_invitee_email: 'maya@larkspur.example' }, text: 'How does churn look for the small teams?', timestamp: '00:01:04' },
      { speaker: { display_name: 'Alex Rivera', matched_calendar_invitee_email: 'alex@cueboard.example' }, text: 'We’re at 3.1% a month for teams under ten seats.', timestamp: '00:01:11' },
      { speaker: { display_name: 'Sam (Larkspur)', matched_calendar_invitee_email: null }, text: 'Is that before or after the price change?', timestamp: '00:01:30' },
    ],
    default_summary: { template_name: 'General', markdown_formatted: '## Key Takeaways\n- Churn for small teams came up twice' },
    action_items: [
      { description: 'Send Maya the cohort table', user_generated: false, completed: false, recording_timestamp: '00:21:40', recording_playback_url: 'https://fathom.video/calls/123456789?timestamp=1300', assignee: { name: 'Alex Rivera', email: 'alex@cueboard.example', team: 'Founders' } },
      { description: 'Ask Sam about the price change timing', user_generated: true, completed: false, recording_timestamp: '00:01:30', recording_playback_url: 'https://fathom.video/calls/123456789?timestamp=90', assignee: { name: null, email: null, team: null } },
    ],
  },
];

// Fathom's cursors are opaque; base64 of the page number, like its examples.
const cursorFor = (n: number) => Buffer.from(JSON.stringify({ page_num: n })).toString('base64');
const pageOf = (c: string | null) => (c ? JSON.parse(Buffer.from(c, 'base64').toString()).page_num : 1);

const fathomApi = (all: FathomMeeting[] = meetings, size = 1) => fakeApi({
  'GET /external/v1/meetings': ({ url }) => {
    const q = url.searchParams;
    const after = q.get('created_after'), before = q.get('created_before');
    const found = all
      .filter(m => (!after || Date.parse(m.created_at) > Date.parse(after)) && (!before || Date.parse(m.created_at) < Date.parse(before)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      // What's left out unless asked for.
      .map(({ transcript, default_summary, action_items, ...m }) => ({
        ...m,
        ...(q.get('include_transcript') === 'true' ? { transcript } : {}),
        ...(q.get('include_summary') === 'true' ? { default_summary } : {}),
        ...(q.get('include_action_items') === 'true' ? { action_items } : {}),
      }));
    const n = pageOf(q.get('cursor'));
    const items = found.slice((n - 1) * size, n * size);
    return { limit: size, next_cursor: n * size < found.length ? cursorFor(n + 1) : null, items };
  },
});

test('the Fathom connector passes every check', async () => {
  const api = fathomApi();
  const { listed, notes, docs } = await checkConnector(fathom, { env: { FATHOM_API_KEY: KEY }, api, self });
  assert.deepEqual(listed.map(n => n.id), ['123456790-1792427140', '123456789-1791469865'], 'both pages, newest first');
  assert.deepEqual(listed.map(n => n.at), ['2026-10-19T16:00:12Z', '2026-10-08T14:00:00Z'], 'the calendar’s time, or the recording’s');

  const [sync, call] = docs;
  assert.equal(notes[1].url, 'https://fathom.video/calls/123456789');
  assert.equal(call.id, 'fathom-123456789-1791469865');
  assert.match(call.text, /^Meeting: 2026-10-08 10:00–10:30$/m);
  assert.match(call.text, /^With: Maya Chen <maya@larkspur\.example>$/m, 'you are not one of the people you met');
  assert.match(call.text, /^Them \(Maya Chen\): How does churn look/m);
  assert.match(call.text, /^Me: We’re at 3\.1%/m);
  assert.match(call.text, /^Them \(Sam \(Larkspur\)\): Is that before or after/m, 'a voice Fathom couldn’t match is still named');
  assert.match(call.text, /AI SUMMARY \(written by Fathom, not by me\)\n## Key Takeaways[\s\S]*Action items\n- Send Maya the cohort table \(Alex Rivera\)/);
  assert.match(call.text, /MY NOTES\nAction items I added\n- Ask Sam about the price change timing\n/, 'an action item the person added is theirs, not the AI’s');

  assert.equal(sync.kind, 'notes', 'no transcript, so notes');
  assert.match(sync.text, /^With: Priya Shah$/m, 'a guest with no name or email is left out');
  assert.match(sync.text, /^Meeting: 2026-10-19 12:00–12:24$/m);
});

test('the key goes in the X-Api-Key header, and a note is fetched with its summary and transcript', async () => {
  const api = fathomApi();
  await checkConnector(fathom, { env: { FATHOM_API_KEY: KEY }, api, self });
  assert.ok(api.calls.every(c => c.headers.get('x-api-key') === KEY));
  const fetches = api.calls.filter(c => c.url.searchParams.get('include_transcript') === 'true');
  assert.equal(fetches.length, 2, 'one call per note');
  assert.ok(fetches.every(c => c.url.searchParams.get('include_summary') === 'true' && c.url.searchParams.has('created_before')));
});

test('a meeting Fathom hasn’t finished, or no longer has, says so', async () => {
  const unfinished = { ...meetings[1], transcript: null, default_summary: null, action_items: null };
  const ctx = connectorContext(fathom, { FATHOM_API_KEY: KEY }, { fetch: fathomApi([unfinished]).fetch });
  await assert.rejects(fathom.fetch(ctx, '123456789-1791469865'), /hasn’t finished the summary and transcript/);
  await assert.rejects(fathom.fetch(ctx, '999999999-1791469865'), /doesn’t have this meeting any more/);
});

test('a busy minute: the meeting is found on a later page of the window', async () => {
  const neighbours = [1, 2, 3].map(i => ({ ...meetings[1], recording_id: 123456789 + i * 1000, created_at: `2026-10-08T14:31:0${5 + i}Z` }));
  const api = fathomApi([meetings[1], ...neighbours], 1);
  const ctx = connectorContext(fathom, { FATHOM_API_KEY: KEY }, { fetch: api.fetch });
  const n = await fathom.fetch(ctx, '123456789-1791469865');
  assert.equal(n.title, 'Call with Maya (Larkspur)');
  assert.equal(api.calls.length, 4, 'followed the window’s pages to it');
});

test('a meeting a colleague recorded and shared: you are still “Me”, and they are not', async () => {
  const priya = { name: 'Priya Shah', email: 'priya@cueboard.example', email_domain: 'cueboard.example', team: 'Founders' };
  const shared: FathomMeeting = {
    ...meetings[1], recorded_by: priya,
    calendar_invitees: [...meetings[1].calendar_invitees, { name: 'Priya Shah', email: 'priya@cueboard.example', email_domain: 'cueboard.example', is_external: false }],
    transcript: [
      { speaker: { display_name: 'Priya Shah', matched_calendar_invitee_email: 'priya@cueboard.example' }, text: 'Maya, this is Alex.', timestamp: '00:00:10' },
      { speaker: { display_name: 'Alex Rivera', matched_calendar_invitee_email: null }, text: 'Thanks for making time.', timestamp: '00:00:20' },
    ],
  };
  const { docs } = await checkConnector(fathom, { env: { FATHOM_API_KEY: KEY }, api: fathomApi([shared]), self });
  assert.match(docs[0].text, /^Them \(Priya Shah\): Maya, this is Alex\.$/m, 'the colleague who recorded it is not you');
  assert.match(docs[0].text, /^Me: Thanks for making time\.$/m, 'your voice, by your name when Fathom didn’t match an email');
  assert.match(docs[0].text, /^With: Maya Chen <maya@larkspur\.example>, Priya Shah <priya@cueboard\.example>$/m);
});
