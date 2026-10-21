import type { Block, Board, Fact, MeetingType, Source, Subject } from './types.ts';
import type { Limit } from './text.ts';
import { fits, lineLimit } from './text.ts';

// The steps a model does in the full pipeline, with fixed inputs and outputs so any provider
// can sit behind them. The engine never calls a model: classify and extract run before
// buildBoard, rewrite runs after it, and checkBoard checks the result either way.
export interface ModelSteps {
  classify?(input: { title: string; attendees: string[]; snippets: string[] }): Promise<{ type: MeetingType; confidence: number }>;
  extract?(input: { subject: Subject; source: Source; text: string }): Promise<Omit<Fact, 'id'>[]>;
  rewrite?(input: { block: Block; limits: Limit[] }): Promise<string[]>;
}

// Use a model's wording only where it keeps every line within its limit. Gaps and numbers are
// never reworded. This can't catch a reworded line that adds a new claim; that needs a model check.
export async function rewriteBoard(board: Board, steps: ModelSteps): Promise<Board> {
  if (!steps.rewrite) return board;
  const blocks: Block[] = [];
  for (const b of board.blocks) {
    if (!b.lines.length || b.kind === 'number' || b.kind === 'header') { blocks.push(b); continue; }
    const limits = b.lines.map((_, i) => lineLimit(b.kind, i));
    let out: string[];
    try { out = await steps.rewrite({ block: b, limits }); } catch { blocks.push(b); continue; }
    const ok = Array.isArray(out) && out.length === b.lines.length && out.every((t, i) =>
      typeof t === 'string' && t.trim().length > 0 && fits(t.trim(), limits[i]) && (!b.lines[i].gap || t.trim() === b.lines[i].text));
    blocks.push(ok ? { ...b, lines: b.lines.map((l, i) => ({ ...l, text: out[i].trim() })) } : b);
  }
  return { ...board, blocks };
}
