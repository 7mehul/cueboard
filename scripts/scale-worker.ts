import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import { generate } from '../synth/generate.ts';
import { readPacket } from '../src/engine.ts';
import { candidates } from '../src/intel/context.ts';
import { rng } from '../synth/rng.ts';
import { MEETING_TYPES } from '../src/types.ts';
import type { Intel } from '../src/facts.ts';

// Builds and checks one range of seeds and reports totals, so the main thread only merges.

export interface Tally { boards: number; examples: number[] }
export interface WorkerResult {
  total: number;
  failed: number;
  issues: Record<string, Tally & { sample: string }>;
  crashes: { seed: number; message: string }[];
  tags: Record<string, { boards: number; failed: number }>;
  kinds: Record<string, number>;          // boards containing at least one block of a kind
  warnings: Record<string, number>;
  blocksHist: Record<number, number>;
  gaps: number;
  dropped: number;
  lines: number;
  claims: number;
  memoryLinesFollowup: number;
  followups: number;
  timelineFollowups: number;
  typeMissing: number;
  typeRight: number;
  stageAgree: number;
  times: number[];
}

const { from, to, edgeRate, fuzz } = workerData as { from: number; to: number; edgeRate: number; fuzz: boolean };

// A model that says random things: random meeting type and goal, random scores (including for
// ids that don't exist), random questions. Whatever it says, the board must keep every rule.
function randomIntel(seed: number, packet: Parameters<typeof readPacket>[0]): Intel {
  const r = rng(seed ^ 0x9e3779b9);
  const { ctx, infos } = readPacket(packet);
  const ids = candidates(ctx, infos).map(c => c.id).concat(['f-invented', 'm:nope', 'p:ghost']);
  const words = ['Close', 'the', 'deal', 'by', 'Friday', 'with', 'a', 'very', 'long', 'goal', 'that', 'runs', 'well', 'past', 'any', 'limit', '$3M', 'pilot'];
  const say = (n: number) => Array.from({ length: n }, () => r.pick(words)).join(' ');
  return {
    brief: {
      persona: 'other', meetingType: r.pick(MEETING_TYPES), process: say(2), step: say(3), purpose: say(8),
      goal: { text: r.chance(0.1) ? '' : say(r.int(2, 25)), basis: r.pick(['stated', 'agreed_next_step', 'inferred'] as const), alternatives: [] },
      theyWant: [], decides: r.chance(0.3) ? [] : [say(r.int(1, 30))],
      opener: r.chance(0.3) ? '' : say(r.int(1, 25)), ask: r.chance(0.3) ? '' : say(r.int(1, 25)), risks: [], numbers: r.pick(['ours', 'theirs', 'both', 'none'] as const), needs: [], unknowns: [],
    },
    rel: new Map(ids.filter(() => r.chance(0.7)).map(id => [id, { score: r.int(0, 3), why: say(4) }])),
    questions: Array.from({ length: r.int(0, 5) }, () => ({ text: say(r.int(1, 30)) + (r.chance(0.8) ? '?' : ''), why: say(3) })),
  };
}

const res: WorkerResult = {
  total: 0, failed: 0, issues: {}, crashes: [], tags: {}, kinds: {}, warnings: {}, blocksHist: {},
  gaps: 0, dropped: 0, lines: 0, claims: 0, memoryLinesFollowup: 0, followups: 0, timelineFollowups: 0,
  typeMissing: 0, typeRight: 0, stageAgree: 0, times: [],
};

for (let seed = from; seed < to; seed++) {
  res.total++;
  let codes: { code: string; message: string }[] = [];
  let tags: string[] = [];
  try {
    const g = generate(seed, { edgeRate });
    tags = g.tags;
    const before = JSON.stringify(g.packet);
    const t0 = performance.now();
    const board = buildBoard(g.packet);
    const dt = performance.now() - t0;
    if (seed % 10 === 0) res.times.push(dt);
    codes = checkBoard(board, g.packet);
    if (fuzz) {
      const fb = buildBoard(g.packet, { intel: randomIntel(seed, g.packet) });
      for (const i of checkBoard(fb, g.packet)) codes.push({ code: 'with-random-model:' + i.code, message: i.message });
    }
    if (JSON.stringify(g.packet) !== before) codes.push({ code: 'mutated_input', message: 'buildBoard changed its input' });
    if (seed % 25 === 0 && JSON.stringify(buildBoard(JSON.parse(before))) !== JSON.stringify(board)) {
      codes.push({ code: 'nondeterministic', message: 'Same packet, different board' });
    }

    const kinds = new Set(board.blocks.map(b => b.kind));
    for (const k of kinds) res.kinds[k] = (res.kinds[k] ?? 0) + 1;
    for (const w of board.warnings) res.warnings[w.code] = (res.warnings[w.code] ?? 0) + 1;
    res.blocksHist[board.budget.used] = (res.blocksHist[board.budget.used] ?? 0) + 1;
    res.gaps += board.gaps.length;
    res.dropped += board.budget.dropped.length;
    const lines = board.blocks.flatMap(b => b.lines);
    res.lines += lines.length;
    res.claims += lines.filter(l => l.claim).length;
    if (board.stage === 'followup') {
      res.followups++;
      res.memoryLinesFollowup += lines.filter(l => l.memory).length;
      if (kinds.has('timeline')) res.timelineFollowups++;
    }
    if (tags.includes('type_missing')) { res.typeMissing++; if (board.type === tags[0]) res.typeRight++; }
    if (board.stage === tags[1]) res.stageAgree++;
  } catch (e) {
    const err = e as Error;
    res.crashes.length < 20 && res.crashes.push({ seed, message: `${err.message}\n${err.stack?.split('\n').slice(1, 3).join('\n')}` });
    codes = [{ code: 'crash', message: err.message }];
  }

  if (codes.length) res.failed++;
  for (const code of new Set(codes.map(c => c.code))) {
    const t = (res.issues[code] ??= { boards: 0, examples: [], sample: codes.find(c => c.code === code)!.message });
    t.boards++;
    if (t.examples.length < 5) t.examples.push(seed);
  }
  for (const tag of tags) {
    const t = (res.tags[tag] ??= { boards: 0, failed: 0 });
    t.boards++;
    if (codes.length) t.failed++;
  }
}

parentPort!.postMessage(res);
