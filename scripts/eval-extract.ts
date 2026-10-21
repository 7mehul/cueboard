// Score a real model on reading documents into memory: the founder-investor story in
// scenarios/docs.ts, read in order, everything accepted, then the partner-meeting board.
// Usage: node scripts/eval-extract.ts [--verbose]   (needs ANTHROPIC_API_KEY; CUE_MODEL to pick)
import { mkdirSync, writeFileSync } from 'node:fs';
import { commit, readDoc } from '../src/memory/extract.ts';
import type { Proposal } from '../src/memory/extract.ts';
import { packetFor } from '../src/memory/packet.ts';
import { emptyMemory } from '../src/memory/types.ts';
import { buildBoardSmart } from '../src/intel/smart.ts';
import { checkBoard } from '../src/check.ts';
import { STORY, STORY_USER } from '../scenarios/docs.ts';
import { renderText } from './show.ts';

if (!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE)) {
  console.log('Set ANTHROPIC_API_KEY to run this; it reads 6 documents and builds one board with the model.');
  process.exit(1);
}
const { claude } = await import('../src/intel/providers/claude.ts');
const llm = claude();
const verbose = process.argv.includes('--verbose');

const has = (p: Proposal, kind: string, re: RegExp) =>
  kind === 'person' ? p.people.some(x => re.test(x.name))
    : kind === 'meeting' ? !!p.meeting && re.test(p.meeting.title + ' ' + (p.meeting.goal ?? ''))
      : p.items.some(i => i.kind === kind && re.test(i.text + ' ' + i.quote));

console.log(`Reading the story with ${llm.name}\n`);
let m = emptyMemory('u-alex', STORY_USER), found = 0, wanted = 0;
const meetings: string[] = [], report: unknown[] = [];
for (const s of STORY) {
  const t0 = Date.now();
  let p: Proposal;
  try { p = (await readDoc(llm, m, s.doc)).proposal; }
  catch (e) { console.log(`${s.doc.id} ${s.doc.kind.padEnd(8)} failed: ${(e as Error).message}`); report.push({ id: s.doc.id, error: (e as Error).message }); continue; }
  const misses = s.expect.filter(x => !has(p, x.kind, x.match));
  found += s.expect.length - misses.length; wanted += s.expect.length;
  const made = p.dropped.filter(d => d.why === 'not_in_document' || d.why === 'number_not_in_quote');
  console.log(`${s.doc.id} ${s.doc.kind.padEnd(8)} ${s.expect.length - misses.length}/${s.expect.length} expected · ${p.items.length} items · ${made.length} set aside as not in the text · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const x of misses) console.log(`    missing ${x.kind} ${x.match}`);
  for (const d of made) console.log(`    set aside: ${d.what} (${d.why})`);
  if (verbose) for (const i of p.items) console.log(`    ${i.kind}: ${i.text}  “${i.quote}”`);
  const r = commit(m, s.doc, p, { people: p.people.map(x => x.ref), items: p.items.map(i => i.id) });
  m = r.memory;
  if (r.meetingId) meetings.push(r.meetingId);
  report.push({ id: s.doc.id, proposal: p, misses: misses.map(x => `${x.kind} ${x.match}`) });
}
console.log(`\nFound ${found}/${wanted} of what the documents hold.`);

const last = meetings.at(-1);
if (last) {
  const packet = packetFor(m, last, '2026-10-21T09:00:00-04:00')!;
  const r = await buildBoardSmart(packet, llm);
  const b = r.board;
  const issues = checkBoard(b, packet);
  const key = b.blocks.find(x => x.kind === 'keynotes');
  const checks: [string, boolean][] = [
    ['follow-up, not a first meeting', b.stage === 'followup'],
    ['remembers where the call left off', !!key?.lines.some(l => l.label === 'Where we left off' && l.memory)],
    ['MRR against what Maya was told', b.blocks.some(x => x.kind === 'number' && /MRR/i.test(x.title) && /was \$33k/.test(x.lines[1]?.text ?? ''))],
    ['her objection, with the answer', b.blocks.some(x => x.kind === 'note' && /zoom/i.test(x.title + x.lines.map(l => l.text).join(' ')))],
    ['what not to repeat', b.blocks.some(x => x.kind === 'note' && /market/i.test(x.lines.map(l => l.text).join(' ')))],
    ['every rule kept', !issues.length],
  ];
  console.log(`\nPartner meeting board (${r.mode}):`);
  for (const [what, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (verbose || checks.some(([, ok]) => !ok)) console.log('\n' + renderText(b).split('\n').map(l => '  ' + l).join('\n'));
  report.push({ board: { mode: r.mode, checks, issues } });
}
mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
writeFileSync(new URL('../reports/eval-extract.json', import.meta.url), JSON.stringify(report, null, 2));
