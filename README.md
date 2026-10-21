# Cueboard

Three parts:

- **The canvas** (`app/`): a freeform board, like Apple Freeform. Everything on it can be moved,
  resized, restyled, connected or deleted.
- **The board engine** (`src/`): drafts the starting arrangement from what's known about a meeting.
- **The judgment layer** (`src/intel/`): a model reads the meeting and decides what matters; the
  engine turns that into a board and checks it. Works with any model behind a small interface.

The engine only places things once. After that the board is the user's.

## The canvas

```bash
node scripts/serve.ts          # http://localhost:5180, rebuilds on every change
node scripts/build-app.ts      # one-off build to dist/cueboard.html (single file, publishable as a Claude artifact)
```

What you can do on it:

| Action | How |
| --- | --- |
| Add something | Dock at the bottom: note, text, card, person, checklist, shape, arrow, image, chart, number. Or double-click empty canvas for a note |
| Images | Paste one (⌘V), drop files onto the canvas, or use Image in the dock. Big images are scaled to 1800px; corners keep the proportions (Shift frees them) |
| Draw | Draw in the dock: pen, highlighter and eraser (P / H / E), six ink colors, three widths. Strokes drawn close together become one drawing you can move, resize and recolor. Esc or Done to stop |
| Select several | Drag across empty canvas, or Shift-click. ⌘A selects everything |
| Move, line up | Drag. Edges and centers snap to nearby items; hold Option/Alt to place freely. Arrow keys nudge (Shift for 10px) |
| Resize | Eight handles on whatever's selected; hold Shift on a corner to keep the proportions |
| Connect | Drag from a dot beside the selected item onto another, or add an arrow and drop its ends on things. Arrows follow when you move |
| Label an arrow | Double-click it, press Enter with it selected, or use Label in its toolbar. Enter saves, Esc cancels, an empty label removes it |
| Arrange | With several selected: align edges or centers, space evenly, bring to front or send to back |
| Group | ⌘G (or Group in the toolbar) makes the selection one item: clicking any member picks up the whole group, and it moves, aligns, copies and tidies as a block. Double-click a member to work on it alone, Esc to step back out. ⌘⇧G ungroups |
| Rotate | Drag the round handle above what's selected, or ⌘-drag a corner handle. It catches at 0°, 45° and 90°; Shift turns in 15° steps. Several items or a group turn around their shared center. Straighten resets the tilt |
| Copy | ⌘C / ⌘X / ⌘V, ⌘D to duplicate. Pasted text becomes a note |
| Move around | Scroll or trackpad to pan, pinch or ⌘-scroll to zoom, hold Space and drag |
| On a touchscreen | Drag empty canvas to pan; press and hold it, then drag, for a selection box. Press and hold an item to start selecting several, then tap more to add or remove them (or use Select more and Select all in the toolbar). Tap empty canvas to finish |
| During the meeting | Glance: read-only, tap to zoom, search, jump bar, timer, live notes |
| Beside the call | Float (or F) opens a small window that stays on top of Zoom, Meet or Teams in Chrome and Edge. It shows the board's own cards in one column, run of show first; controls appear when the pointer is over it. Click a card to see where each line came from (S shows every source; numbers always show theirs). / finds a name or number, ↑↓ move between cards, C shrinks it to one card with the goal and the next question in large type, N jots a note onto the board, T runs the timer, H shrinks it to a small pill with just the timer and Show. Other browsers get an ordinary window; where pop-ups aren't allowed it docks in the page corner |

Images live outside the board data: in the browser's IndexedDB locally, or in the artifact's asset
store when the page is published in Claude (that path isn't tested yet), so saved boards stay small.

The floating window only shows up for the other side if you share your entire screen; share a
window or a tab instead (it says so the first time it opens).

Lines the engine drafted keep a green bar if they came from a past meeting, a dashed box if
they're unknown, and the source they came from (hover a line, or click a card in Float). Rewriting a line makes it yours and removes the marker. New boards can start from
the sample meetings (boards menu → New board from a meeting) until real meeting data is connected.

## The board engine

Turns a **meeting packet** (everything known about one meeting) into a **board**: which blocks
appear, what each says, where it sits, and what's still unknown. Pure TypeScript, deterministic,
no model calls. Node 26 runs the `.ts` files directly. On its own it's the fallback; with the
judgment layer it's the part that guarantees the rules.

```
packet ─▶ frame ─▶ playbook ─▶ filter facts ─▶ compose blocks ─▶ budget ─▶ layout ─▶ board
          type,     slots for      drop unsourced,   person, key notes,   drop least     3 columns,
          first or  type × stage   private, stale,   numbers, notes,      important      notes fill gaps,
          follow-up                unconfirmed,      questions, trend,    blocks         visuals below,
                                   conflicting       bars, timeline                      rail for Glance
```

## The judgment layer

Rules can't tell what a meeting is for. The same packet means different things to a founder, an
AE, a VC or a head of partnerships, so a model makes the judgment calls and code keeps the
guarantees:

```
packet ─▶ understand ─▶ rank ─▶ engine (compose, budget, layout) ─▶ checker ─▶ board
          model reads    model scores      code: sources, privacy,     any broken rule
          persona,       every fact,       must-show items, limits     → the rules board
          process, step, number, person,
          goal, what     question 0–3
          decides it     + up to 4 questions
```

| The model decides | Code decides (the model can't override) |
| --- | --- |
| Meeting type, process and step ("Fundraise · intro call") | First meeting vs. follow-up (from history) |
| The goal, what decides it, an opener and the ask, marked *suggested* | The user's own goal, opener and ask win; line lengths are enforced |
| What decides the meeting, what they want, risks | Every claim needs a source; nothing private or unconfirmed reaches the model or the board |
| Which facts, people, numbers and questions matter, and why | Bad news, overdue promises and objections they raised always show |
| Whose numbers matter (ours, theirs, both) | Their numbers only for companies actually in the meeting |
| New questions worth asking | Lengths, block budget, layout, no duplicates |

If a model step fails, that step falls back to the rules; if the model-shaped board breaks any
rule, the rules board ships instead. Nothing branches on persona: `src/intel/knowledge.ts` is a
library of six personas (founder, discovery, AE, head of sales, investor, head of global
partnerships) with their processes, stages, wants and needs, given to the model as context.

Providers (`src/intel/providers/`):

- `claude.ts`: the official Anthropic SDK with structured output. Model `claude-opus-5-5` by
  default, `CUE_MODEL` to change it. Server-side refusal fallback is on by default (it drops it
  automatically if the account doesn't accept it).
- `browser.ts`: inside a published Claude artifact, using the viewer's own Claude through the
  `sample` capability, so no key touches the page.
- `scripted.ts`: canned answers for tests.

Another provider is one function: `json({system, prompt, schema})` returning a schema-valid object.

```bash
node scripts/eval.ts                       # six persona scenarios: rules vs. model (needs ANTHROPIC_API_KEY)
node scripts/eval.ts --only partnerships-first-meeting --verbose
node scripts/replay.ts                     # rebuild the last model run's boards from its saved answers, free
node scripts/scale.ts --n 500000 --fuzz-model   # a model that answers at random still can't break a rule
```

Where it stands: the rules engine alone passes 0 of 6 scenarios (wrong meeting type, no goal,
noise shown, the VC's portfolio conflict missed). With the judgment a good model should reach,
scripted in `test/intel.test.ts`, all 6 pass, so the engine can express every board. The first
run with `claude-opus-5-5` passed 5 of 6, at about 9,500 tokens and 25–35 seconds per board. The
miss was writing, not judgment: goals too long for a board line, and shorthand from the user's
notes ("Test H1–H3"). The prompt now gives the model the line limits and rules out shorthand, the
brief also drafts an opener and an ask, and a drafted line that still runs long keeps its first
whole clause. The second run passed 6 of 6.

## Memory: reading what you paste

Cueboard remembers people, not conversations. Memory is typed records about the people and
companies you meet: what happened, facts about them, numbers you shared, promises both ways,
objections and your answers, things not to repeat. Every record points at the document it came
from. Preparing for a meeting is a lookup by who's coming, not a text search.

```
paste ─▶ read (model) ─▶ check (code) ─▶ review (you) ─▶ memory ─▶ next board
         people, facts,    the quote must be     uncheck anything      typed records,
         numbers,          in the text word      wrong; nothing is     each with its
         promises, ...     for word; a number    saved until you've    source
                           must be in its quote; looked
                           match known people;
                           skip what's known
```

- In the app: boards menu → Prep from emails and notes (or Paste emails and notes on an empty
  board). Paste the invite, emails, your notes, someone's profile; check what it found; save and
  get the board. After the call, Add notes on that board. Upcoming meetings in memory are listed
  in the boards menu.
- Reading needs a model. Locally, run `node scripts/serve.ts` in a terminal where
  `ANTHROPIC_API_KEY` is set: the server makes the model calls, so the key never reaches the page,
  and it only answers the page it serves. In a published artifact, the viewer's own Claude is used.
  `node scripts/serve.ts --fake-model` answers for the sample documents in `scenarios/docs.ts`
  only, for trying the flow without a key.
- Memory is saved in the browser (or the artifact's storage), one per user.

```bash
node scripts/eval-extract.ts --verbose     # a real model reads the six sample documents; scored, then the follow-up board
```

## Run it

```bash
npm test                                   # 74 tests: behaviour, the checker catching each broken rule, the judgment layer, memory
node scripts/show.ts followup              # print a board as text (first | followup | seed:<n>)
node scripts/scale.ts --n 1000000          # generate, build and check a million boards
node scripts/scale.ts --n 200000 --edge 0.5   # same, with planted problems in half the packets
node scripts/gallery.ts                    # render sample boards to reports/gallery.html
npm run typecheck
```

## Files

| File | What it does |
| --- | --- |
| `src/types.ts` | Packet (input) and Board (output) |
| `src/frame.ts` | Meeting type (keyword rule, swappable for a model) and first vs. follow-up |
| `src/playbooks.ts` | What a good board holds per meeting type and stage, and the block budget per meeting length |
| `src/facts.ts` | Which facts may appear at all, conflict handling, scoring |
| `src/compose.ts` | Builds each block: person, key notes, numbers, trend, bars, timeline, quick notes, questions |
| `src/layout.ts` | Places blocks on the canvas and orders the single-column rail |
| `src/check.ts` | Every rule a board must keep, checked from the packet independently of the engine |
| `src/models.ts` | Model-agnostic interfaces for classify, extract and rewrite |
| `src/intel/llm.ts` | The provider interface and schema validation |
| `src/intel/schemas.ts` | What the model must answer: meeting brief and ranking |
| `src/intel/context.ts` | What the model sees: the meeting, the user, context docs, candidate ids (private data filtered out) |
| `src/intel/steps.ts`, `smart.ts` | Understand and rank prompts; the pipeline with its fallbacks |
| `src/intel/knowledge.ts` | Personas, processes, situations, wants and needs |
| `scenarios/` | Six persona situations with what a right board shows, hides and asks; `docs.ts` is a founder–investor story as pasted documents |
| `src/memory/extract.ts` | Reading a document into memory: the model's step, the checks, and saving what the user kept |
| `src/memory/packet.ts` | A meeting's packet, as memory seen from that meeting |
| `src/intel/providers/server.ts` | The page's model through the local server (`scripts/serve.ts`) |
| `src/export.ts` | Converts an engine board into canvas items, keeping memory and gap markers |
| `app/board.js`, `app/board.css`, `app/index.html` | The freeform canvas (from the prototype, extended) |
| `app/float.css` | The floating in-call window (its code is the float section of `board.js`) |
| `app/engine-entry.ts` | What the canvas gets from the engine: sample meetings and `boardFor()` |
| `synth/` | Seeded synthetic packet generator that plants realistic problems |
| `test/fixtures.ts` | The Dana Ruiz first meeting and follow-up |

## Rules the checker enforces

- Every claim has a valid source; nothing from another user's private data
- Nothing about an unconfirmed person; no low-confidence, future-dated or stale facts
- No conflicting facts shown together; no fact or line shown twice
- Every line and title within its length limit; gaps in brackets
- Memory flags match their sources; follow-ups say where you left off
- Numbers match the latest data; "was X" matches what you actually shared; bad news is marked and prepared for
- "Up" and "down" match what the numbers did
- Line charts need 3–12 points, bars 2–6, timelines 2–6 past events and follow-ups only
- Within the block budget; no overlapping cards; the rail lists every block once

## Not done yet

- The engine's layout heights are estimates. The canvas restacks each column with real heights
  once, when a drafted board first opens.
- The rules engine's meeting-type guess from the title alone is right 81% of the time; with a model
  the type comes from the brief.
- Six scenarios are a smoke test, not an eval set. Real design-partner meetings should replace them.
- Synthetic text comes from templates, so it tests the logic, not the writing quality.
