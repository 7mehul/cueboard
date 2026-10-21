// Rebuild the model boards from the last eval's saved answers, without calling the model again.
// Engine and prompt-free changes can be checked against real model judgment for free.
// Usage: node scripts/replay.ts [--only <scenario-id>] [--quiet] [--file reports/eval-<date>.json]
import { readFileSync } from 'node:fs';
import { buildBoardSmart } from '../src/intel/smart.ts';
import { scripted } from '../src/intel/providers/scripted.ts';
import { scenarios } from '../scenarios/scenarios.ts';
import { judge } from '../scenarios/judge.ts';
import { renderText } from './show.ts';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const quiet = args.includes('--quiet');
const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : new URL('../reports/eval.json', import.meta.url);
const run = JSON.parse(readFileSync(file, 'utf8'));
const saved = (Array.isArray(run) ? run : run.scenarios) as { id: string; model: { brief?: object; ranking?: object } | null }[];
if (!Array.isArray(run)) console.log(`Replaying ${run.model} from ${run.at}\n`);

let pass = 0, total = 0;
for (const s of scenarios().filter(x => !only || x.id === only)) {
  const m = saved.find(x => x.id === s.id)?.model;
  if (!m?.brief) { console.log(`${s.id}: no saved model answer`); continue; }
  total++;
  const r = await buildBoardSmart(s.packet, scripted({ understand: () => ({ opener: '', ask: '', ...structuredClone(m.brief) }), rank: () => structuredClone(m.ranking ?? { items: [], questions: [] }) }));
  const fails = judge(r.board, s.packet, s.expect);
  if (r.mode === 'model' && !fails.length) pass++;
  console.log(`${s.id.padEnd(30)} ${r.mode === 'model' ? (fails.length ? `✗ ${fails.length}` : '✓') : `✗ fell back: ${r.issues.map(i => i.code).join(', ')}`}`);
  for (const f of fails) console.log(`    ${f}`);
  if (!quiet) console.log('\n' + renderText(r.board).split('\n').map(l => '    ' + l).join('\n') + '\n');
}
console.log(`\nReplayed model answers: ${pass}/${total} pass`);
