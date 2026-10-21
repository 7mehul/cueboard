// Print a board as text. Usage: node scripts/show.ts [first|followup|seed:<n>]
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import type { Board, Packet } from '../src/types.ts';
import { shortDate } from '../src/text.ts';
import { danaFirst, danaFollowup } from '../test/fixtures.ts';
import { generate } from '../synth/generate.ts';

export function renderText(b: Board): string {
  const out: string[] = [];
  out.push(`${b.title}  [${b.type}${b.typeGuessed ? '?' : ''} · ${b.stage} · ${b.budget.used}/${b.budget.max} blocks]`);
  for (const id of b.rail) {
    const blk = b.blocks.find(x => x.id === id)!;
    if (blk.kind === 'header') { out.push('  ' + blk.lines[0].text); continue; }
    out.push(`\n  ── ${blk.title} (${blk.kind})`);
    for (const l of blk.lines) {
      const tags = [l.memory ? 'memory' : '', l.gap ? 'gap:' + l.gap : '', l.tone ?? '', l.claim ? `src:${l.sourceIds.join(',')}` : ''].filter(Boolean).join(' ');
      out.push(`     ${l.label ? l.label + ': ' : ''}${l.text}${tags ? `   ‹${tags}›` : ''}`);
    }
    if (blk.chart) out.push('     ' + blk.chart.points.map(pt => `${pt.label} ${blk.chart!.prefix}${pt.value}${blk.chart!.suffix}`).join(' · '));
    if (blk.events) out.push('     ' + blk.events.map(e => `${e.kind === 'today' ? 'Today' : shortDate(e.date) + ' ' + e.label}${e.memory ? '*' : ''}`).join(' → '));
  }
  if (b.budget.dropped.length) out.push(`\n  dropped for space: ${b.budget.dropped.join(', ')}`);
  if (b.warnings.length) out.push(`  warnings: ${b.warnings.map(w => w.code).join(', ')}`);
  return out.join('\n');
}

if (import.meta.main) {
  const arg = process.argv[2] ?? 'followup';
  const packet: Packet = arg === 'first' ? danaFirst() : arg.startsWith('seed:') ? generate(Number(arg.slice(5))).packet : danaFollowup();
  const board = buildBoard(packet);
  console.log(renderText(board));
  const issues = checkBoard(board, packet);
  console.log(issues.length ? `\n  ✗ ${issues.length} issues:\n` + issues.map(i => `    ${i.code}: ${i.message}`).join('\n') : '\n  ✓ passes every check');
}
