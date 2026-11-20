import type { LLM, Usage } from '../intel/llm.ts';
import { BOARD_LINE, ExtractionAnswer, fromAnswer } from '../intel/schemas.ts';
import type { Extraction } from '../intel/schemas.ts';
import type { Commitment, Company, Disclosure, Fact, FactTopic, Metric, Objection, Person, Source, SourceKind, Subject, Touch } from '../types.ts';
import { MEETING_TYPES } from '../types.ts';
import { fmtValue, isDate, longDate, ms, normalize, shortDate, wordCount } from '../text.ts';
import type { Doc, DocKind, MeetingRecord, Memory } from './types.ts';

// Reading a document into memory, in three steps:
//   read     the model says what the document holds: people, facts, numbers, promises, objections
//   propose  code checks every item against the document and against memory: each needs a quote
//            that is really in the text, a number has to appear in its quote, people are matched to
//            the ones already known, and anything memory already holds is set aside
//   commit   the items the user approved become records, each pointing at the document
// Nothing reaches memory that isn't in the document and hasn't been seen by the user.

// ---------- read ----------

const KIND_WORDS: Record<DocKind, string> = {
  invite: 'a calendar invite',
  email: 'an email',
  notes: 'the user’s own notes',
  transcript: 'a call transcript',
  profile: 'a public profile of someone, pasted by the user',
  deck: 'a deck or document',
  other: 'a document',
};

const SYSTEM = `You are the memory step inside Cueboard, which prepares one person for their meetings. You read one document the user gave you and pull out what is worth remembering for their next meetings with these people.

Rules:
- Only what the document says. Every item carries a quote: the exact words from the document, copied character for character. Items whose quote is not in the document are thrown away, so never paraphrase or tidy a quote.
- Lines that go on a board (facts, summaries, promises, objections, answers) are plain words, ${BOARD_LINE}.
- Decide whose side things are on from the user's role. Their own company is "self". An investor's numbers about a startup they're evaluating belong to the startup, not the user.
- people: everyone who matters to the relationship, never the user. Set knownId when the person is in KNOWN PEOPLE. Only give an email that is written in the document.
- numbers: value is a plain number in its unit (40800 for "$40.8k", 2.8 for "2.8%"). Reuse a KNOWN NUMBERS label for the same measure. sharedWith lists the people the user told this number to in this document, only when the user is the one telling.
- promises: something someone said they would do. Resolve dates like "Friday" or "in two weeks" against the document date.
- resolved: KNOWN OPEN PROMISES this document shows were done, and KNOWN OBJECTIONS it shows are no longer a concern.
- objections: concerns or pushback they raised, with the user's answer if one was given.
- facts, by topic: role, background, connection (how they know the user), interest (what they care about), quote (something worth repeating back), company, news, fund, portfolio, pain, tools (what they use today), decision (who decides, how). For "self": proof (a proof point the user used), avoid (something this person has already heard and shouldn't hear again), opener, ask.
- happened: if the document records an interaction that already took place, where things were left.
- meeting: only if the document invites the user to a meeting that hasn't happened yet.
- Some documents hold the user's own notes, an AI-written summary and a transcript. Quote the user's notes or the transcript where you can: an AI summary is someone else's paraphrase.
- Every field is always present: use "" for anything the document doesn't give, and leave meeting.title or happened.summary "" when there is no meeting or no past interaction.
- Leave out small talk, logistics, signatures, and anything you're unsure of. An empty list is better than a guess.`;

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

// Only the slice of memory this document could be about: people it names or emails, and what's
// open with them. Keeps the prompt small as memory grows, and keeps unrelated people out of it.
function relevant(memory: Memory, doc: Doc) {
  const text = normalize(doc.text), raw = doc.text.toLowerCase();
  // Whole words in any script ("\b" only knows ASCII, so it missed José and 王伟).
  const word = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, 'u');
  const named = (name: string) => { const parts = normalize(name).split(' ').filter(w => w.length > 2 || /[^\p{Script=Latin}\p{N}]/u.test(w)); return parts.length > 0 && parts.some(w => word(w).test(text)); };
  const people = memory.people.filter(p => named(p.name) || (p.email && raw.includes(p.email.toLowerCase())));
  const ids = new Set(people.map(p => p.id));
  const companyIds = new Set(people.map(p => p.companyId).filter(Boolean));
  const companies = memory.companies.filter(c => companyIds.has(c.id) || named(c.name) || (c.domain && raw.includes(c.domain.toLowerCase())));
  for (const c of companies) companyIds.add(c.id);
  const metrics = memory.metrics.filter(m => !m.owner || (m.owner.kind === 'company' && companyIds.has(m.owner.id)) || (m.owner.kind === 'person' && ids.has(m.owner.id)));
  const promises = memory.commitments.filter(c => !c.doneAt && c.personId && ids.has(c.personId));
  const objections = memory.objections.filter(o => !o.resolved && o.raisedBy && ids.has(o.raisedBy));
  return { people, companies, metrics, promises, objections };
}

export function readPrompt(memory: Memory, doc: Doc): string {
  const u = memory.user;
  const r = relevant(memory, doc);
  const companyName = (id?: string) => memory.companies.find(c => c.id === id)?.name;
  const personName = (id?: string) => memory.people.find(p => p.id === id)?.name ?? 'someone';
  const out: string[] = [];
  const who = u ? [u.name, u.email ? `<${u.email}>` : ''].filter(Boolean).join(' ') : '';
  out.push('USER', u ? `${who ? who + ', ' : ''}${u.role} at ${u.company}${u.objectives?.length ? `. Working toward: ${u.objectives.join('; ')}` : ''}` : 'Role not given');
  out.push('', `DOCUMENT: ${KIND_WORDS[doc.kind]}${doc.title ? `, "${doc.title}"` : ''}, dated ${longDate(doc.date)} (${doc.date.slice(0, 10)})`, '---', doc.text.trim(), '---');
  out.push('', 'KNOWN PEOPLE', ...(r.people.length ? r.people.map(p => `- [${p.id}] ${p.name}${p.email ? `, ${p.email}` : ''}${companyName(p.companyId) ? `, ${companyName(p.companyId)}` : ''}`) : ['(none)']));
  out.push('', 'KNOWN COMPANIES', ...(r.companies.length ? r.companies.map(c => `- [${c.id}] ${c.name}${c.domain ? ` (${c.domain})` : ''}`) : ['(none)']));
  if (r.metrics.length) out.push('', 'KNOWN NUMBERS', ...r.metrics.map(m => `- ${m.label} (${m.owner ? companyName(m.owner.id) ?? personName(m.owner.id) : 'self'})`));
  if (r.promises.length) out.push('', 'KNOWN OPEN PROMISES', ...r.promises.map(c => `- [${c.id}] ${c.owner === 'self' ? `User to ${personName(c.personId)}` : personName(c.personId)}: ${clip(c.text, 120)}${c.due ? ` (due ${shortDate(c.due)})` : ''}`));
  if (r.objections.length) out.push('', 'KNOWN OBJECTIONS', ...r.objections.map(o => `- [${o.id}] ${personName(o.raisedBy)}: ${clip(o.text, 120)}`));
  out.push('', 'Pull out what is worth remembering. Answer as JSON.');
  return out.join('\n');
}

export async function readDoc(llm: LLM, memory: Memory, doc: Doc): Promise<{ proposal: Proposal; usage?: Usage }> {
  const r = await llm.json({ step: 'extract', system: SYSTEM, prompt: readPrompt(memory, doc), schema: ExtractionAnswer, effort: 'medium' });
  const isPromise = (id: string) => memory.commitments.some(c => c.id === id);
  return { proposal: propose(memory, doc, fromAnswer(r.value, isPromise)), usage: r.usage };
}

// ---------- propose ----------

export interface ProposedPerson { ref: string; name: string; email?: string; companyRef?: string; knownId?: string }
export interface ProposedCompany { ref: string; name: string; domain?: string; knownId?: string }
interface Base { id: string; text: string; quote: string }
export type Item = Base & (
  | { kind: 'happened'; touchKind: Touch['kind']; date: string; peopleRefs: string[] }
  | { kind: 'fact'; about: string; topic: FactTopic }
  | { kind: 'number'; owner: string; label: string; value: number; prefix: string; suffix: string; date: string; better: 'up' | 'down'; sharedWith: string[] }
  | { kind: 'promise'; by: 'self' | 'them'; personRef?: string; due?: string }
  | { kind: 'kept'; commitmentId: string }
  | { kind: 'objection'; raisedByRef?: string; answer?: string }
  | { kind: 'settled'; objectionId: string }
);
export interface ProposedMeeting { title: string; startsAt: string; durationMin: number; attendeeRefs: string[]; goal?: string }
export interface Proposal {
  docId: string;
  summary: string;
  meeting?: ProposedMeeting;
  people: ProposedPerson[];
  companies: ProposedCompany[];
  items: Item[];
  // What was set aside, so the review can say so plainly.
  dropped: { what: string; why: 'not_in_document' | 'number_not_in_quote' | 'already_known' | 'unknown_reference' | 'bad_date' }[];
}

// Quotes are compared loosely on spacing, case, curly quotes and dashes; on wording, not at all.
const flat = (t: string) => t.toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const trimPunct = (t: string) => t.replace(/^[\s"'.,;:!?()[\]-]+|[\s"'.,;:!?()[\]-]+$/g, '');
export const inDocument = (docText: string, quote: string) => {
  const q = trimPunct(flat(quote));
  return wordCount(q) >= 2 && flat(docText).includes(q);
};

// Every number written in a piece of text, with "k", "m" and "bn" applied, so 40800 matches "$40.8k".
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|bn|b|thousand|million|billion)?(?!(?!x\b)[a-z])/gi)) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    const u = (m[2] ?? '').toLowerCase();
    const mult = u === 'k' || u === 'thousand' ? 1e3 : u === 'm' || u === 'mm' || u === 'million' ? 1e6 : u === 'b' || u === 'bn' || u === 'billion' ? 1e9 : 1;
    if (Number.isFinite(v)) out.push(v, v * mult);
  }
  return out;
}
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const same = (a: string, b: string) => normalize(a) === normalize(b);

export function propose(memory: Memory, doc: Doc, x: Extraction): Proposal {
  const dropped: Proposal['dropped'] = [];
  const quoted = (what: string, q: string) => { if (inDocument(doc.text, q)) return true; dropped.push({ what, why: 'not_in_document' }); return false; };
  const raw = doc.text.toLowerCase();
  const selfName = memory.user?.company;

  // Companies: the user's own company is "self"; others are matched to known ones by id, domain or name.
  const selfRefs = new Set<string>(), userRefs = new Set<string>();
  const companies: ProposedCompany[] = [];
  for (const c of x.companies) {
    if (!c.ref || !c.name.trim() || companies.some(k => k.ref === c.ref)) continue;
    if (selfName && same(c.name, selfName)) { selfRefs.add(c.ref); continue; }
    const domain = c.domain && raw.includes(c.domain.toLowerCase()) ? c.domain.toLowerCase() : undefined;
    const known = memory.companies.find(k => k.id === c.knownId) ?? memory.companies.find(k => (domain && k.domain === domain) || same(k.name, c.name));
    companies.push({ ref: c.ref, name: c.name.trim(), ...(domain ? { domain } : {}), ...(known ? { knownId: known.id } : {}) });
  }
  const companyRefs = new Set(companies.map(c => c.ref));

  // People: matched by id, then by an email that's really in the document, then by full name.
  const people: ProposedPerson[] = [];
  for (const p of x.people) {
    if (!p.ref || !p.name.trim() || people.some(k => k.ref === p.ref) || selfRefs.has(p.ref)) continue;
    // The user is never one of the people.
    if ((memory.user?.name && same(p.name, memory.user.name)) || (memory.user?.email && p.email?.trim().toLowerCase() === memory.user.email.toLowerCase())) { userRefs.add(p.ref); continue; }
    const email = p.email && EMAIL.test(p.email.trim()) && raw.includes(p.email.trim().toLowerCase()) ? p.email.trim().toLowerCase() : undefined;
    const byName = memory.people.filter(k => same(k.name, p.name));
    const known = memory.people.find(k => k.id === p.knownId && (same(k.name, p.name) || (email && k.email === email)))
      ?? (email ? memory.people.find(k => k.email === email) : undefined)
      ?? (byName.length === 1 ? byName[0] : undefined);
    people.push({ ref: p.ref, name: p.name.trim(), ...(email ? { email } : {}), ...(p.companyRef && companyRefs.has(p.companyRef) ? { companyRef: p.companyRef } : {}), ...(known ? { knownId: known.id } : {}) });
  }
  const personRefs = new Set(people.map(p => p.ref));
  const knownOf = (ref?: string) => people.find(p => p.ref === ref)?.knownId ?? companies.find(c => c.ref === ref)?.knownId;
  const subjectOk = (about: string) => about === 'self' || selfRefs.has(about) || personRefs.has(about) || companyRefs.has(about);
  // Facts about the user as a person (their own title, their background) aren't worth remembering.
  const SELF_TOPICS = new Set<string>(['opener', 'ask', 'proof', 'avoid']);
  const asSelf = (about: string) => (selfRefs.has(about) ? 'self' : about);
  const dateOr = (d: string | null | undefined, fallback: string) => (d && isDate(d) ? d.slice(0, 10) : fallback);
  const docDate = doc.date.slice(0, 10);

  const items: Item[] = [];
  let n = 0;
  const id = (k: string) => `${k}-${doc.id}-${++n}`;

  if (x.happened && memory.touches.some(t => t.id === `t-${doc.id}`)) dropped.push({ what: 'what happened', why: 'already_known' });
  else if (x.happened && quoted('what happened', x.happened.quote)) {
    items.push({
      id: id('h'), kind: 'happened', text: x.happened.summary.trim(), quote: x.happened.quote, touchKind: x.happened.kind,
      date: dateOr(x.happened.date, docDate), peopleRefs: x.happened.peopleRefs.filter(r => personRefs.has(r)),
    });
  }

  for (const f of x.facts) {
    if (!f.text.trim() || !quoted(`fact “${f.text}”`, f.quote)) continue;
    if (userRefs.has(f.about) && !SELF_TOPICS.has(f.topic)) continue;
    const said = userRefs.has(f.about) ? 'self' : f.about;
    if (!subjectOk(said)) { dropped.push({ what: `fact “${f.text}”`, why: 'unknown_reference' }); continue; }
    const about = asSelf(said);
    const subject = about === 'self' ? 'self' : knownOf(about);
    if (subject && memory.facts.some(k => (k.subject.kind === 'self' ? 'self' : k.subject.id) === subject && same(k.text, f.text))) {
      dropped.push({ what: `fact “${f.text}”`, why: 'already_known' }); continue;
    }
    items.push({ id: id('f'), kind: 'fact', text: f.text.trim(), quote: f.quote, about, topic: f.topic as FactTopic });
  }

  for (const v of x.numbers) {
    const what = `number ${v.label} ${fmtValue(v.value, v.prefix, v.suffix)}`;
    if (!v.label.trim() || !Number.isFinite(v.value) || !quoted(what, v.quote)) continue;
    // The number itself has to be in the quote: the model may not do arithmetic or round.
    // Signs are written many ways (−1.5%, "down 1.5%"), so the size is what has to be there.
    if (!numbersIn(v.quote).some(k => near(k, Math.abs(v.value)))) { dropped.push({ what, why: 'number_not_in_quote' }); continue; }
    if (!subjectOk(v.owner) && !userRefs.has(v.owner)) { dropped.push({ what, why: 'unknown_reference' }); continue; }
    const owner = userRefs.has(v.owner) ? 'self' : asSelf(v.owner);
    const date = dateOr(v.asOf, docDate);
    const metric = findMetric(memory, owner === 'self' ? undefined : knownOf(owner), v.label);
    const sharedWith = v.sharedWith.filter(r => personRefs.has(r));
    // Already known if memory has this point and already knows who was told it.
    const told = (ref: string) => { const pid = knownOf(ref); return !!pid && memory.disclosures.some(d => d.metricId === metric!.id && d.personId === pid && d.date.slice(0, 10) === docDate); };
    if (metric && metric.points.some(p => p.date.slice(0, 10) === date && near(p.value, v.value)) && sharedWith.every(told)) {
      dropped.push({ what, why: 'already_known' }); continue;
    }
    items.push({
      id: id('n'), kind: 'number', text: `${v.label.trim()} ${fmtValue(v.value, v.prefix, v.suffix)}`, quote: v.quote,
      owner, label: metric?.label ?? v.label.trim(), value: v.value, prefix: v.prefix, suffix: v.suffix, date, better: v.better, sharedWith,
    });
  }

  for (const c of x.promises) {
    if (!c.text.trim() || !quoted(`promise “${c.text}”`, c.quote)) continue;
    const to = c.personRef && !userRefs.has(c.personRef) ? c.personRef : undefined;
    if (to && !personRefs.has(to)) { dropped.push({ what: `promise “${c.text}”`, why: 'unknown_reference' }); continue; }
    const by = c.by === 'user' ? 'self' : 'them';
    const person = knownOf(to);
    if (person && memory.commitments.some(k => k.owner === by && k.personId === person && same(k.text, c.text))) {
      dropped.push({ what: `promise “${c.text}”`, why: 'already_known' }); continue;
    }
    const due = c.due && isDate(c.due) ? c.due.slice(0, 10) : undefined;
    items.push({ id: id('c'), kind: 'promise', text: c.text.trim(), quote: c.quote, by, ...(to ? { personRef: to } : {}), ...(due ? { due } : {}) });
  }

  for (const k of x.kept) {
    const c = memory.commitments.find(m => m.id === k.promiseId && !m.doneAt);
    if (!c) { dropped.push({ what: `kept promise ${k.promiseId}`, why: 'unknown_reference' }); continue; }
    if (!quoted(`kept promise “${c.text}”`, k.quote)) continue;
    items.push({ id: id('k'), kind: 'kept', text: c.text, quote: k.quote, commitmentId: c.id });
  }

  for (const o of x.objections) {
    if (!o.text.trim() || !quoted(`objection “${o.text}”`, o.quote)) continue;
    if (o.raisedByRef && !personRefs.has(o.raisedByRef)) { dropped.push({ what: `objection “${o.text}”`, why: 'unknown_reference' }); continue; }
    const by = knownOf(o.raisedByRef ?? undefined);
    if (by && memory.objections.some(k => k.raisedBy === by && same(k.text, o.text))) { dropped.push({ what: `objection “${o.text}”`, why: 'already_known' }); continue; }
    items.push({ id: id('o'), kind: 'objection', text: o.text.trim(), quote: o.quote, ...(o.raisedByRef ? { raisedByRef: o.raisedByRef } : {}), ...(o.answer?.trim() ? { answer: o.answer.trim() } : {}) });
  }

  for (const s of x.settled) {
    const o = memory.objections.find(m => m.id === s.objectionId && !m.resolved);
    if (!o) { dropped.push({ what: `settled objection ${s.objectionId}`, why: 'unknown_reference' }); continue; }
    if (!quoted(`settled objection “${o.text}”`, s.quote)) continue;
    items.push({ id: id('s'), kind: 'settled', text: o.text, quote: s.quote, objectionId: o.id });
  }

  let meeting: ProposedMeeting | undefined;
  if (x.meeting) {
    if (!isDate(x.meeting.startsAt)) dropped.push({ what: 'the meeting time', why: 'bad_date' });
    else meeting = {
      title: x.meeting.title.trim() || 'Meeting',
      startsAt: x.meeting.startsAt,
      durationMin: Number.isInteger(x.meeting.durationMin) && x.meeting.durationMin >= 5 && x.meeting.durationMin <= 600 ? x.meeting.durationMin : 30,
      attendeeRefs: x.meeting.attendeeRefs.filter(r => personRefs.has(r)),
      ...(x.meeting.goal?.trim() ? { goal: x.meeting.goal.trim() } : {}),
    };
  }

  // People and companies nothing refers to aren't worth asking about.
  const used = new Set<string>([
    ...items.flatMap(i => i.kind === 'happened' ? i.peopleRefs : i.kind === 'fact' ? [i.about] : i.kind === 'number' ? [i.owner, ...i.sharedWith] : i.kind === 'promise' ? [i.personRef ?? ''] : i.kind === 'objection' ? [i.raisedByRef ?? ''] : []),
    ...(meeting?.attendeeRefs ?? []),
  ]);
  const keptPeople = people.filter(p => used.has(p.ref));
  for (const p of keptPeople) if (p.companyRef) used.add(p.companyRef);
  return {
    docId: doc.id, summary: x.summary.trim() || KIND_WORDS[doc.kind],
    ...(meeting ? { meeting } : {}),
    people: keptPeople, companies: companies.filter(c => used.has(c.ref)), items, dropped,
  };
}

function findMetric(memory: Memory, ownerId: string | undefined, label: string): Metric | undefined {
  return memory.metrics.find(m => same(m.label, label) && (ownerId ? m.owner?.id === ownerId : !m.owner));
}

// ---------- commit ----------

export interface Choice {
  people: string[];            // refs of new people the user confirmed (known people are always linked)
  items: string[];             // ids of the items the user kept
  meeting?: ProposedMeeting | null;  // as the user left it, or null for none
}
export interface Committed { memory: Memory; meetingId?: string; added: number; personIds: Record<string, string> }

const SOURCE_KIND: Record<DocKind, SourceKind> = { invite: 'calendar', email: 'email', notes: 'notes', transcript: 'debrief', profile: 'enrichment', deck: 'deck', other: 'user' };
const SOURCE_REF: Record<DocKind, string> = { invite: 'Calendar invite', email: 'Email', notes: 'Your notes', transcript: 'Call transcript', profile: 'Pasted profile', deck: 'Your deck', other: 'Pasted text' };
const slug = (t: string) => normalize(t).replace(/ /g, '-').slice(0, 32) || 'x';
const uniq = (taken: Set<string>, base: string) => { let id = base, i = 2; while (taken.has(id)) id = `${base}-${i++}`; taken.add(id); return id; };

export function commit(memory: Memory, doc: Doc, proposal: Proposal, choice: Choice): Committed {
  const m: Memory = structuredClone(memory);
  const keep = new Set(choice.items);
  const items = proposal.items.filter(i => keep.has(i.id));
  const meeting = choice.meeting === undefined ? proposal.meeting : choice.meeting ?? undefined;
  const docDate = doc.date.slice(0, 10);

  // Notes about a conversation that happened are memory of that meeting; other notes are just notes.
  const kind: SourceKind = doc.kind === 'notes' && items.some(i => i.kind === 'happened') ? 'debrief' : SOURCE_KIND[doc.kind];
  const sourceId = `s-${doc.id}`;
  const ids = new Set([...m.people, ...m.companies, ...m.metrics].map(x => x.id));

  // Companies and people first, so everything else can point at them.
  const companyId = new Map<string, string>();
  for (const c of proposal.companies) {
    const known = c.knownId && m.companies.find(k => k.id === c.knownId);
    if (known) { companyId.set(c.ref, known.id); if (c.domain && !known.domain) known.domain = c.domain; continue; }
    const co: Company = { id: uniq(ids, `co-${slug(c.name)}`), name: c.name, ...(c.domain ? { domain: c.domain } : {}) };
    m.companies.push(co); companyId.set(c.ref, co.id);
  }
  const confirmed = new Set(choice.people);
  const personId = new Map<string, string>();
  for (const p of proposal.people) {
    const known = p.knownId && m.people.find(k => k.id === p.knownId);
    if (known) {
      personId.set(p.ref, known.id);
      if (p.email && !known.email) known.email = p.email;
      if (p.companyRef && !known.companyId && companyId.has(p.companyRef)) known.companyId = companyId.get(p.companyRef);
      continue;
    }
    if (!confirmed.has(p.ref)) continue;
    // The user confirmed who this is, which is what lets facts about them reach a board.
    const person: Person = { id: uniq(ids, `p-${slug(p.name)}`), name: p.name, ...(p.email ? { email: p.email } : {}), ...(p.companyRef && companyId.has(p.companyRef) ? { companyId: companyId.get(p.companyRef) } : {}), resolved: true };
    m.people.push(person); personId.set(p.ref, person.id);
  }
  const subjectOf = (ref: string): Subject | undefined =>
    ref === 'self' ? { kind: 'self', id: 'me' } : personId.has(ref) ? { kind: 'person', id: personId.get(ref)! } : companyId.has(ref) ? { kind: 'company', id: companyId.get(ref)! } : undefined;

  let added = 0;
  for (const i of items) {
    switch (i.kind) {
      case 'happened': {
        const personIds = i.peopleRefs.map(r => personId.get(r)).filter((x): x is string => !!x);
        if (!personIds.length) break;
        const t: Touch = { id: `t-${doc.id}`, date: i.date, kind: i.touchKind, summary: i.text, personIds, sourceId };
        m.touches = m.touches.filter(x => x.id !== t.id).concat(t); added++;
        break;
      }
      case 'fact': {
        const subject = subjectOf(i.about); if (!subject) break;
        const f: Fact = {
          id: i.id, subject, topic: i.topic, text: i.text, sourceIds: [sourceId], date: docDate, confidence: doc.kind === 'profile' ? 0.8 : 0.9,
          ...(i.topic === 'role' ? { key: 'title', value: normalize(i.text) } : {}),
        };
        m.facts.push(f); added++;
        break;
      }
      case 'number': {
        const owner = i.owner === 'self' ? undefined : subjectOf(i.owner);
        if (i.owner !== 'self' && !owner) break;
        let metric = findMetric(m, owner?.id, i.label);
        if (!metric) {
          metric = {
            id: uniq(ids, `m-${slug(i.label)}`), ...(owner ? { owner } : {}), label: i.label, ...(i.prefix ? { prefix: i.prefix } : {}), ...(i.suffix ? { suffix: i.suffix } : {}),
            better: i.better, meetingTypes: [...MEETING_TYPES], keywords: normalize(i.label).split(' ').filter(w => w.length > 3), points: [],
          };
          m.metrics.push(metric);
        }
        if (!metric.points.some(p => p.date.slice(0, 10) === i.date && near(p.value, i.value))) {
          metric.points.push({ date: i.date, value: i.value, sourceId });
          metric.points.sort((a, b) => ms(a.date) - ms(b.date));
        }
        for (const r of i.sharedWith) {
          const pid = personId.get(r); if (!pid) continue;
          const d: Disclosure = { metricId: metric.id, personId: pid, value: i.value, date: docDate, sourceId };
          if (!m.disclosures.some(x => x.metricId === d.metricId && x.personId === d.personId && x.date === d.date)) m.disclosures.push(d);
        }
        added++;
        break;
      }
      case 'promise': {
        const pid = i.personRef ? personId.get(i.personRef) : undefined;
        if (i.personRef && !pid) break;
        const c: Commitment = { id: i.id, owner: i.by, ...(pid ? { personId: pid } : {}), text: i.text, madeAt: docDate, ...(i.due ? { due: i.due } : {}), sourceId };
        m.commitments.push(c); added++;
        break;
      }
      case 'kept': {
        const c = m.commitments.find(x => x.id === i.commitmentId);
        if (c && !c.doneAt) { c.doneAt = docDate; added++; }
        break;
      }
      case 'objection': {
        const by = i.raisedByRef ? personId.get(i.raisedByRef) : undefined;
        if (i.raisedByRef && !by) break;
        const o: Objection = {
          id: i.id, text: i.text, ...(i.answer ? { answer: i.answer } : {}), meetingTypes: [...MEETING_TYPES],
          ...(by ? { raisedBy: by, raisedAt: docDate } : {}), resolved: false, sourceIds: [sourceId],
        };
        m.objections.push(o); added++;
        break;
      }
      case 'settled': {
        const o = m.objections.find(x => x.id === i.objectionId);
        if (o && !o.resolved) { o.resolved = true; added++; }
        break;
      }
    }
  }

  let meetingId: string | undefined;
  if (meeting && isDate(meeting.startsAt)) {
    const attendeeIds = [...new Set(meeting.attendeeRefs.map(r => personId.get(r)).filter((x): x is string => !!x))];
    const existing = m.meetings.find(x => same(x.title, meeting.title) && ms(x.startsAt) === ms(meeting.startsAt));
    if (existing) {
      existing.attendeeIds = [...new Set([...existing.attendeeIds, ...attendeeIds])];
      existing.durationMin = meeting.durationMin;
      if (meeting.goal) existing.goal = meeting.goal;
      meetingId = existing.id;
    } else {
      const rec: MeetingRecord = { id: `mtg-${doc.id}`, title: meeting.title, startsAt: meeting.startsAt, durationMin: meeting.durationMin, attendeeIds, ...(meeting.goal ? { goal: meeting.goal } : {}), sourceId };
      m.meetings.push(rec); meetingId = rec.id;
    }
    added++;
  }

  if (added) {
    const ref = doc.title?.trim() || SOURCE_REF[doc.kind];
    const src: Source = { id: sourceId, kind, ref, seenAt: docDate, ownerId: m.userId, ...(doc.url ? { url: doc.url } : {}) };
    m.sources = m.sources.filter(s => s.id !== sourceId).concat(src);
    m.docs = m.docs.filter(d => d.id !== doc.id).concat({
      id: doc.id, kind: doc.kind, title: proposal.summary, text: doc.text.slice(0, 20000), date: docDate, sourceId, personIds: [...new Set(personId.values())],
    });
  }
  return { memory: m, ...(meetingId ? { meetingId } : {}), added, personIds: Object.fromEntries(personId) };
}

// A meeting the user set up by hand (no invite to read), with people already in memory.
export interface MeetingForm { title: string; startsAt: string; durationMin: number; attendeeIds: string[]; goal?: string }
export function addMeeting(memory: Memory, form: MeetingForm, sourceId?: string): { memory: Memory; meetingId: string } {
  const m: Memory = structuredClone(memory);
  const attendeeIds = [...new Set(form.attendeeIds.filter(id => m.people.some(p => p.id === id)))];
  const existing = m.meetings.find(x => same(x.title, form.title) && ms(x.startsAt) === ms(form.startsAt));
  if (existing) {
    Object.assign(existing, { attendeeIds, durationMin: form.durationMin, ...(form.goal ? { goal: form.goal } : {}) });
    return { memory: m, meetingId: existing.id };
  }
  const id = `mtg-${slug(form.title)}-${form.startsAt.slice(0, 10)}`;
  let src = sourceId && m.sources.some(s => s.id === sourceId) ? sourceId : undefined;
  if (!src) {
    src = `s-${id}`;
    m.sources.push({ id: src, kind: 'user', ref: 'You added this', seenAt: new Date().toISOString().slice(0, 10), ownerId: m.userId });
  }
  m.meetings.push({ id, title: form.title.trim() || 'Meeting', startsAt: form.startsAt, durationMin: form.durationMin, attendeeIds, ...(form.goal ? { goal: form.goal } : {}), sourceId: src });
  return { memory: m, meetingId: id };
}
