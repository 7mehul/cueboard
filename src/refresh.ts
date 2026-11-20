// Bringing a drafted board up to date without undoing anyone's work. The board keeps a copy of
// what was drafted last time; comparing against it tells the engine's work from the user's:
// - a card still as drafted takes the new content, where it already sits;
// - inside a card, line by line: a line the user wrote or changed is theirs (the Goal they filled
//   in), the lines they didn't touch take the new version ("Where we left off"), a line they
//   deleted stays deleted, a ticked question stays ticked;
// - a card the user added is theirs; one they deleted stays deleted;
// - a card the engine no longer draws goes, unless the user had changed it;
// - a card the engine draws for the first time is added, clear of the others.
// Position, size, colour and grouping are never the engine's to change once on the canvas, with
// one exception: when the plan's parts change order, cards the user hasn't moved follow their part.

export type El = { id: string; type: string; x: number; y: number; w: number; h: number } & Record<string, unknown>;
type Line = Record<string, unknown>;

const STYLE = new Set(['id', 'x', 'y', 'w', 'h', 'rot', 'group', 'color', 'ink', 'fill']);
const LISTS = new Set(['lines', 'items']);
const j = (v: unknown) => JSON.stringify(v ?? null);
const rest = (e: El) => j(Object.keys(e).filter(k => !STYLE.has(k) && !LISTS.has(k)).sort().map(k => [k, e[k]]));
const content = (e: El) => j(Object.keys(e).filter(k => !STYLE.has(k)).sort().map(k => [k, e[k]]));

// Labelled lines ("Goal", "Where we left off") are matched by label, the rest by what they say,
// so a question ticked off keeps its place.
const keyOf = (l: Line) => (typeof l.label === 'string' && l.label ? 'L:' + l.label : 'T:' + String(l.text ?? ''));
function mergeLines(mine: Line[], drafted: Line[], next: Line[]): Line[] {
  const map = (ls: Line[]) => new Map(ls.map(l => [keyOf(l), l]));
  const was = map(drafted), have = map(mine), will = map(next);
  const out: Line[] = [];
  for (const n of next) {
    const k = keyOf(n), c = have.get(k), b = was.get(k);
    if (c && b) out.push(j(c) === j(b) ? n : c);   // yours if you changed it, else the new version
    else if (c) out.push(c);
    else if (!b) out.push(n);                      // new; one you deleted stays deleted
  }
  for (const c of mine) {
    const k = keyOf(c), b = was.get(k);
    if (will.has(k)) continue;
    if (!b || j(b) !== j(c)) out.push(c);          // your own lines, and ones you changed that the engine dropped
  }
  return out;
}

export interface Refreshed { elements: El[]; updated: number; added: number; removed: number; kept: number }

export function mergeRefresh(current: El[], drafted: El[], next: El[]): Refreshed {
  const before = new Map(drafted.map(e => [e.id, e]));
  const have = new Set(current.map(e => e.id));
  const fresh = new Map(next.map(e => [e.id, e]));
  const out: El[] = [];
  let updated = 0, added = 0, removed = 0, kept = 0;
  for (const e of current) {
    const was = before.get(e.id), now = fresh.get(e.id);
    if (!was || was.type !== e.type) { out.push(e); continue; }
    const touched = content(e) !== content(was);
    if (!now || now.type !== e.type) {
      if (touched) { out.push(e); kept++; } else removed++;
      continue;
    }
    const merged = {} as Record<string, unknown>;
    for (const k of Object.keys(e)) if (STYLE.has(k)) merged[k] = e[k];
    const src = rest(e) === rest(was) ? now : e;
    for (const k of Object.keys(src)) if (!STYLE.has(k) && !LISTS.has(k)) merged[k] = src[k];
    for (const k of LISTS) {
      const mine = e[k], b = was[k], n = now[k];
      if (Array.isArray(mine) && Array.isArray(b) && Array.isArray(n)) merged[k] = mergeLines(mine as Line[], b as Line[], n as Line[]);
      else if (mine !== undefined || n !== undefined) merged[k] = j(mine) === j(b) ? n : mine;
      if (merged[k] === undefined) delete merged[k];
    }
    const m = merged as El;
    // A new goal can reorder the plan. A card still in the column it was drafted in follows its
    // part to the new column; one the user moved sideways stays where they put it.
    const follows = e.x === was.x && now.x !== was.x;
    if (follows) { m.x = now.x; m.y = now.y; }
    const resized = e.w === was.w && now.w !== was.w; // likewise a width nobody changed
    if (resized) m.w = now.w;
    if (content(m) !== content(e) || follows || resized) updated++;
    if (touched) kept++;
    out.push(m);
  }
  for (const n of next) {
    if (have.has(n.id) || before.has(n.id)) continue;
    out.push(placeClear(n, out));
    added++;
  }
  return { elements: out, updated, added, removed, kept };
}

// Where the engine wanted it, or straight below whatever is already in that column.
const GAP = 24;
function placeClear(n: El, others: El[]): El {
  const hits = (y: number) => others.some(o => o.x < n.x + n.w && n.x < o.x + o.w && o.y < y + n.h && y < o.y + o.h);
  if (!hits(n.y)) return n;
  const below = others.filter(o => o.x < n.x + n.w && n.x < o.x + o.w).reduce((m, o) => Math.max(m, o.y + o.h), n.y);
  return { ...n, y: Math.round(below + GAP) };
}
