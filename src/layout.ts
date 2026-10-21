import type { Block, BlockKind, Placement } from './types.ts';

// Code places the cards, not the model. Three columns (people, run of show, numbers),
// quick notes filling the shortest column, wide visuals at the bottom. Units match the prototype canvas.
export const COL = 280;
export const GAP = 24;
export const FULL = COL * 3 + GAP * 2;
const X = [0, COL + GAP, 2 * (COL + GAP)];

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
    case 'questions': return PAD + 27 + body(26) + b.lines.length * 3; // checklist rows don't share margins
    case 'number': return 116;
    case 'note': return PAD + rows(b.title, w, 7.2) * 19 + 4 + body(0, 22, 6.9);
    case 'trend': return 260;
    case 'bars': return 236;
    case 'timeline': return 158 + b.lines.length * 25;
  }
}

// The single-column order for Glance beside a video call: the run of show first.
export const RAIL_ORDER: BlockKind[] = ['header', 'keynotes', 'questions', 'note', 'number', 'person', 'timeline', 'trend', 'bars'];

export function layout(blocks: Block[]): { canvas: Placement[]; rail: string[] } {
  const canvas: Placement[] = [];
  const put = (b: Block, x: number, y: number, w: number) => {
    const h = Math.round(estimateHeight(b, w));
    canvas.push({ id: b.id, x, y, w, h });
    return y + h;
  };
  const zone = (z: Block['zone']) => blocks.filter(b => b.zone === z);
  const head = blocks.find(b => b.kind === 'header');
  const top = head ? put(head, 0, 0, FULL) + 32 : 0;

  const cols = [zone('reference'), zone('run'), zone('numbers')];
  const bottoms = cols.map((list, c) => list.reduce((y, b) => put(b, X[c], y, COL) + GAP, top));
  // Quick notes fill whichever column is shortest, so they sit in the gaps the others leave.
  for (const b of zone('notes')) {
    const c = bottoms.indexOf(Math.min(...bottoms));
    bottoms[c] = put(b, X[c], bottoms[c], COL) + GAP;
  }
  let y = Math.max(top, ...bottoms);
  for (const b of zone('visual')) y = put(b, 0, y, FULL) + GAP;

  const rail = RAIL_ORDER.flatMap(k => blocks.filter(b => b.kind === k).map(b => b.id));
  return { canvas, rail };
}
