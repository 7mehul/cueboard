// What the canvas app gets from the engine, bundled into the page as `CueEngine`.
import { buildBoard } from '../src/engine.ts';
import { playbookFor } from '../src/playbooks.ts';
import { toCanvas } from '../src/export.ts';
import type { CanvasBoard } from '../src/export.ts';
import type { MeetingType, Packet, Stage } from '../src/types.ts';
import { buildBoardSmart } from '../src/intel/smart.ts';
import { artifactModel } from '../src/intel/providers/browser.ts';
import { PERSONAS } from '../src/intel/knowledge.ts';
import { serverModel, serverStatus } from '../src/intel/providers/server.ts';
import type { LLM } from '../src/intel/llm.ts';
import { addMeeting, commit, readDoc } from '../src/memory/extract.ts';
import type { Choice, MeetingForm, Proposal } from '../src/memory/extract.ts';
import { packetFor, upcoming } from '../src/memory/packet.ts';
import { PASTE_BREAK, splitPaste } from '../src/memory/split.ts';
import { todayModel } from '../src/memory/today.ts';
import { granolaToDoc } from '../src/memory/granola.ts';
import { meetingInputs, prepPlan, syncCalendar } from '../src/memory/calendar.ts';
import { parseIcs } from '../src/memory/ics.ts';
import { researchMeeting, researchPlan } from '../src/memory/research.ts';
import { mergeRefresh } from '../src/refresh.ts';
import { emptyMemory } from '../src/memory/types.ts';
import type { Doc, Memory } from '../src/memory/types.ts';
import { generate } from '../synth/generate.ts';
import { scenarios } from '../scenarios/scenarios.ts';
import { danaFollowup } from '../test/fixtures.ts';

export interface Sample { id: string; name: string; sub: string; make: () => Packet }

const TYPES: [MeetingType, string][] = [['investor', 'Investor'], ['customer', 'Customer'], ['partnership', 'Partnership'], ['negotiation', 'Negotiation']];

// Until real meetings flow in, boards start from these: one meeting per persona, then generated ones.
export function samples(): Sample[] {
  const label = (id: string) => PERSONAS.find(p => p.id === id)?.label ?? id;
  const out: Sample[] = scenarios().map(s => ({ id: s.id, name: s.packet.meeting.title, sub: `${label(s.persona)} · ${s.situation}`, make: () => s.packet }));
  TYPES.forEach(([type, typeLabel], t) => {
    const stage: Stage = 'first';
    for (let seed = 11 + t * 2 * 97; seed < 2000; seed++) {
      const g = generate(seed * 104729, { type, stage, edgeRate: 0.04 });
      if (g.tags.includes('sparse') || g.tags.includes('no_attendees') || g.packet.meeting.durationMin < 30) continue;
      out.push({ id: `gen-${type}-${stage}`, name: g.packet.meeting.title, sub: `${typeLabel} · generated`, make: () => g.packet });
      break;
    }
  });
  return out;
}

export function exampleBoard(): CanvasBoard { const p = danaFollowup(); return toCanvas(buildBoard(p), p); }

export function boardFor(sampleId: string): CanvasBoard | null {
  const s = samples().find(x => x.id === sampleId);
  if (!s) return null;
  const p = s.make();
  return toCanvas(buildBoard(p), p);
}

// With Claude available in the page (a published artifact), the model reads the meeting first.
export async function boardForSmart(sampleId: string, sample: unknown) {
  const s = samples().find(x => x.id === sampleId);
  if (!s) return null;
  const p = s.make();
  const r = await buildBoardSmart(p, sample ? artifactModel(sample as Parameters<typeof artifactModel>[0]) : null);
  return { board: toCanvas(r.board, p), mode: r.mode, brief: r.brief ?? null, failed: r.steps.filter(x => !x.ok).map(x => x.step) };
}

// ---------- memory ----------

// Which model the page can use: Claude inside a published artifact, or the local server's.
export function modelFor(sample: unknown): LLM { return artifactModel(sample as Parameters<typeof artifactModel>[0]); }
export function localModel(): LLM { return serverModel('/api/llm', 'local'); }
export { serverStatus, upcoming, splitPaste, PASTE_BREAK, todayModel, granolaToDoc, syncCalendar, meetingInputs, prepPlan, mergeRefresh, parseIcs, researchMeeting, researchPlan };

// Memory as saved by the page: whatever is missing is filled in, so an older save still loads.
export function reviveMemory(raw: unknown, userId: string): Memory {
  const base = emptyMemory(userId);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Memory>;
  const arr = <K extends keyof Memory>(k: K) => (Array.isArray(r[k]) ? r[k] : base[k]) as Memory[K];
  return {
    userId: typeof r.userId === 'string' ? r.userId : userId, ...(r.user && typeof r.user === 'object' ? { user: r.user } : {}),
    people: arr('people'), companies: arr('companies'), sources: arr('sources'), facts: arr('facts'), metrics: arr('metrics'),
    disclosures: arr('disclosures'), touches: arr('touches'), commitments: arr('commitments'), objections: arr('objections'),
    meetings: arr('meetings'), docs: arr('docs'), ...(Array.isArray(r.research) ? { research: r.research } : {}),
  };
}

// Reading several documents at once: each is read against memory as it would be with the ones
// before it saved, so a person in the invite is the same person in the email and the notes.
export async function readDocuments(memory: Memory, docs: Doc[], llm: LLM, onEach?: (i: number) => void) {
  const out: { doc: Doc; proposal?: Proposal; personIds: Record<string, string>; error?: string }[] = [];
  let m = memory;
  for (const [i, doc] of docs.entries()) {
    onEach?.(i);
    try {
      const { proposal } = await readDoc(llm, m, doc);
      const r = commit(m, doc, proposal, { people: proposal.people.map(p => p.ref), items: proposal.items.map(x => x.id), meeting: null });
      m = r.memory;
      out.push({ doc, proposal, personIds: r.personIds });
    } catch (e) {
      out.push({ doc, personIds: {}, error: (e as Error)?.message ?? 'Couldn’t read this one' });
    }
  }
  return out;
}

// Saving what the user kept: the same documents, in the same order, with their choices. The
// meeting the user set up comes from `fromDoc`'s invite (or their form); any other invites in the
// same paste are saved as meetings too, with the people the user kept.
export function saveDocuments(memory: Memory, read: { doc: Doc; proposal?: Proposal; personIds: Record<string, string> }[], choices: Choice[], meeting?: MeetingForm | null, fromDoc?: string) {
  let m = memory, added = 0;
  read.forEach((r, i) => {
    if (!r.proposal) return;
    const c = commit(m, r.doc, r.proposal, { ...choices[i], meeting: null });
    m = c.memory; added += c.added;
  });
  let meetingId: string | undefined;
  if (meeting) {
    const from = read.find(r => r.doc.id === fromDoc) ?? read.find(r => r.proposal?.meeting);
    const a = addMeeting(m, meeting, from ? `s-${from.doc.id}` : undefined);
    m = a.memory; meetingId = a.meetingId; added++;
  }
  for (const r of read) {
    const pm = r.proposal?.meeting;
    if (!pm || r.doc.id === fromDoc || !m.sources.some(s => s.id === `s-${r.doc.id}`)) continue;
    const ids = pm.attendeeRefs.map(ref => { const p = r.proposal!.people.find(x => x.ref === ref); return p ? p.knownId ?? r.personIds[ref] : undefined; })
      .filter((x): x is string => !!x && m.people.some(p => p.id === x));
    m = addMeeting(m, { title: pm.title, startsAt: pm.startsAt, durationMin: pm.durationMin, attendeeIds: ids, ...(pm.goal ? { goal: pm.goal } : {}) }, `s-${r.doc.id}`).memory;
  }
  return { memory: m, added, ...(meetingId ? { meetingId } : {}) };
}

export async function boardForMemory(memory: Memory, meetingId: string, now: string, llm: LLM | null) {
  const p = packetFor(memory, meetingId, now);
  if (!p) return null;
  const r = await buildBoardSmart(p, llm);
  // Goals to offer in one tap when the user hasn't said theirs: the model's reading and its
  // runners-up. Without a model there's only the kind of thing to write, as a placeholder.
  const g = r.brief?.goal;
  const goals = g && g.basis !== 'stated' ? [...new Set([g.text, ...g.alternatives].map(t => t.trim()).filter(Boolean))].slice(0, 3) : [];
  return {
    board: toCanvas(r.board, p), mode: r.mode, brief: r.brief ?? null, failed: r.steps.filter(x => !x.ok).map(x => x.step), stage: r.board.stage,
    goals, goalHint: playbookFor(r.board.type, r.board.stage).goalHint,
  };
}

export { buildBoard, toCanvas, emptyMemory };
