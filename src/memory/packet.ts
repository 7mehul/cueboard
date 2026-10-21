import type { ContextDoc, Packet } from '../types.ts';
import { ms } from '../text.ts';
import type { DocKind, Memory } from './types.ts';

// A meeting's packet is memory seen from that meeting. Everything is passed through; the engine
// keeps only what's about the people coming, confirmed, sourced and the user's own to see.

const CONTEXT_KIND: Record<DocKind, ContextDoc['kind']> = { invite: 'invite', email: 'email', notes: 'notes', transcript: 'notes', profile: 'memo', deck: 'deck', other: 'memo' };

export function packetFor(memory: Memory, meetingId: string, now: string): Packet | null {
  const m = memory.meetings.find(x => x.id === meetingId);
  if (!m) return null;
  const coming = new Set(m.attendeeIds);
  // The documents about these people, newest first, for the model to read the meeting from.
  const context = memory.docs
    .filter(d => d.sourceId === m.sourceId || d.personIds.some(id => coming.has(id)))
    .filter(d => ms(d.date) <= ms(now))
    .sort((a, b) => ms(b.date) - ms(a.date))
    .slice(0, 8)
    .map(d => ({ id: d.id, kind: CONTEXT_KIND[d.kind], text: d.text, sourceId: d.sourceId, date: d.date }));
  return {
    userId: memory.userId,
    now,
    ...(memory.user ? { user: memory.user } : {}),
    context,
    meeting: { id: m.id, title: m.title, startsAt: m.startsAt, durationMin: m.durationMin, ...(m.goal ? { goal: m.goal } : {}), attendeeIds: m.attendeeIds },
    self: { companyName: memory.user?.company || 'Your company' },
    people: memory.people,
    companies: memory.companies,
    sources: memory.sources,
    facts: memory.facts,
    metrics: memory.metrics,
    disclosures: memory.disclosures,
    amounts: [],
    touches: memory.touches,
    commitments: memory.commitments,
    objections: memory.objections,
    questions: [],
  };
}

// The meetings still ahead, soonest first, for picking which one to prepare.
export function upcoming(memory: Memory, now: string) {
  return memory.meetings.filter(m => ms(m.startsAt) >= ms(now) - 3_600_000).sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
}
