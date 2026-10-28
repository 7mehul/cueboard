import type { Commitment, Company, Disclosure, Fact, Metric, Objection, Person, Source, Touch, UserProfile } from '../types.ts';

// Memory is everything one user's Cueboard knows, across all their meetings, kept as typed records
// about people and companies. Each record points at the document it came from. A meeting packet
// is a view of it: the engine looks people up by who's coming, it doesn't search text.

export type DocKind = 'invite' | 'email' | 'notes' | 'transcript' | 'profile' | 'deck' | 'other';
export const DOC_KINDS: DocKind[] = ['invite', 'email', 'notes', 'transcript', 'profile', 'deck', 'other'];

// Something the user pasted or a connector supplied, with the date it's from.
export interface Doc { id: string; kind: DocKind; text: string; date: string; title?: string; url?: string }

export interface MeetingRecord {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  attendeeIds: string[];
  goal?: string;
  sourceId: string;
}

// The document itself, kept so the model can read it again when preparing for these people.
export interface MemoryDoc { id: string; kind: DocKind; title: string; text: string; date: string; sourceId: string; personIds: string[] }

export interface Memory {
  userId: string;
  user?: UserProfile;
  people: Person[];
  companies: Company[];
  sources: Source[];
  facts: Fact[];
  metrics: Metric[];
  disclosures: Disclosure[];
  touches: Touch[];
  commitments: Commitment[];
  objections: Objection[];
  meetings: MeetingRecord[];
  docs: MemoryDoc[];
}

export function emptyMemory(userId: string, user?: UserProfile): Memory {
  return {
    userId, ...(user ? { user } : {}), people: [], companies: [], sources: [], facts: [], metrics: [], disclosures: [],
    touches: [], commitments: [], objections: [], meetings: [], docs: [],
  };
}
