import type { Block, Board, Packet } from './types.ts';
import type { Classifier } from './frame.ts';
import { frame } from './frame.ts';
import { blockBudget, playbookFor } from './playbooks.ts';
import { makeCtx, warn } from './facts.ts';
import type { Intel } from './facts.ts';
import {
  barsBlock, commitmentLines, header, keynotes, metricInfos, noteBlocks,
  numberBlocks, personCards, phaseBlocks, questionsBlock, timelineBlock, trendBlock,
} from './compose.ts';
import { layout } from './layout.ts';
import { withZone } from './text.ts';

export interface EngineOptions {
  classify?: Classifier;
  maxBlocks?: number;
  intel?: Intel; // a model's reading of the meeting; see src/intel/smart.ts
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

const COUNT_MESSAGES: Record<string, (n: number) => string> = {
  trimmed: n => `${plural(n, 'line')} cut to fit`,
  duplicate_dropped: n => `${plural(n, 'repeated line')} left off`,
  unsourced_dropped: n => `${plural(n, 'item')} with no usable source left off`,
  private_filtered: n => `${plural(n, 'private item')} from another account ignored`,
  low_confidence_dropped: n => `${plural(n, 'low-confidence fact')} left off`,
  unresolved_dropped: n => `${plural(n, 'fact')} about unconfirmed people held back`,
  future_dropped: n => `${plural(n, 'fact')} dated in the future ignored`,
  stale_news_dropped: n => `${plural(n, 'old news item')} left off`,
};

// The engine's view of a packet before anything is composed: filtered facts and numbers.
// The model steps read from this, so they only ever see what the rules let through.
export function readPacket(p: Packet, o: EngineOptions = {}) {
  const fr = frame(p, o.classify);
  const ctx = makeCtx(p, playbookFor(fr.type, fr.stage), fr);
  return { ctx, infos: metricInfos(ctx) };
}

// Packet in, board out. Pure and deterministic: no model calls, no clock, no randomness.
export function buildBoard(p: Packet, o: EngineOptions = {}): Board {
  return withZone(p.timeZone, () => build(p, o));
}
function build(p: Packet, o: EngineOptions): Board {
  // A model's meeting type stands in for the keyword guess, but never for a type the user set.
  const modelType = o.intel?.brief?.meetingType as Board['type'] | undefined;
  const fr = frame(p, modelType ? () => modelType : o.classify);
  const pb = playbookFor(fr.type, fr.stage);
  const ctx = makeCtx(p, pb, fr, o.intel);

  // Order matters: earlier blocks claim facts and lines first, and each appears only once. The goal
  // and where you left off come first, so a person card can't take their words.
  const head = header(ctx);
  const keys = keynotes(ctx);
  const people = personCards(ctx);
  const infos = metricInfos(ctx);
  const numbers = numberBlocks(ctx, infos);
  const shownMetrics = new Set(numbers.map(b => b.metricId!));
  const trend = trendBlock(ctx, infos, shownMetrics);
  const bars = barsBlock(ctx);
  const promises = commitmentLines(ctx, 'timeline');
  const timeline = timelineBlock(ctx, promises);
  const plan = phaseBlocks(ctx, infos);
  const notes = noteBlocks(ctx, infos, timeline ? [] : promises, shownMetrics);
  const questions = questionsBlock(ctx);

  let blocks = [head, keys, ...plan, questions, ...people, ...numbers, ...notes, timeline, trend, bars]
    .filter((b): b is Block => !!b);

  const max = o.maxBlocks ?? blockBudget(p.meeting.durationMin);
  // The header and the plan are the board's frame; the budget is for what hangs on it.
  const body = blocks.filter(b => b.kind !== 'header' && b.kind !== 'phase');
  let dropped: string[] = [];
  if (body.length > max) {
    dropped = body
      .filter(b => !b.required)
      .sort((a, b) => b.priority - a.priority || b.id.localeCompare(a.id))
      .slice(0, body.length - max)
      .map(b => b.id);
    const drop = new Set(dropped);
    blocks = blocks.filter(b => !drop.has(b.id));
  }

  if (fr.typeGuessed) warn(ctx, 'type_guessed', modelType ? `Read as a ${fr.type} meeting from what's known` : `Treated as a ${fr.type} meeting from its title`);
  for (const [k, n] of Object.entries(ctx.counts).sort(([a], [b]) => a.localeCompare(b))) {
    ctx.warnings.push({ code: k, message: COUNT_MESSAGES[k]?.(n) ?? `${k}: ${n}` });
  }

  const gaps = [...new Set(blocks.flatMap(b => b.lines.filter(l => l.gap).map(l => l.text)))];
  const { canvas, rail } = layout(blocks);
  return {
    meetingId: p.meeting.id,
    type: fr.type,
    typeGuessed: fr.typeGuessed,
    stage: fr.stage,
    title: head.title,
    blocks,
    canvas,
    rail,
    gaps,
    warnings: ctx.warnings,
    budget: { max, used: blocks.filter(b => b.kind !== 'header' && b.kind !== 'phase').length, dropped },
  };
}
