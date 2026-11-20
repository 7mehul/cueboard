import type { Fact, FactTopic, Packet, Source, Subject, Warning } from './types.ts';
import type { MeetingBrief } from './intel/schemas.ts';
import { MEMORY_KINDS } from './types.ts';
import type { Frame } from './frame.ts';
import type { Playbook } from './playbooks.ts';
import { daysBetween, isDate, ms, normalize } from './text.ts';

export const MIN_CONFIDENCE = 0.6;
export const NEWS_MAX_AGE_DAYS = 120;

// What a model worked out about this meeting: a brief, a 0-3 relevance score per candidate id,
// and questions it suggests. Optional: without it the engine ranks by its rules alone.
export interface Intel {
  brief?: MeetingBrief;
  rel: Map<string, { score: number; why: string }>;
  questions: { text: string; why: string }[];
}

export interface Ctx {
  p: Packet;
  pb: Playbook;
  fr: Frame;
  intel?: Intel;
  sources: Map<string, Source>;
  facts: Fact[]; // eligible facts only, with sources narrowed to the valid ones
  conflicts: { subject: Subject; key: string }[];
  usedFacts: Set<string>;
  seenText: Set<string>;
  warnings: Warning[];
  counts: Record<string, number>;
}

export function makeCtx(p: Packet, pb: Playbook, fr: Frame, intel?: Intel): Ctx {
  const ctx: Ctx = {
    p, pb, fr, intel,
    sources: new Map(p.sources.map(s => [s.id, s])),
    facts: [], conflicts: [],
    usedFacts: new Set(), seenText: new Set(),
    warnings: [], counts: {},
  };
  ctx.facts = eligibleFacts(ctx);
  return ctx;
}

export const bump = (ctx: Ctx, key: string) => { ctx.counts[key] = (ctx.counts[key] ?? 0) + 1; };
export const warn = (ctx: Ctx, code: string, message: string, ref?: string) => { ctx.warnings.push({ code, message, ref }); };

// Sources that exist and that this user may see. Anything else can't back a claim.
export function validSources(ctx: Ctx, ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const s = ctx.sources.get(id);
    if (!s || (s.ownerId && s.ownerId !== ctx.p.userId) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export const relOf = (ctx: Ctx, id: string) => ctx.intel?.rel.get(id)?.score;
export const whyOf = (ctx: Ctx, id: string) => ctx.intel?.rel.get(id)?.why;
// Blend the rules' score with the model's (0-3). The model leads when it has spoken.
export const blend = (ctx: Ctx, id: string, ruleScore: number) => {
  const r = relOf(ctx, id);
  return r === undefined ? ruleScore : 0.3 * ruleScore + 0.7 * (r / 3);
};

// Whether a fact is about this meeting: the user, a confirmed attendee, or a confirmed attendee's
// company. Memory holds everyone; a board shows only them.
export function inMeeting(ctx: Ctx, f: Fact): boolean {
  if (f.subject.kind === 'self') return true;
  if (f.subject.kind === 'person') return ctx.fr.resolvedIds.has(f.subject.id);
  return ctx.fr.attendees.some(a => a.resolved && a.companyId === f.subject.id);
}

export const isMemory = (ctx: Ctx, ids: string[]) =>
  ids.some(id => MEMORY_KINDS.includes(ctx.sources.get(id)?.kind as never));

function eligibleFacts(ctx: Ctx): Fact[] {
  const { p } = ctx;
  const people = new Map(p.people.map(x => [x.id, x]));
  const now = ms(p.now);
  const kept: Fact[] = [];
  for (const f of p.facts) {
    if (!f.text || !f.text.trim()) continue;
    if (f.visibleTo && f.visibleTo !== p.userId) { bump(ctx, 'private_filtered'); continue; }
    if (!(f.confidence >= MIN_CONFIDENCE)) { bump(ctx, 'low_confidence_dropped'); continue; }
    if (f.subject.kind === 'person' && !people.get(f.subject.id)?.resolved) { bump(ctx, 'unresolved_dropped'); continue; }
    if (isDate(f.date) && ms(f.date) > now) { bump(ctx, 'future_dropped'); continue; }
    if (f.topic === 'news' && (!isDate(f.date) || daysBetween(f.date, p.meeting.startsAt) > NEWS_MAX_AGE_DAYS)) {
      bump(ctx, 'stale_news_dropped');
      continue;
    }
    const sourceIds = validSources(ctx, f.sourceIds);
    if (!sourceIds.length) { bump(ctx, 'unsourced_dropped'); continue; }
    kept.push({ ...f, sourceIds });
  }
  return resolveConflicts(ctx, kept);
}

// Facts about the same thing with different values: keep the newer one if it is clearly
// newer and confident, and say it changed. Otherwise show neither and flag the gap.
function resolveConflicts(ctx: Ctx, facts: Fact[]): Fact[] {
  const groups = new Map<string, Fact[]>();
  const loose: Fact[] = [];
  for (const f of facts) {
    if (!f.key) { loose.push(f); continue; }
    const k = `${f.subject.kind}:${f.subject.id}:${f.key}`;
    const g = groups.get(k);
    if (g) g.push(f); else groups.set(k, [f]);
  }
  const out = [...loose];
  for (const g of groups.values()) {
    const values = new Set(g.map(f => normalize(f.value ?? f.text)));
    const sorted = [...g].sort((a, b) => dateOf(b) - dateOf(a) || b.confidence - a.confidence || a.id.localeCompare(b.id));
    if (values.size === 1) { out.push(sorted.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0]); continue; }
    const [top, ...rest] = sorted;
    const clearlyNewer = isDate(top.date) && rest.every(r => dateOf(r) < dateOf(top));
    if (clearlyNewer && top.confidence >= 0.75) {
      out.push(top);
      const was = rest.find(r => normalize(r.value ?? r.text) !== normalize(top.value ?? top.text));
      warn(ctx, 'fact_changed', `${top.key} changed: now “${top.value ?? top.text}”, was “${was?.value ?? was?.text}”`, top.id);
    } else {
      ctx.conflicts.push({ subject: top.subject, key: top.key! });
      warn(ctx, 'fact_conflict', `Sources disagree on ${top.key}; left off the board`, top.id);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const dateOf = (f: Fact) => (isDate(f.date) ? ms(f.date) : -Infinity);

export function score(ctx: Ctx, f: Fact, topics: FactTopic[]): number {
  const rank = topics.indexOf(f.topic);
  if (rank < 0) return 0;
  let s = (1 - rank * 0.1) * f.confidence;
  if (f.topic !== 'role' && f.topic !== 'background' && isDate(f.date)) {
    const age = daysBetween(f.date, ctx.p.meeting.startsAt);
    s *= age <= 90 ? 1 : age <= 365 ? 0.85 : 0.6;
  }
  if (ctx.fr.stage === 'followup') {
    if (isMemory(ctx, f.sourceIds)) s *= 1.3;
    else if (ctx.fr.lastMeeting && isDate(f.date) && ms(f.date) > ms(ctx.fr.lastMeeting.date)) s *= 1.2;
  }
  return s;
}

// Does anything known (used or not) answer this topic for the people in the meeting?
export function knows(ctx: Ctx, topic: FactTopic): boolean {
  const companies = new Set(ctx.fr.attendees.filter(a => a.resolved).map(a => a.companyId).filter(Boolean));
  return ctx.facts.some(f => f.topic === topic &&
    ((f.subject.kind === 'person' && ctx.fr.resolvedIds.has(f.subject.id)) ||
     (f.subject.kind === 'company' && companies.has(f.subject.id))));
}
