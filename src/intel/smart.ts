import type { Board, Packet } from '../types.ts';
import type { Intel } from '../facts.ts';
import { buildBoard, readPacket } from '../engine.ts';
import type { EngineOptions } from '../engine.ts';
import { checkBoard } from '../check.ts';
import type { Issue } from '../check.ts';
import type { LLM, Usage } from './llm.ts';
import { LLMError } from './llm.ts';
import type { MeetingBrief, Ranking } from './schemas.ts';
import { rank, understand } from './steps.ts';

// The engine with judgment: a model reads the meeting (understand), scores everything that could
// go on the board against that reading (rank), and the deterministic engine composes, lays out
// and checks the board. If a model step fails, that step falls back to the rules; if the
// model-shaped board breaks a rule, the rules board is used instead. A board never ships unchecked.

export interface StepTrace { step: string; ok: boolean; ms: number; usage?: Usage; error?: string }

export interface SmartResult {
  board: Board;
  brief?: MeetingBrief;
  ranking?: Ranking;
  mode: 'model' | 'rules';
  steps: StepTrace[];
  issues: Issue[]; // what the checker found on the model-shaped board, if it was rejected
}

async function timed<T>(step: string, steps: StepTrace[], fn: () => Promise<{ value: T; usage?: Usage }>): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const { value, usage } = await fn();
    steps.push({ step, ok: true, ms: Date.now() - t0, usage });
    return value;
  } catch (e) {
    const err = e instanceof LLMError ? `${e.code}: ${e.message}` : (e as Error).message;
    steps.push({ step, ok: false, ms: Date.now() - t0, error: err });
    return undefined;
  }
}

export async function buildBoardSmart(p: Packet, llm: LLM | null, o: EngineOptions = {}): Promise<SmartResult> {
  const steps: StepTrace[] = [];
  const rules = () => buildBoard(p, o);
  if (!llm) return { board: rules(), mode: 'rules', steps, issues: [] };

  const first = readPacket(p, o);
  const brief = await timed('understand', steps, async () => { const r = await understand(llm, first.ctx, first.infos); return { value: r.brief, usage: r.usage }; });
  if (!brief) return { board: rules(), mode: 'rules', steps, issues: [] };
  // Rank against the board this brief will produce: with the model's meeting type, the playbook,
  // numbers and research questions can differ from the keyword guess the first read used.
  const view = readPacket(p, { ...o, classify: () => brief.meetingType as Board['type'] });
  const ranking = await timed('rank', steps, async () => { const r = await rank(llm, view.ctx, view.infos, brief); return { value: r.ranking, usage: r.usage }; });

  const intel: Intel = {
    brief,
    rel: new Map((ranking?.items ?? []).map(i => [i.id, { score: i.score, why: i.why }])),
    questions: ranking?.questions ?? [],
  };
  const board = buildBoard(p, { ...o, intel });
  const issues = checkBoard(board, p, o);
  if (issues.length) return { board: rules(), brief, ranking, mode: 'rules', steps, issues };
  return { board, brief, ranking, mode: 'model', steps, issues };
}
