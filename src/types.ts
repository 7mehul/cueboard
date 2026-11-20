// A meeting packet is everything known about one meeting. Workflows (calendar, email,
// research, After notes) produce packets; the engine turns a packet into a board.

export type MeetingType = 'investor' | 'customer' | 'partnership' | 'negotiation' | 'other';
export const MEETING_TYPES: MeetingType[] = ['investor', 'customer', 'partnership', 'negotiation', 'other'];
export type Stage = 'first' | 'followup';

export type SourceKind =
  | 'web' | 'enrichment'                                          // public research
  | 'calendar' | 'email' | 'deck' | 'notes' | 'profile' | 'user'  // the user's own context
  | 'board' | 'debrief';                                          // memory: past boards and After notes
export const MEMORY_KINDS: SourceKind[] = ['board', 'debrief'];

export interface Source {
  id: string;
  kind: SourceKind;
  ref: string;
  seenAt: string;
  ownerId?: string; // private sources (email, notes) belong to one user
  url?: string;     // where to open it, when it has an address (a Granola note)
}

export interface Subject { kind: 'person' | 'company' | 'self'; id: string }

export type FactTopic =
  | 'role' | 'background' | 'connection' | 'interest' | 'quote'                        // a person
  | 'company' | 'news' | 'fund' | 'portfolio' | 'pain' | 'tools' | 'decision'         // their company
  | 'opener' | 'ask' | 'proof'                                                        // your side
  | 'avoid';                                                                          // already covered, don't repeat
export const FACT_TOPICS: FactTopic[] = ['role', 'background', 'connection', 'interest', 'quote', 'company', 'news', 'fund', 'portfolio', 'pain', 'tools', 'decision', 'opener', 'ask', 'proof', 'avoid'];

export interface Fact {
  id: string;
  subject: Subject;
  topic: FactTopic;
  text: string;
  sourceIds: string[];
  date?: string;
  confidence: number;
  // Facts with the same subject and key describe one thing; different values conflict.
  key?: string;
  value?: string;
  meetingTypes?: MeetingType[];
  visibleTo?: string;
}

export interface Person {
  id: string;
  name: string;
  email?: string;
  companyId?: string;
  resolved: boolean; // identity confirmed; research about an unconfirmed person is never shown
}

export interface Company { id: string; name: string; domain?: string }

export interface MetricPoint { date: string; value: number; sourceId: string }

export interface Metric {
  id: string;
  // Whose number this is. Unset means the user's own (their company's MRR); a company or
  // person means the other side's (a prospect's volumes, a startup's traction for an investor).
  owner?: Subject;
  label: string;
  prefix?: string;
  suffix?: string;
  better: 'up' | 'down';
  meetingTypes: MeetingType[];
  keywords?: string[]; // ties the number to what a person cares about ("retention", "churn")
  points: MetricPoint[];
}

// A number you told someone. Memory of these draws "since last time" and keeps you consistent.
export interface Disclosure { metricId: string; personId: string; value: number; date: string; sourceId: string }

export interface Amounts {
  id: string;
  label: string;
  prefix?: string;
  suffix?: string;
  meetingTypes: MeetingType[];
  items: { label: string; value: number }[];
  sourceId: string;
}

export interface Touch {
  id: string;
  date: string;
  kind: 'intro' | 'meeting' | 'call' | 'email';
  summary: string;
  personIds: string[];
  sourceId: string;
}

export interface Commitment {
  id: string;
  owner: 'self' | 'them';
  personId?: string;
  text: string;
  madeAt: string;
  due?: string;
  doneAt?: string;
  sourceId: string;
}

export interface Objection {
  id: string;
  text: string;
  answer?: string;
  meetingTypes: MeetingType[];
  raisedBy?: string;
  raisedAt?: string;
  resolved: boolean;
  sourceIds: string[];
}

export interface QuestionCandidate {
  id: string;
  text: string;
  meetingTypes: MeetingType[];
  stage?: Stage;
  priority: number;
}

// Who the user is and what they're working toward. The engine reasons from this rather than
// assuming everyone is a founder pitching their own company.
export interface UserProfile {
  name?: string;           // so the user is never mistaken for one of the people they meet
  email?: string;
  role: string;            // "Founder & CEO", "Head of Global Partnerships", "Partner at a seed fund"
  persona?: string;        // a persona id from the knowledge library, if known
  company: string;
  objectives?: string[];   // "Raise a $3M seed by December", "Sign 3 EMEA resellers by Q2"
}

// Raw text the user or a connector supplied: the invite description, an email, notes, a memo.
// The model reads it to understand the meeting; it is never shown on the board directly.
export interface ContextDoc {
  id: string;
  kind: 'invite' | 'email' | 'notes' | 'deck' | 'memo';
  text: string;
  sourceId: string;
  date?: string;
}

export interface Packet {
  userId: string;
  now: string;
  timeZone?: string; // the user's IANA zone, for showing dates; UTC when unset
  user?: UserProfile;
  context?: ContextDoc[];
  meeting: {
    id: string;
    title: string;
    startsAt: string;
    durationMin: number;
    type?: MeetingType;
    goal?: string;
    attendeeIds: string[];
  };
  self: { companyName: string };
  people: Person[];
  companies: Company[];
  sources: Source[];
  facts: Fact[];
  metrics: Metric[];
  disclosures: Disclosure[];
  amounts: Amounts[];
  touches: Touch[];
  commitments: Commitment[];
  objections: Objection[];
  questions: QuestionCandidate[];
}

// ---------- output ----------

export type BlockKind = 'header' | 'person' | 'keynotes' | 'phase' | 'questions' | 'number' | 'note' | 'trend' | 'bars' | 'timeline';
export type Zone = 'top' | 'plan' | 'reference' | 'run' | 'numbers' | 'notes' | 'visual';
// The parts a meeting runs through. Every plan opens and closes; in between the user mostly
// listens and asks (learn) or mostly presents and answers (show), in whichever order suits.
export type PhaseSlot = 'open' | 'learn' | 'show' | 'close';
export const PHASE_SLOTS: PhaseSlot[] = ['open', 'learn', 'show', 'close'];
export type GapKind = 'lookup' | 'ask' | 'confirm';

export interface Line {
  text: string;
  label?: string;
  sourceIds: string[];
  factIds?: string[];
  claim: boolean; // states something as true, so it needs a source
  memory?: boolean;
  gap?: GapKind;
  tone?: 'good' | 'bad' | 'done' | 'open' | 'overdue';
  suggested?: boolean; // the engine's inference (a suggested goal, what decides the meeting); the user confirms it
}

export interface ChartPoint { label: string; value: number }

export interface TimelineEvent {
  date: string;
  label: string;
  kind: Touch['kind'] | 'today';
  memory: boolean;
  sourceIds: string[];
}

export interface Block {
  id: string;
  kind: BlockKind;
  zone: Zone;
  slot: string;
  priority: number;
  required?: boolean;
  color?: 'yellow' | 'mint' | 'sky' | 'rose' | 'lilac';
  title: string;
  lines: Line[];
  subjectId?: string;
  metricId?: string;
  why?: string; // why this block is on the board, when the model ranked it
  phase?: PhaseSlot; // a phase block's own slot; on any other block, the phase it's needed in
  minutes?: { from: number; to: number }; // a phase block's share of the meeting
  chart?: { prefix: string; suffix: string; points: ChartPoint[]; sourceIds: string[] };
  events?: TimelineEvent[];
}

export interface Placement { id: string; x: number; y: number; w: number; h: number }

export interface Warning { code: string; message: string; ref?: string }

export interface Board {
  meetingId: string;
  type: MeetingType;
  typeGuessed: boolean;
  stage: Stage;
  title: string;
  blocks: Block[];
  canvas: Placement[];
  rail: string[];
  gaps: string[];
  warnings: Warning[];
  budget: { max: number; used: number; dropped: string[] };
}
