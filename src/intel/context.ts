import type { Ctx } from '../facts.ts';
import { inMeeting, validSources } from '../facts.ts';
import type { NumberInfo } from '../compose.ts';
import { fmtValue, isDate, longDate, ms, shortDate } from '../text.ts';

// What the model is allowed to see. Built only from facts that already passed the engine's
// filters (sourced, confident, about confirmed people, not someone else's private data), so the
// model can't surface anything the rules would have held back.

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

export function meetingContext(ctx: Ctx, infos: NumberInfo[]): string {
  const { p, fr } = ctx;
  const out: string[] = [];
  const u = p.user;
  out.push('USER');
  out.push(u ? `${u.role} at ${u.company}${u.objectives?.length ? `. Working toward: ${u.objectives.join('; ')}` : ''}` : `Works at ${p.self.companyName} (role not given)`);

  out.push('', 'MEETING');
  out.push(`"${p.meeting.title}", ${longDate(p.meeting.startsAt)}${p.meeting.durationMin > 0 ? `, ${p.meeting.durationMin} min` : ''}.`);
  out.push(fr.stage === 'first' ? 'No earlier meetings with these people on record.' : `Meeting ${fr.priorMeetings.length + 1} with them.`);
  if (p.meeting.type) out.push(`The user marked it as: ${p.meeting.type}.`);
  if (p.meeting.goal) out.push(`The user's stated goal: "${p.meeting.goal}".`);

  const companies = new Map(p.companies.map(c => [c.id, c.name]));
  out.push('', 'ATTENDEES');
  if (!fr.attendees.length) out.push('(none besides the user)');
  for (const a of fr.attendees) {
    const company = a.companyId ? companies.get(a.companyId) : undefined;
    out.push(`- ${a.name}${company ? `, ${company}` : ''}${a.resolved ? '' : ' (identity not confirmed; nothing is known about them yet)'}`);
    for (const f of ctx.facts.filter(f => f.subject.kind === 'person' && f.subject.id === a.id)) {
      out.push(`  [${f.id}] ${f.topic}: ${clip(f.text, 160)}${f.date ? ` (${shortDate(f.date)})` : ''}`);
    }
  }
  const theirCompanies = new Set(fr.attendees.filter(a => a.resolved).map(a => a.companyId).filter(Boolean));
  const companyFacts = ctx.facts.filter(f => f.subject.kind === 'company' && theirCompanies.has(f.subject.id));
  if (companyFacts.length) {
    out.push('', 'THEIR COMPANY');
    for (const f of companyFacts) out.push(`- [${f.id}] ${f.topic}: ${clip(f.text, 160)}${f.date ? ` (${shortDate(f.date)})` : ''}`);
  }

  if (fr.priorTouches.length) {
    out.push('', 'HISTORY (oldest first)');
    for (const t of fr.priorTouches.slice(-8)) out.push(`- ${shortDate(t.date)} ${t.kind}: ${clip(t.summary, 140)}`);
  }

  const start = ms(p.meeting.startsAt), now = ms(p.now);
  const promises = p.commitments.filter(c => c.personId && fr.resolvedIds.has(c.personId) && isDate(c.madeAt) && ms(c.madeAt) < start);
  if (promises.length) {
    out.push('', 'PROMISES');
    for (const c of promises) {
      const done = isDate(c.doneAt) && ms(c.doneAt) <= now;
      out.push(`- ${c.owner === 'self' ? 'User' : 'Them'}: ${c.text}${done ? ' (done)' : isDate(c.due) && ms(c.due) < now ? ` (overdue since ${shortDate(c.due)})` : ''}`);
    }
  }

  if (infos.length) {
    out.push('', 'NUMBERS');
    for (const n of infos) {
      const whose = n.own ? 'ours' : 'theirs';
      const was = n.disc ? `, told them ${fmtValue(n.disc.value, n.m.prefix, n.m.suffix)} on ${shortDate(n.disc.date)}` : n.since ? `, was ${fmtValue(n.since.value, n.m.prefix, n.m.suffix)} at the last meeting` : '';
      out.push(`- [m:${n.m.id}] ${n.m.label} (${whose}): ${fmtValue(n.latest.value, n.m.prefix, n.m.suffix)} on ${shortDate(n.latest.date)}${was}`);
    }
  }

  const docs = (p.context ?? []).filter(d => validSources(ctx, [d.sourceId]).length);
  if (docs.length) {
    out.push('', 'NOTES AND EMAILS (the user’s own context)');
    for (const d of docs.slice(0, 8)) out.push(`- ${d.kind}${d.date ? ` ${shortDate(d.date)}` : ''}: ${clip(d.text.replace(/\s+/g, ' '), 1200)}`);
  }

  const self = ctx.facts.filter(f => f.subject.kind === 'self');
  if (self.length) {
    out.push('', 'THE USER’S OWN MATERIAL');
    for (const f of self) out.push(`- [${f.id}] ${f.topic}: ${clip(f.text, 160)}`);
  }
  return out.join('\n');
}

export interface Candidate { id: string; text: string }

// Everything the board could show, each with a stable id the model scores.
export function candidates(ctx: Ctx, infos: NumberInfo[]): Candidate[] {
  const { p, pb, fr } = ctx;
  const names = new Map(p.people.map(x => [x.id, x.name]));
  const out: Candidate[] = [];
  for (const a of fr.attendees) if (a.resolved) out.push({ id: `p:${a.id}`, text: `person: ${a.name}` });
  for (const f of ctx.facts) {
    if (!inMeeting(ctx, f)) continue;
    const about = f.subject.kind === 'person' ? names.get(f.subject.id) : f.subject.kind === 'company' ? p.companies.find(c => c.id === f.subject.id)?.name : 'the user';
    out.push({ id: f.id, text: `${f.topic} about ${about}: ${clip(f.text, 140)}` });
  }
  for (const n of infos) out.push({ id: `m:${n.m.id}`, text: `number (${n.own ? 'ours' : 'theirs'}): ${n.m.label} = ${fmtValue(n.latest.value, n.m.prefix, n.m.suffix)}` });
  for (const a of p.amounts) out.push({ id: `a:${a.id}`, text: `chart (ours): ${a.label}` });
  for (const o of p.objections) {
    if (o.resolved) continue;
    const raised = o.raisedBy && fr.resolvedIds.has(o.raisedBy);
    out.push({ id: `o:${o.id}`, text: `${raised ? 'objection they raised' : 'objection we often hear'}: ${clip(o.text, 120)}${o.answer ? ` → answer: ${clip(o.answer, 100)}` : ''}` });
  }
  for (const q of p.questions) out.push({ id: `q:${q.id}`, text: `question: ${clip(q.text, 120)}` });
  for (const r of pb.research) out.push({ id: `gap:${r.topic}`, text: `question: ${r.ask}` });
  return out;
}
