import * as z from 'zod/v4';
import { FACT_TOPICS, MEETING_TYPES } from '../types.ts';
import { LIMITS } from '../text.ts';

// What the model returns at each step. Kept small and concrete so any capable model can fill it.

// Text that goes on the board as written has to fit a board line.
export const BOARD_LINE = `${LIMITS.line.words} words and ${LIMITS.line.chars} characters or fewer`;

export const MeetingBrief = z.object({
  persona: z.string().describe('Persona id from the library that best fits the user, or "other"'),
  meetingType: z.enum(MEETING_TYPES as [string, ...string[]]).describe('Closest board layout for this meeting'),
  process: z.string().describe('Which of the user’s processes this meeting belongs to, e.g. "Seed fundraise"'),
  step: z.string().describe('Where in that process this meeting is, in a few words'),
  purpose: z.string().describe('Why this meeting is happening, one sentence'),
  goal: z.object({
    text: z.string().describe(`The outcome that would make this meeting a success, ${BOARD_LINE}`),
    basis: z.enum(['stated', 'agreed_next_step', 'inferred']).describe('stated = the user set it; agreed_next_step = from the last meeting; inferred = your best reading'),
    alternatives: z.array(z.string()).describe('Up to 2 other plausible goals'),
  }),
  theyWant: z.array(z.string()).describe('What the other side most likely wants from this meeting'),
  decides: z.array(z.string().describe(BOARD_LINE)).describe('What will decide whether this meeting goes well, most important first'),
  opener: z.string().describe(`What the user says first once hellos are done, grounded in the context; ${BOARD_LINE}. Empty if nothing supports one`),
  ask: z.string().describe(`The concrete next step to ask for before the meeting ends; ${BOARD_LINE}`),
  risks: z.array(z.string()).describe('What could go wrong or surprise the user'),
  numbers: z.enum(['ours', 'theirs', 'both', 'none']).describe('Whose numbers matter most in this meeting'),
  needs: z.array(z.object({
    need: z.string(),
    why: z.string(),
  })).describe('The information the user must have in front of them, most important first, specific to this meeting'),
  unknowns: z.array(z.string()).describe('Things not in the context that block the goal and should be asked or looked up'),
});
export type MeetingBrief = z.infer<typeof MeetingBrief>;

export const Ranking = z.object({
  items: z.array(z.object({
    id: z.string(),
    score: z.number().int().min(0).max(3).describe('0 = irrelevant here, 1 = background, 2 = useful, 3 = must be in front of me'),
    why: z.string().describe('10 words or fewer'),
  })),
  questions: z.array(z.object({
    text: z.string().describe('A question to ask in the meeting, 14 words or fewer'),
    why: z.string(),
  })).describe('Up to 4 questions that resolve the unknowns and are not already among the candidates'),
});
export type Ranking = z.infer<typeof Ranking>;

export const Rewrite = z.object({
  blocks: z.array(z.object({
    id: z.string(),
    lines: z.array(z.string()),
  })),
});
export type Rewrite = z.infer<typeof Rewrite>;

// ---------- memory: what one document says that's worth remembering ----------

const quote = () => z.string().describe('The exact words in the document this comes from, copied character for character: 3 to 30 words');

export const Extraction = z.object({
  summary: z.string().describe('What this document is, in a few words: "Your notes from the call with Maya"'),
  meeting: z.object({
    title: z.string(),
    startsAt: z.string().describe('ISO 8601, with the time zone offset if the document gives one'),
    durationMin: z.number().int(),
    attendeeRefs: z.array(z.string()).describe('Refs of the people invited, not the user'),
    goal: z.string().nullable().describe('Only if the document states what the meeting is for'),
  }).nullable().describe('Only if this document is an invitation to a meeting that has not happened yet'),
  happened: z.object({
    kind: z.enum(['meeting', 'call', 'email', 'intro']),
    date: z.string().describe('ISO 8601 date'),
    summary: z.string().describe(`Where things were left, ${BOARD_LINE}`),
    peopleRefs: z.array(z.string()),
    quote: quote(),
  }).nullable().describe('Only if this document records an interaction that already took place'),
  people: z.array(z.object({
    ref: z.string().describe('A short local id such as "p1", used by the other items'),
    knownId: z.string().nullable().describe('The id from KNOWN PEOPLE if this is the same person'),
    name: z.string().describe('Full name as written'),
    email: z.string().nullable().describe('Only if written in the document'),
    companyRef: z.string().nullable(),
  })).describe('Everyone who matters to the relationship, except the user'),
  companies: z.array(z.object({
    ref: z.string().describe('A short local id such as "c1"'),
    knownId: z.string().nullable().describe('The id from KNOWN COMPANIES if this is the same company'),
    name: z.string(),
    domain: z.string().nullable(),
  })),
  facts: z.array(z.object({
    about: z.string().describe('A person or company ref, or "self" for the user’s own side'),
    topic: z.enum(FACT_TOPICS as [string, ...string[]]),
    text: z.string().describe(`The fact as a line on a board, ${BOARD_LINE}`),
    quote: quote(),
  })),
  numbers: z.array(z.object({
    owner: z.string().describe('"self" for the user’s own numbers, or the ref of the company whose number it is'),
    label: z.string().describe('A short name; reuse the KNOWN NUMBERS label when it is the same measure'),
    value: z.number().describe('A plain number in its unit: 40800 for "$40.8k", 2.8 for "2.8%"'),
    prefix: z.string().describe('"$", "€", or ""'),
    suffix: z.string().describe('"%" or ""'),
    asOf: z.string().nullable().describe('ISO 8601 date the number is for, if the document says'),
    better: z.enum(['up', 'down']).describe('Which way is good for its owner'),
    sharedWith: z.array(z.string()).describe('Refs of people the user told this number to in this document'),
    quote: quote(),
  })),
  promises: z.array(z.object({
    by: z.enum(['user', 'them']),
    personRef: z.string().nullable().describe('Who made it if "them"; who it was made to if "user"'),
    text: z.string().describe(`What will be done, ${BOARD_LINE}`),
    due: z.string().nullable().describe('ISO 8601 date, resolved against the document date ("by Friday")'),
    quote: quote(),
  })),
  kept: z.array(z.object({ promiseId: z.string().describe('An id from KNOWN OPEN PROMISES'), quote: quote() }))
    .describe('Known open promises this document shows were done'),
  objections: z.array(z.object({
    text: z.string().describe(`The concern as a short heading in their words, ${LIMITS.title.words} words or fewer: "Isn’t this a Zoom feature?"`),
    raisedByRef: z.string().nullable(),
    answer: z.string().nullable().describe(`The user’s answer if they gave one, ${BOARD_LINE}`),
    quote: quote(),
  })),
  settled: z.array(z.object({ objectionId: z.string().describe('An id from KNOWN OBJECTIONS'), quote: quote() }))
    .describe('Known objections this document shows are no longer a concern'),
});
export type Extraction = z.infer<typeof Extraction>;

// Which schema answers which step, so a server can run any step a page asks for by name.
export const SCHEMAS = { understand: MeetingBrief, rank: Ranking, extract: Extraction } as const;
