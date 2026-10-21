// Run every persona scenario through the rules engine and, if Claude credentials are available,
// through the model-backed engine, and score both against the scenario's expectations.
// Usage: node scripts/eval.ts [--rules-only] [--only <scenario-id>] [--verbose]
// Model runs are saved to reports/; node scripts/replay.ts rebuilds their boards without calling the model.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import { buildBoardSmart } from '../src/intel/smart.ts';
import type { SmartResult } from '../src/intel/smart.ts';
import type { LLM } from '../src/intel/llm.ts';
import { scenarios } from '../scenarios/scenarios.ts';
import { judge } from '../scenarios/judge.ts';
import { renderText } from './show.ts';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const verbose = args.includes('--verbose');
const hasCreds = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

let llm: LLM | null = null;
if (!args.includes('--rules-only') && hasCreds) {
  const { claude } = await import('../src/intel/providers/claude.ts');
  llm = claude();
}

const list = scenarios().filter(s => !only || s.id === only);
const report: unknown[] = [];
let rulesPass = 0, modelPass = 0;

console.log(`Cueboard engine · persona scenarios · ${llm ? `rules vs ${llm.name}` : 'rules only (no Claude credentials found; set ANTHROPIC_API_KEY to run the model)'}\n`);
for (const s of list) {
  const rules = buildBoard(s.packet);
  const rIssues = checkBoard(rules, s.packet);
  const rFails = judge(rules, s.packet, s.expect);
  if (!rIssues.length && !rFails.length) rulesPass++;
  let smart: SmartResult | null = null, mFails: string[] = [];
  if (llm) {
    smart = await buildBoardSmart(s.packet, llm);
    mFails = judge(smart.board, s.packet, s.expect);
    if (smart.mode === 'model' && !mFails.length) modelPass++;
  }
  const mark = (fails: string[], issues = 0) => (fails.length || issues ? `✗ ${fails.length + issues}` : '✓');
  console.log(`${s.id.padEnd(30)} ${s.persona.padEnd(13)} rules ${mark(rFails, rIssues.length).padEnd(5)}${smart ? `  model ${smart.mode === 'model' ? mark(mFails) : '✗ fell back'}` : ''}`);
  for (const f of rFails) console.log(`    rules: ${f}`);
  if (smart) {
    for (const f of mFails) console.log(`    model: ${f}`);
    for (const st of smart.steps) if (!st.ok) console.log(`    model step ${st.step} failed: ${st.error}`);
    if (smart.issues.length) console.log(`    model board broke rules: ${smart.issues.map(i => i.code).join(', ')}`);
    if (smart.brief) console.log(`    read as: ${smart.brief.process} · ${smart.brief.step} · goal “${smart.brief.goal.text}” (${smart.brief.goal.basis})`);
    const tokens = smart.steps.reduce((a, st) => a + (st.usage ? st.usage.inputTokens + st.usage.outputTokens : 0), 0);
    if (tokens) console.log(`    ${smart.steps.map(st => `${st.step} ${(st.ms / 1000).toFixed(1)}s`).join(' · ')} · ${tokens.toLocaleString()} tokens`);
  }
  if (verbose) {
    console.log('\n' + renderText(rules).split('\n').map(l => '    ' + l).join('\n'));
    if (smart) console.log('\n' + renderText(smart.board).split('\n').map(l => '    ' + l).join('\n'));
    console.log();
  }
  report.push({ id: s.id, rules: { fails: rFails, issues: rIssues }, model: smart && { mode: smart.mode, fails: mFails, brief: smart.brief, ranking: smart.ranking, steps: smart.steps } });
}
console.log(`\nRules engine: ${rulesPass}/${list.length} scenarios pass${llm ? ` · model engine: ${modelPass}/${list.length}` : ''}`);
// Only model runs are saved (the rules board can be rebuilt any time): the latest as eval.json,
// which scripts/replay.ts reads, plus a dated copy so earlier runs can be compared.
if (llm) {
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  const json = JSON.stringify({ model: llm.name, at: new Date().toISOString(), scenarios: report }, null, 2);
  writeFileSync(new URL('../reports/eval.json', import.meta.url), json);
  writeFileSync(new URL(`../reports/eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url), json);
}
