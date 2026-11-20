import type { Fact, FactTopic, Source, Subject } from '../types.ts';
import type { LLM } from '../intel/llm.ts';
import { RESEARCH_TOPICS, Research } from '../intel/schemas.ts';
import { BOARD_LINE } from '../intel/schemas.ts';
import { isDate, ms, normalize } from '../text.ts';
import { companyDomain, hash } from './calendar.ts';
import type { Memory } from './types.ts';

// Before a meeting, the web fills in what memory can't yet know: who someone is, what their
// company does, what's new there. Only for people the calendar or a paste has confirmed (an
// address at their company's domain), only what a page in the search results says, each line
// with that page as its source. A person is looked up once a month at most.

const MONTH = 30 * 864e5, DAY = 864e5;
const MAX_PEOPLE = 3, MAX_COMPANIES = 2, PER_SUBJECT = 4;
// Old news isn't news; the engine drops it from boards past this age anyway.
const NEWS_DAYS = 120;

export interface ResearchPlan {
  meetingId: string;
  people: { ref: string; id: string; name: string; email?: string; companyRef?: string }[];
  companies: { ref: string; id: string; name: string; domain?: string }[];
}

const key = (s: Subject) => `${s.kind}:${s.id}`;
function recent(memory: Memory, subject: string, now: number) {
  const r = (memory.research ?? []).filter(x => x.subject === subject).sort((a, b) => ms(b.at) - ms(a.at))[0];
  return !!r && now - ms(r.at) < (r.failed ? DAY : MONTH);
}

// Who to look up for one meeting: confirmed people from outside the user's company, with a full
// name (a first name alone finds strangers), and their companies.
export function researchPlan(memory: Memory, meetingId: string, now: string): ResearchPlan | null {
  const m = memory.meetings.find(x => x.id === meetingId);
  const t = ms(now);
  if (!m || m.cancelled || ms(m.startsAt) + m.durationMin * 60_000 < t) return null;
  const own = companyDomain(memory.user?.email ?? '');
  const people: ResearchPlan['people'] = [], companies: ResearchPlan['companies'] = [];
  const companyRef = (id: string) => {
    let c = companies.find(x => x.id === id);
    const co = memory.companies.find(x => x.id === id);
    if (!c && co && companies.length < MAX_COMPANIES && !recent(memory, `company:${id}`, t)) {
      c = { ref: `c${companies.length + 1}`, id, name: co.name, ...(co.domain ? { domain: co.domain } : {}) };
      companies.push(c);
    }
    return c?.ref;
  };
  for (const pid of m.attendeeIds) {
    const p = memory.people.find(x => x.id === pid);
    if (!p?.resolved || !p.companyId) continue;
    if (own && p.email && companyDomain(p.email) === own) continue;
    const ref = companyRef(p.companyId);
    if (people.length >= MAX_PEOPLE || p.name.trim().split(/\s+/).length < 2 || recent(memory, `person:${p.id}`, t)) continue;
    people.push({ ref: `p${people.length + 1}`, id: p.id, name: p.name, ...(p.email ? { email: p.email } : {}), ...(ref ? { companyRef: ref } : {}) });
  }
  return people.length || companies.length ? { meetingId, people, companies } : null;
}

export const RESEARCH_SYSTEM = `You research the people and companies someone is about to meet, so they walk in prepared. Search the web, then answer with what you found.

Rules:
- A person is the one at the company and email domain given. Names are shared by many people: use a page only if it ties this name to this company (the company's own site, a profile or article naming both). If you can't be sure it's them, leave it out.
- Useful: their role and how long they've held it; work background that matters (earlier companies, what they built, what they write or speak about); what the company does, its size, stage and funding; news from the last four months; tools they're known to use.
- Never: anything about their private life (family, health, home, age, religion, politics), rumours, or guesses. Nothing from a page that isn't about them.
- Each finding is one line for a board, ${BOARD_LINE}, in plain words. Say it as a fact about them, not about the page ("Joined Northwind as VP Operations in 2024", not "LinkedIn says...").
- url is the page it comes from, copied exactly from your search results. published is the date the page shows (YYYY-MM-DD), or "" if it shows none. News needs a date.
- At most ${PER_SUBJECT} findings each. Leave out anything already known (listed under KNOWN). Few findings, or none, is a fine answer.`;

export function researchPrompt(memory: Memory, plan: ResearchPlan, now: string): string {
  const m = memory.meetings.find(x => x.id === plan.meetingId)!;
  const u = memory.user;
  const out = [`TODAY ${now.slice(0, 10)}`, '', 'THE USER', u ? `${u.role} at ${u.company}` : '(not given)', '', 'THE MEETING', `"${m.title}", ${m.startsAt.slice(0, 10)}`];
  if (plan.people.length) {
    out.push('', 'PEOPLE');
    for (const p of plan.people) {
      const co = plan.companies.find(c => c.ref === p.companyRef) ?? memory.companies.find(c => c.id === memory.people.find(x => x.id === p.id)?.companyId);
      out.push(`- [${p.ref}] ${p.name}${p.email ? `, ${p.email}` : ''}${co ? `, at ${co.name}` : ''}`);
    }
  }
  if (plan.companies.length) {
    out.push('', 'COMPANIES');
    for (const c of plan.companies) out.push(`- [${c.ref}] ${c.name}${c.domain ? ` (${c.domain})` : ''}`);
  }
  const subjects = new Set([...plan.people.map(p => `person:${p.id}`), ...plan.companies.map(c => `company:${c.id}`)]);
  const known = memory.facts.filter(f => subjects.has(key(f.subject)));
  if (known.length) {
    out.push('', 'KNOWN (don’t repeat)');
    for (const f of known.slice(0, 40)) out.push(`- ${f.text}`);
  }
  out.push('', 'Research them and answer as JSON.');
  return out.join('\n');
}

// Pages are matched without their fragment or a trailing slash, the way a model might copy them.
const page = (url: string) => { try { const u = new URL(url); u.hash = ''; return u.href.replace(/\/$/, '').toLowerCase(); } catch { return ''; } };

export interface Applied { memory: Memory; added: number; dropped: { text: string; why: string }[] }

// What the model found, kept only where it holds up: a page the search actually returned, a known
// person or company, a topic that fits, news with a recent date, nothing already known.
export function applyResearch(memory: Memory, plan: ResearchPlan, answer: Research, found: { url: string }[], now: string): Applied {
  const m: Memory = structuredClone(memory);
  const today = now.slice(0, 10), t = ms(now);
  const pages = new Set(found.map(f => page(f.url)).filter(Boolean));
  const subjects = new Map<string, Subject>([
    ...plan.people.map(p => [p.ref, { kind: 'person', id: p.id }] as const),
    ...plan.companies.map(c => [c.ref, { kind: 'company', id: c.id }] as const),
  ]);
  const dropped: Applied['dropped'] = [];
  const count = new Map<string, number>();
  let added = 0;
  for (const f of answer.findings) {
    const text = f.text.replace(/\s+/g, ' ').trim().slice(0, 200);
    const subject = subjects.get(f.about.trim());
    const drop = (why: string) => dropped.push({ text, why });
    if (!text) continue;
    if (!subject) { drop('not about anyone in the meeting'); continue; }
    if (!(RESEARCH_TOPICS[subject.kind as 'person' | 'company'] as readonly string[]).includes(f.topic)) { drop(`a ${f.topic} finding isn’t about a ${subject.kind}`); continue; }
    if (!pages.has(page(f.url))) { drop('its page wasn’t in the search results'); continue; }
    const published = isDate(f.published) && ms(f.published) <= t ? f.published.slice(0, 10) : undefined;
    if (f.topic === 'news' && (!published || t - ms(published) > NEWS_DAYS * DAY)) { drop('news without a recent date'); continue; }
    const k = key(subject);
    if ((count.get(k) ?? 0) >= PER_SUBJECT) { drop('enough about them already'); continue; }
    if (m.facts.some(x => key(x.subject) === k && normalize(x.text) === normalize(text))) { drop('already known'); continue; }
    const url = f.url.trim();
    const sourceId = `s-web-${hash(page(url))}`;
    if (!m.sources.some(s => s.id === sourceId)) m.sources.push({ id: sourceId, kind: 'web', ref: url, seenAt: today, url } as Source);
    m.facts.push({ id: `f-web-${hash(`${k}|${normalize(text)}`)}`, subject, topic: f.topic as FactTopic, text, sourceIds: [sourceId], date: published ?? today, confidence: 0.7 } as Fact);
    count.set(k, (count.get(k) ?? 0) + 1);
    added++;
  }
  m.research = [...(m.research ?? []), ...[...plan.people.map(p => `person:${p.id}`), ...plan.companies.map(c => `company:${c.id}`)]
    .map(subject => ({ subject, at: now, found: count.get(subject) ?? 0 }))].slice(-500);
  return { memory: m, added, dropped };
}

// The whole step for one meeting. Null when there's nobody new to look up or no model that
// can search; a failed search is logged so it's tried again tomorrow, not on every refresh.
export async function researchMeeting(memory: Memory, meetingId: string, now: string, llm: LLM | null): Promise<Applied | null> {
  const plan = researchPlan(memory, meetingId, now);
  if (!plan || !llm?.research) return null;
  try {
    const r = await llm.research({ step: 'research', system: RESEARCH_SYSTEM, prompt: researchPrompt(memory, plan, now), schema: Research, effort: 'medium', maxTokens: 16000 });
    return applyResearch(memory, plan, r.value, r.found, now);
  } catch {
    const failed = [...plan.people.map(p => `person:${p.id}`), ...plan.companies.map(c => `company:${c.id}`)].map(subject => ({ subject, at: now, found: 0, failed: true }));
    return { memory: { ...memory, research: [...(memory.research ?? []), ...failed].slice(-500) }, added: 0, dropped: [] };
  }
}
