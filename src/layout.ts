import type { Block, BlockKind, Placement } from './types.ts';

// Code places the cards, not the model. The board is read left to right in the order the meeting
// runs: the goal across the top, then one column per part of the plan, each holding what's needed
// in that part, and wide visuals underneath. Units match the prototype canvas.
export const COL = 280;
export const GAP = 24;
export const fullWidth = (cols: number) => COL * cols + GAP * (cols - 1);
export const FULL = fullWidth(4);

// Height estimates, calibrated against the prototype's fonts in a browser (average glyph
// widths: body 6.7px, notes 6.9px, note titles 7.2px, board title 15.5px). The canvas measures
// real heights when it renders; these keep a headless layout close enough that cards
// neither overlap nor leave big holes.
const BODY_W = 6.7;
const LINE_H = 21;
const LINE_GAP = 3;
const LABEL_H = 19;
const PAD = 26;
const SAFETY = 1.06; // assume glyphs run a little wide so estimates err tall, not short

// Greedy word wrap: how many rows a line takes at this width.
export function rows(text: string, w: number, charW = BODY_W): number {
  const cap = Math.max(6, Math.floor((w - 34) / (charW * SAFETY)));
  let n = 1, cur = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (cur === 0) cur = word.length;
    else if (cur + 1 + word.length <= cap) cur += 1 + word.length;
    else { n++; cur = word.length; }
    while (cur > cap) { n++; cur -= cap; }
  }
  return n;
}

export function estimateHeight(b: Block, w: number): number {
  const body = (indent = 0, lineH = LINE_H, charW = BODY_W) =>
    b.lines.reduce((s, l) => s + rows(l.text, w - indent, charW) * lineH + (l.label ? LABEL_H : LINE_GAP), 0);
  switch (b.kind) {
    case 'header': return rows(b.title, w + 34, 15.5) * 39 + 34;
    case 'person': return PAD + 22 + 36 + body();
    case 'keynotes': return PAD + 26 + body();
    case 'phase': return PAD + 22 + 30 + body();
    case 'questions': return PAD + 27 + body(26) + b.lines.length * 3; // checklist rows don't share margins
    case 'number': return 116;
    case 'note': return PAD + rows(b.title, w, 7.2) * 19 + 4 + body(0, 22, 6.9);
    case 'trend': return 260;
    case 'bars': return 236;
    case 'timeline': return 158 + b.lines.length * 25;
  }
}

// The single-column order for Glance beside a video call: the goal, then the meeting in order,
// each part followed by what it needs.
const RAIL_REST: BlockKind[] = ['questions', 'note', 'number', 'person', 'timeline', 'trend', 'bars'];

export function layout(blocks: Block[]): { canvas: Placement[]; rail: string[] } {
  const canvas: Placement[] = [];
  const put = (b: Block, x: number, y: number, w: number) => {
    const h = Math.round(estimateHeight(b, w));
    canvas.push({ id: b.id, x, y, w, h });
    return y + h;
  };
  const phases = blocks.filter(b => b.kind === 'phase');
  const n = Math.max(3, phases.length);
  const full = fullWidth(n);
  const X = (c: number) => c * (COL + GAP);

  let top = 0;
  const head = blocks.find(b => b.kind === 'header');
  if (head) top = put(head, 0, 0, full) + 32;
  for (const b of blocks.filter(b => b.kind === 'keynotes')) top = put(b, 0, top, full) + GAP;

  const bottoms = Array.from({ length: n }, (_, c) => (phases[c] ? put(phases[c], X(c), top, COL) + GAP : top));
  // A block goes under the part it's needed in. If the plan has no such part, the other middle
  // part takes it; anything with no part of its own fills the shortest column.
  const colOf = (b: Block) => {
    const want = b.phase ? [b.phase, b.phase === 'learn' ? 'show' : b.phase === 'show' ? 'learn' : b.phase] : [];
    for (const slot of want) { const c = phases.findIndex(ph => ph.phase === slot); if (c >= 0) return c; }
    return bottoms.indexOf(Math.min(...bottoms));
  };
  const under: Block[][] = Array.from({ length: n }, () => []);
  for (const b of blocks) {
    if (b.kind === 'header' || b.kind === 'keynotes' || b.kind === 'phase' || b.zone === 'visual') continue;
    const c = colOf(b);
    under[c].push(b);
    bottoms[c] = put(b, X(c), bottoms[c], COL) + GAP;
  }
  // Charts are two columns wide and tuck up under the part where the numbers are presented (a
  // second one takes the columns beside it), so they fill the board instead of lengthening it.
  // The relationship timeline runs the full width underneath.
  const visuals = blocks.filter(b => b.zone === 'visual');
  const show = Math.max(0, phases.findIndex(ph => ph.phase === 'show'));
  const first = n === 3 ? Math.min(show, 1) : show - (show % 2);
  const spans = [[first, 2], n === 3 ? [first ? 0 : 2, 1] : [first ? 0 : 2, 2]];
  visuals.filter(b => b.kind !== 'timeline').forEach((b, i) => {
    if (i >= spans.length) { const y = Math.max(...bottoms); bottoms.fill(put(b, 0, y, full) + GAP); return; }
    const [c, w] = spans[i];
    const y = Math.max(...bottoms.slice(c, c + w));
    bottoms.fill(put(b, X(c), y, fullWidth(w)) + GAP, c, c + w);
  });
  let y = Math.max(top, ...bottoms);
  for (const b of visuals.filter(b => b.kind === 'timeline')) y = put(b, 0, y, full) + GAP;

  const byKind = (list: Block[]) => RAIL_REST.flatMap(k => list.filter(b => b.kind === k));
  const rail = [
    ...blocks.filter(b => b.kind === 'header' || b.kind === 'keynotes'),
    ...Array.from({ length: n }, (_, c) => [...(phases[c] ? [phases[c]] : []), ...byKind(under[c])]).flat(),
    ...byKind(visuals),
  ].map(b => b.id);
  return { canvas, rail };
}
