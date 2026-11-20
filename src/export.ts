import type { Block, Board, Line, Packet, Source } from './types.ts';
import { isDate, shortDate, withZone } from './text.ts';

// Turn an engine board into items for the freeform canvas. This is only the starting
// arrangement: once it's on the canvas every item belongs to the user to move, resize,
// restyle, connect or delete. Lines keep their memory and gap markers so the canvas can
// show where they came from; editing a line makes it the user's own.

// Where a line came from, in words someone can check mid-meeting: "Email · Aug 28".
export interface Cite { label: string; date?: string; url?: string }

export interface CanvasLine {
  text: string;
  label?: string;
  memory?: boolean;
  gap?: boolean;
  suggested?: boolean;
  tone?: Line['tone'];
  cite?: Cite[];
}

export type CanvasElement = { id: string; x: number; y: number; w: number; h?: number; why?: string } & (
  | { type: 'text'; size: 'h1' | 'h2' | 'body'; text: string }
  | { type: 'person'; color: string; name: string; lines: CanvasLine[] }
  | { type: 'card'; color: string; tag: string; title: string; lines: CanvasLine[] }
  | { type: 'list'; title: string; items: { text: string; done: boolean; gap?: boolean; memory?: boolean; cite?: Cite[] }[] }
  | { type: 'stat'; label: string; value: string; note: string; tone?: Line['tone']; memory?: boolean; cite?: Cite[] }
  | { type: 'note'; color: string; title: string; text: string; memory?: boolean; cite?: Cite[] }
  | { type: 'chart'; kind: 'line' | 'bar'; title: string; prefix: string; suffix: string; data: { label: string; value: number }[]; caption?: string; captionTone?: Line['tone'] }
  | { type: 'timeline'; title: string; events: { when: string; label: string; memory: boolean; today: boolean }[]; lines: CanvasLine[] }
);

export interface CanvasBoard { title: string; elements: CanvasElement[] }

const cid = (id: string) => id.replace(/[^\w-]/g, '-').slice(0, 48);

export function citeOf(s: Source): Cite {
  const date = isDate(s.seenAt) ? shortDate(s.seenAt) : undefined;
  // "After notes, Sep 16" already says when; don't repeat the date.
  const at = (label: string, url = s.url): Cite => ({ label, ...(date && !label.includes(date) ? { date } : {}), ...(url && /^https?:\/\//.test(url) ? { url } : {}) });
  switch (s.kind) {
    case 'web': {
      const m = /^https?:\/\/(?:www\.)?([^/?#]+)([^?#]*)/.exec(s.ref);
      return m ? at((m[1] + m[2].replace(/\/$/, '')).slice(0, 60), s.ref) : at('Web');
    }
    case 'enrichment': return at('Profile data');
    case 'email': return at('Email');
    case 'calendar': return at('Calendar invite');
    case 'deck': return at(s.ref.slice(0, 60) || 'Deck');
    case 'notes': return at(`Your notes: ${s.ref}`.slice(0, 60));
    case 'profile': return at(`Your ${s.ref}`.slice(0, 60));
    case 'user': return at('You added this');
    case 'board': return at('An earlier board');
    case 'debrief': return at(s.ref.slice(0, 60) || 'After notes');
  }
}

type Cites = (ids: string[]) => Cite[] | undefined;

// With the packet, every line keeps the sources it came from, so the canvas can show them.
export function toCanvas(board: Board, packet?: Packet): CanvasBoard {
  return withZone(packet?.timeZone, () => canvasOf(board, packet));
}
function canvasOf(board: Board, packet?: Packet): CanvasBoard {
  const byId = new Map((packet?.sources ?? []).map(s => [s.id, s]));
  const cites: Cites = ids => {
    const out = [...new Set(ids)].map(id => byId.get(id)).filter((s): s is Source => !!s).slice(0, 3).map(citeOf);
    return out.length ? out : undefined;
  };
  const pos = new Map(board.canvas.map(c => [c.id, c]));
  const elements: CanvasElement[] = [];
  for (const b of board.blocks) {
    const c = pos.get(b.id);
    if (c) elements.push(...convert(b, c, cites));
  }
  return { title: board.title, elements };
}

function convert(b: Block, at: { x: number; y: number; w: number; h: number }, cites: Cites): CanvasElement[] {
  const line = (l: Line): CanvasLine => {
    const out: CanvasLine = { text: l.text };
    if (l.label) out.label = l.label;
    if (l.memory) out.memory = true;
    if (l.gap && l.gap !== 'ask') out.gap = true;
    if (l.suggested) out.suggested = true;
    if (l.tone) out.tone = l.tone;
    const c = cites(l.sourceIds);
    if (c) out.cite = c;
    return out;
  };
  const cited = (ls: Line[]) => { const c = cites(ls.flatMap(l => l.sourceIds)); return c ? { cite: c } : {}; };
  const id = cid(b.id);
  const box = { id, x: at.x, y: at.y, w: at.w, h: at.h, ...(b.why ? { why: b.why } : {}) };
  switch (b.kind) {
    case 'header':
      return [
        { ...box, type: 'text', size: 'h1', text: b.title, h: undefined },
        { id: id + '-meta', type: 'text', size: 'body', text: b.lines[0]?.text ?? '', x: at.x, y: at.y + at.h - 28, w: at.w },
      ];
    case 'person':
      return [{ ...box, type: 'person', color: 'sky', name: b.title, lines: b.lines.map(line) }];
    case 'keynotes':
      return [{ ...box, type: 'card', color: 'mint', tag: 'Key notes', title: 'What this meeting is for', lines: b.lines.map(line) }];
    // A part of the plan is an ordinary card: its minutes as the label, so they can be retimed by hand.
    case 'phase':
      return [{ ...box, type: 'card', color: 'lilac', tag: `${b.minutes?.from ?? 0}–${b.minutes?.to ?? 0} min`, title: b.title, lines: b.lines.map(line) }];
    case 'questions':
      return [{ ...box, type: 'list', title: b.title, items: b.lines.map(l => ({ text: l.text, done: false, ...(l.gap ? { gap: true } : {}), ...(l.memory ? { memory: true } : {}), ...cited([l]) })) }];
    case 'number': {
      const note = b.lines[1];
      return [{ ...box, type: 'stat', label: b.title, value: b.lines[0]?.text ?? '', note: note?.text ?? '', ...(note?.tone ? { tone: note.tone } : {}), ...(note?.memory ? { memory: true } : {}), ...cited(b.lines) }];
    }
    case 'note':
      return [{ ...box, type: 'note', color: b.color ?? 'yellow', title: b.title, text: b.lines.map(l => l.text).join('\n'), ...(b.lines.some(l => l.memory) ? { memory: true } : {}), ...cited(b.lines) }];
    case 'trend':
    case 'bars':
      return [{
        ...box, type: 'chart', kind: b.kind === 'trend' ? 'line' : 'bar', title: b.title,
        prefix: b.chart?.prefix ?? '', suffix: b.chart?.suffix ?? '', data: b.chart?.points ?? [],
        ...(b.lines[0] ? { caption: b.lines[0].text, captionTone: b.lines[0].tone } : {}),
      }];
    case 'timeline':
      return [{
        ...box, type: 'timeline', title: b.title, lines: b.lines.map(line),
        events: (b.events ?? []).map(e => ({ when: e.kind === 'today' ? 'Today' : shortDate(e.date), label: e.kind === 'today' ? '' : e.label, memory: e.memory, today: e.kind === 'today' })),
      }];
  }
}
