import { test } from 'node:test';
import assert from 'node:assert/strict';
import example from '../../connectors/example.ts';
import { checkConnector, fakeApi, reply } from '../../connectors/testing.ts';

// The test to copy along with connectors/example.ts. The fake API answers the way the real one
// does (copy a real answer from the app's API docs, with made-up people), and checkConnector runs
// the connector against it.

const KEY = 'test-key-not-real';
const owner = { name: 'Alex Rivera', email: 'alex@cueboard.example' };
const meetings = [
  {
    id: 'mtg_a1b2c3d4', name: 'Call with Maya (Larkspur)', started_at: '2026-10-08T14:00:00Z', ended_at: '2026-10-08T14:30:00Z',
    share_url: 'https://app.notes.example/m/a1b2c3d4', owner,
    participants: [owner, { name: 'Maya Chen', email: 'maya@larkspur.example' }],
    user_notes: 'Maya asked about churn for small teams twice.',
    ai_summary: '- Churn for small teams\n- Alex to send the cohort table',
    transcript: [
      { speaker_name: 'Maya Chen', text: 'How does churn look for the small teams?' },
      { is_owner: true, text: 'We’re at 3.1% a month for teams under ten seats.' },
    ],
  },
  {
    id: 'mtg_e5f6g7h8', name: 'Weekly team sync', started_at: '2026-10-19T16:00:00Z', owner,
    participants: [owner, { name: 'Priya Shah' }], ai_summary: '- Shipped Today view',
  },
];

// The app's API, as far as the connector uses it: two pages of meetings, then each one.
const api = () => fakeApi({
  'GET /v1/meetings': ({ url }) => url.searchParams.get('page_token') === 'p2'
    ? { meetings: [meetings[1]], next_page_token: null }
    : { meetings: [meetings[0]], next_page_token: 'p2' },
  'GET /v1/meetings/:id': ({ params }) => meetings.find(m => m.id === params.id) ?? reply(404),
});

test('the example connector passes every check', async () => {
  const { listed, notes, docs } = await checkConnector(example, { env: { EXAMPLE_NOTES_API_KEY: KEY }, api: api() });
  assert.deepEqual(listed.map(n => n.id), ['mtg_a1b2c3d4', 'mtg_e5f6g7h8'], 'both pages');
  // What it made of the API's answers.
  assert.equal(notes[0].url, 'https://app.notes.example/m/a1b2c3d4');
  assert.match(docs[0].text, /^With: Maya Chen <maya@larkspur\.example>$/m, 'you are not one of the people you met');
  assert.match(docs[0].text, /^Them \(Maya Chen\): How does churn look/m);
  assert.match(docs[0].text, /^Me: We’re at 3\.1%/m);
  assert.equal(docs[1].kind, 'notes', 'no transcript, so notes');
});

test('the key goes in the x-api-key header', async () => {
  const a = api();
  await checkConnector(example, { env: { EXAMPLE_NOTES_API_KEY: KEY }, api: a });
  assert.ok(a.calls.every(c => c.headers.get('x-api-key') === KEY));
});
