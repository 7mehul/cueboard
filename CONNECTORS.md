# Adding your notes app

Cueboard reads past meetings from the app you take notes in, so the next board with those people
knows where you left off. Granola is the only one so far. Adding another app takes one file and
its test. Cueboard handles the rest: the import screen, the requests, retries, error messages,
and checking what comes back.

You need an app with an API that gives people a key for their own notes. You don't need the app
itself to write the connector: the test runs it against a fake copy of the API.

## The steps

1. Copy [`connectors/example.ts`](connectors/example.ts) to `connectors/<app>.ts`, and
   [`test/connectors/example.test.ts`](test/connectors/example.test.ts) to
   `test/connectors/<app>.test.ts`. The example is a complete connector for a made-up app; the
   steps below change it into yours.
2. Describe the app (below): its id, name, settings, hosts, setup steps and what its note ids look
   like.
3. Write `list()` and `fetch()`: turn the app's API answers into Cueboard's shape.
4. In the test, make the fake API answer the way the real one does. Copy an answer from the app's
   API docs and swap in made-up people. `checkConnector` then runs your connector against it.
5. Add it to [`connectors/index.ts`](connectors/index.ts).
6. Run `npm test` and `npm run typecheck`.
7. If you have an account, try it for real: put the key in `.env` and run `npm start`, then
   choose **Import meeting notes** in the boards menu. Say in the pull request whether you did.
   The README lists what has and hasn't been tried with a real account.

## Describing the app

```ts
const example: NotesConnector = {
  id: 'example',
  name: 'Example Notes',
  env: ['EXAMPLE_NOTES_API_KEY'],
  hosts: ['api.notes.example'],
  setup: ['In Example Notes, open Settings → Developers and create an API key.'],
  noteId: /^mtg_[a-z0-9]{8}$/,
  // list() and fetch() follow
};
```

| Field | What it's for |
| --- | --- |
| `id` | Lowercase, like `fireflies`. Every note's id in people's memory starts with it, so it never changes once released. |
| `name` | The app as people know it. The page says "Bring in your Fireflies notes". |
| `env` | The settings it needs, by name. Cueboard offers the app once they're all set, and passes only these to your connector. |
| `hosts` | Every host your connector calls. `ctx.http` refuses any other host, and anything that isn't https. |
| `setup` | How to get a key, written for someone who has never seen an API. The page adds where to put it and the restart. |
| `noteId` | What a note id looks like, anchored with `^` and `$`. Ids from the page are checked against it before your code sees them, so you can put an id in a URL path. |

## list() and fetch()

Both get a `ctx`:

- `ctx.env` holds your settings: `ctx.env.EXAMPLE_NOTES_API_KEY`.
- `ctx.http(url, { method, headers, body })` returns the API's JSON. If the API says to slow down,
  it waits and tries again. Any other answer that isn't a success becomes a `SourceError`, which
  the page shows in plain words ("Example Notes didn't accept the key. Check
  EXAMPLE_NOTES_API_KEY…"). Use it for every call. Don't add an HTTP library.

`list(ctx, { after, cursor })` returns a page of notes from meetings on or after `after`
(YYYY-MM-DD): `{ notes: [{ id, title, at }], cursor }`. `at` is when the meeting was, or when the
note was made if that's all the list gives. Return the API's next-page cursor, or `null` on the
last page.

`fetch(ctx, id)` returns one note, whole:

| Field | |
| --- | --- |
| `id`, `title` | The note's id and the meeting's title |
| `start`, `end` | When the meeting started and ended: ISO 8601 with a zone, like `2026-10-08T14:00:00Z` |
| `url` | Where to open the note in the app (https). Boards link back to it |
| `me` | `{ name, email }` for whose account this is, so they're "Me" and not someone they met |
| `people` | Everyone in the meeting, `{ name, email }`, either one if that's all the app knows. It's fine if `me` is among them |
| `myNotes` | What the person wrote themselves |
| `summary` | What the app's AI wrote |
| `transcript` | Lines of `{ text, me, name, label }`, or text the app already labelled ("Maya: …") |

Leave out anything the app doesn't have.

Keep `myNotes` and `summary` apart. Cueboard labels the summary as the app's AI, so what it
remembers quotes your own notes and the transcript ahead of an AI's paraphrase.

In a transcript, set `me: true` on the person's own lines when the app says which they are. Set
`name` when it knows who spoke, and `label` when it only tells voices apart ("Speaker 2").

## The test

```ts
const api = () => fakeApi({
  'GET /v1/meetings': ({ url }) => url.searchParams.get('page_token') === 'p2'
    ? { meetings: [meetings[1]], next_page_token: null }
    : { meetings: [meetings[0]], next_page_token: 'p2' },
  'GET /v1/meetings/:id': ({ params }) => meetings.find(m => m.id === params.id) ?? reply(404),
});

test('the example connector passes every check', async () => {
  const { notes, docs } = await checkConnector(example, { env: { EXAMPLE_NOTES_API_KEY: 'test-key-not-real' }, api: api() });
  assert.match(docs[0].text, /^Me: We’re at 3\.1%/m);
});
```

Routes are keyed by method and path. `:id` matches one part of the path, and a route can answer
with JSON, with `reply(status)`, or with a function of the request. A GraphQL API is one route,
`'POST /graphql'`, that looks at `body.query`.

`checkConnector` fails, saying what to fix, when:

- the description is off: the id's form, the names in `env` and `hosts`, empty setup steps, or a
  `noteId` that isn't anchored;
- `list()` or `fetch()` give back something Cueboard would have to fix or drop: an id that doesn't
  match `noteId`, a date that isn't ISO 8601, a non-https link, an email that isn't one, a person
  with neither name nor email, or a note with no notes, summary or transcript;
- paging goes wrong: the same cursor twice, or the same note twice;
- the key travels in a URL, or a call goes without it;
- the API refuses the key and your connector hides it: returning an empty list instead of letting
  the error through.

It gives back what it got (`listed`, `notes`, `docs`), so your test can check what your connector
made of the API's answers. `docs` holds what memory will actually read.

## What reviewers look for

- **It only reads.** Use POST only where the API reads through POST, like GraphQL.
- **The key goes in a header,** never in the URL, where logs and proxies keep it.
- **Errors come through.** Catch an error only to say something clearer, by throwing
  `new SourceError(status, 'what happened')`. Granola's connector does this for notes that aren't
  finished yet.
- **No new dependencies.**
- **Made-up people in the test,** on reserved domains (`example.com`, `*.example`), never real
  notes.
- **Long transcripts in pages are fine:** follow the API's paging inside `fetch()` (Granola's
  connector does this when a transcript is too long to come inline).

[`connectors/granola.ts`](connectors/granola.ts) is a real one to compare with.

## Not a notes app?

- **Calendars:** any calendar app already works through its private link (README, "Calendar:
  boards without asking"), so a calendar connector is rarely needed.
- **Email, CRMs and the rest:** there's no shared shape for these yet. Open an issue first, so we
  can work out together what Cueboard should read from them.
