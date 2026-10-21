// Generate N synthetic packets, build a board for each, and check every rule.
// Usage: node scripts/scale.ts [--n 100000] [--seed 1] [--workers 10] [--edge 0.12]
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { WorkerResult } from './scale-worker.ts';

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const n = arg('n', 100_000);
const first = arg('seed', 1);
const workers = Math.max(1, Math.min(arg('workers', availableParallelism()), n));
const edgeRate = arg('edge', 0.12);
const fuzz = process.argv.includes('--fuzz-model');

const t0 = performance.now();
const chunk = Math.ceil(n / workers);
const results = await Promise.all(Array.from({ length: workers }, (_, i) => {
  const from = first + i * chunk;
  const to = Math.min(first + n, from + chunk);
  return new Promise<WorkerResult>((resolve, reject) => {
    const w = new Worker(new URL('./scale-worker.ts', import.meta.url), { workerData: { from, to, edgeRate, fuzz } });
    w.once('message', resolve);
    w.once('error', reject);
  });
}));
const secs = (performance.now() - t0) / 1000;

// ---------- merge ----------
const all: WorkerResult = results.reduce((a, r) => {
  a.total += r.total; a.failed += r.failed;
  for (const [k, v] of Object.entries(r.issues)) {
    const t = (a.issues[k] ??= { boards: 0, examples: [], sample: v.sample });
    t.boards += v.boards; t.examples = [...t.examples, ...v.examples].slice(0, 5);
  }
  a.crashes.push(...r.crashes);
  for (const [k, v] of Object.entries(r.tags)) { const t = (a.tags[k] ??= { boards: 0, failed: 0 }); t.boards += v.boards; t.failed += v.failed; }
  for (const [k, v] of Object.entries(r.kinds)) a.kinds[k] = (a.kinds[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r.warnings)) a.warnings[k] = (a.warnings[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r.blocksHist)) a.blocksHist[+k] = (a.blocksHist[+k] ?? 0) + v;
  for (const k of ['gaps', 'dropped', 'lines', 'claims', 'memoryLinesFollowup', 'followups', 'timelineFollowups', 'typeMissing', 'typeRight', 'stageAgree'] as const) a[k] += r[k];
  a.times.push(...r.times);
  return a;
}, {
  total: 0, failed: 0, issues: {}, crashes: [], tags: {}, kinds: {}, warnings: {}, blocksHist: {}, gaps: 0, dropped: 0, lines: 0,
  claims: 0, memoryLinesFollowup: 0, followups: 0, timelineFollowups: 0, typeMissing: 0, typeRight: 0, stageAgree: 0, times: [],
} as WorkerResult);

// ---------- report ----------
const fmt = (x: number) => x.toLocaleString('en-US');
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');
const times = all.times.sort((a, b) => a - b);
const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))] ?? 0;
const hist = Object.entries(all.blocksHist).map(([k, v]) => [+k, v] as const).sort((a, b) => a[0] - b[0]);
const blockQ = (p: number) => { let acc = 0; for (const [k, v] of hist) { acc += v; if (acc >= p * all.total) return k; } return 0; };

const out: string[] = [];
out.push(`Cueboard engine · scale run`);
if (fuzz) out.push('  Each packet also built with a random model reading (random type, goal, scores and questions)');
out.push(`  ${fmt(all.total)} packets · seeds ${fmt(first)}–${fmt(first + n - 1)} · ${workers} workers · planted-problem rate ${Math.round(edgeRate * 100)}% · ${secs.toFixed(1)}s (${fmt(Math.round(all.total / secs))} boards/s)`);
out.push(all.failed ? `  ✗ ${fmt(all.failed)} boards broke at least one rule (${pct(all.failed, all.total)})` : `  ✓ every board passed every rule`);

if (Object.keys(all.issues).length) {
  out.push('', '  Rules broken                     boards   example seeds');
  for (const [code, t] of Object.entries(all.issues).sort((a, b) => b[1].boards - a[1].boards)) {
    out.push(`    ${code.padEnd(30)} ${fmt(t.boards).padStart(7)}   ${t.examples.join(', ')}`);
    out.push(`      e.g. ${t.sample.slice(0, 110)}`);
  }
}
if (all.crashes.length) {
  out.push('', '  Crashes');
  for (const c of all.crashes.slice(0, 5)) out.push(`    seed ${c.seed}: ${c.message.split('\n').join('\n      ')}`);
}

const typeTags = ['investor', 'customer', 'partnership', 'negotiation', 'other'];
const base = new Set([...typeTags, 'first', 'followup', 'sparse', 'normal', 'rich']);
out.push('', '  Coverage');
out.push('    type      ' + typeTags.map(t => `${t} ${pct(all.tags[t]?.boards ?? 0, all.total)}`).join(' · '));
out.push('    stage     ' + ['first', 'followup'].map(t => `${t} ${pct(all.tags[t]?.boards ?? 0, all.total)}`).join(' · '));
out.push('    data      ' + ['sparse', 'normal', 'rich'].map(t => `${t} ${pct(all.tags[t]?.boards ?? 0, all.total)}`).join(' · '));
out.push('    planted problems (boards · failed):');
const planted = Object.entries(all.tags).filter(([k]) => !base.has(k)).sort((a, b) => b[1].boards - a[1].boards);
for (let i = 0; i < planted.length; i += 3) {
  out.push('      ' + planted.slice(i, i + 3).map(([k, v]) => `${k} ${fmt(v.boards)} · ${fmt(v.failed)}`.padEnd(38)).join(''));
}

out.push('', '  What the boards look like');
out.push(`    blocks per board     p10 ${blockQ(0.1)} · median ${blockQ(0.5)} · p90 ${blockQ(0.9)}   (${fmt(all.dropped)} blocks dropped for space)`);
const kindLine = ['person', 'questions', 'number', 'note', 'trend', 'bars', 'timeline'].map(k => `${k} ${pct(all.kinds[k] ?? 0, all.total)}`).join(' · ');
out.push(`    boards with…         ${kindLine}`);
out.push(`    timeline             ${pct(all.timelineFollowups, all.followups)} of follow-ups`);
out.push(`    lines                ${(all.lines / all.total).toFixed(1)} per board, ${pct(all.claims, all.lines)} are sourced claims`);
out.push(`    memory               ${(all.memoryLinesFollowup / Math.max(1, all.followups)).toFixed(1)} lines from past meetings per follow-up`);
out.push(`    gaps                 ${(all.gaps / all.total).toFixed(2)} per board`);
out.push(`    stage                engine agrees with the generator on ${pct(all.stageAgree, all.total)} (the rest are follow-ups where no one on the invite is confirmed, so their history isn’t used)`);
out.push(`    type from title      right ${pct(all.typeRight, all.typeMissing)} of the ${fmt(all.typeMissing)} boards with no type set`);
const warn = Object.entries(all.warnings).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, all.total)}`);
out.push(`    warnings             ${warn.slice(0, 6).join(' · ')}`);
if (warn.length > 6) out.push(`                         ${warn.slice(6).join(' · ')}`);
out.push('', `  Speed                  median ${q(0.5).toFixed(3)} ms · p99 ${q(0.99).toFixed(3)} ms · max ${q(1).toFixed(2)} ms per board`);

console.log(out.join('\n'));
mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
const file = new URL(`../reports/scale-${first}-${n}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ n, first, workers, edgeRate, secs, ...all, times: undefined }, null, 2));
console.log(`\n  Full report: reports/scale-${first}-${n}.json`);
process.exitCode = all.failed ? 1 : 0;
