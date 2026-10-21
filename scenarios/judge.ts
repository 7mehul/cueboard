import type { Board, Packet } from '../src/types.ts';
import type { Expect } from './scenarios.ts';

// Checks a board against a scenario's expectations. Ids are the same ones the model ranks:
// a fact id, m:<metric>, o:<objection>, p:<person>.

export function onBoard(board: Board, id: string): boolean {
  if (id.startsWith('m:')) return board.blocks.some(b => b.metricId === id.slice(2));
  if (id.startsWith('o:')) return board.blocks.some(b => b.id === `note:obj:${id.slice(2)}`);
  if (id.startsWith('p:')) return board.blocks.some(b => b.id === `person:${id.slice(2)}`);
  if (id.startsWith('gap:') || id.startsWith('q:')) return false;
  return board.blocks.some(b => b.lines.some(l => l.factIds?.includes(id)));
}

export function judge(board: Board, p: Packet, e: Expect): string[] {
  const fails: string[] = [];
  const types = e.type ? (Array.isArray(e.type) ? e.type : [e.type]) : null;
  if (types && !types.includes(board.type)) fails.push(`type is ${board.type}, wanted ${types.join(' or ')}`);
  if (e.stage && board.stage !== e.stage) fails.push(`stage is ${board.stage}, wanted ${e.stage}`);
  const goal = board.blocks.find(b => b.kind === 'keynotes')?.lines.find(l => l.label === 'Goal');
  if (e.goal && (!goal || goal.gap || !e.goal.test(goal.text))) fails.push(`goal “${goal?.text ?? 'none'}” doesn't match ${e.goal}`);
  for (const id of e.show ?? []) if (!onBoard(board, id)) fails.push(`missing ${id}`);
  for (const id of e.hide ?? []) if (onBoard(board, id)) fails.push(`shows ${id}, which doesn't belong`);
  const all = board.blocks.flatMap(b => [b.title, ...b.lines.map(l => l.text)]).join('\n');
  for (const re of e.hideText ?? []) if (re.test(all)) fails.push(`shows text matching ${re}`);
  if (e.numbers) {
    const ids = board.blocks.filter(b => b.kind === 'number').map(b => b.metricId);
    const wrong = ids.filter(id => {
      const m = p.metrics.find(x => x.id === id);
      const own = !m?.owner || m.owner.kind === 'self';
      return e.numbers === 'theirs' ? own : !own;
    });
    if (wrong.length) fails.push(`shows ${e.numbers === 'theirs' ? 'our' : 'their'} numbers: ${wrong.join(', ')}`);
    if (!ids.length) fails.push('shows no numbers');
  }
  const qs = board.blocks.find(b => b.kind === 'questions')?.lines.map(l => l.text) ?? [];
  for (const re of e.ask ?? []) if (!qs.some(q => re.test(q))) fails.push(`no question matches ${re}`);
  return fails;
}
