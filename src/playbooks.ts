import type { FactTopic, MeetingType, PhaseSlot, Stage } from './types.ts';

// A playbook is what a good board holds for one kind of meeting. Written by hand first;
// usage edits it later (a slot nobody uses gets dropped).

export type SlotId = 'keynotes' | 'person' | 'questions' | 'number' | 'note' | 'timeline' | 'trend' | 'bars';

// One part of the meeting: what it's called here and its share of the time.
export interface PhaseDef { slot: PhaseSlot; name: string; share: number }

export interface Playbook {
  type: MeetingType;
  stage: Stage;
  plan: PhaseDef[]; // how a meeting of this kind usually runs, in order
  goalHint: string;
  askHint: string;
  openerHint: string;
  personTopics: FactTopic[]; // preference order for lines on a person card
  companyTopics: FactTopic[];
  personLines: number;
  personCards: number;
  numbers: number;
  notes: number;
  questions: number;
  trend: 'always' | 'if-relevant' | 'never';
  bars: boolean;
  // When nothing on the board answers one of these topics, ask about it in the meeting.
  research: { topic: FactTopic; ask: string }[];
  // Lower is more important. Each extra block in a slot costs `step` more, and the board
  // drops the least important blocks first when it's over budget.
  priority: Record<SlotId, number>;
  step: number;
}

const ph = (slot: PhaseSlot, name: string, share: number): PhaseDef => ({ slot, name, share });

const FIRST: Omit<Playbook, 'type'> = {
  stage: 'first',
  plan: [ph('open', 'Open', 10), ph('learn', 'Listen', 40), ph('show', 'Share', 30), ph('close', 'Next step', 20)],
  goalHint: 'what do you want out of this meeting?',
  askHint: 'the next step to ask for',
  openerHint: 'a 30-second opener',
  personTopics: ['role', 'background', 'connection', 'interest'],
  companyTopics: ['company', 'news'],
  personLines: 5,
  personCards: 2,
  numbers: 3,
  notes: 3,
  questions: 4,
  trend: 'if-relevant',
  bars: false,
  research: [],
  priority: { keynotes: 0, person: 10, questions: 20, number: 30, note: 35, trend: 40, bars: 70, timeline: 99 },
  step: 15,
};

const FOLLOWUP: Omit<Playbook, 'type'> = {
  ...FIRST,
  stage: 'followup',
  plan: [ph('open', 'Catch up', 15), ph('show', 'What’s new', 30), ph('learn', 'Open issues', 35), ph('close', 'Next step', 20)],
  openerHint: 'what changed since you last spoke',
  personTopics: ['interest', 'quote', 'role', 'background'],
  companyTopics: ['news', 'company'],
  questions: 3,
  trend: 'if-relevant',
  priority: { keynotes: 0, person: 10, timeline: 15, number: 20, note: 25, questions: 30, trend: 60, bars: 75 },
};

type Override = Partial<Omit<Playbook, 'type' | 'stage'>>;

const BY_TYPE: Record<MeetingType, { first: Override; followup: Override }> = {
  investor: {
    first: {
      plan: [ph('open', 'Open', 10), ph('show', 'The pitch', 40), ph('learn', 'Questions', 30), ph('close', 'Next step', 20)],
      goalHint: 'what do you want? e.g. a partner meeting',
      askHint: 'the ask: next meeting, check size, timeline',
      personTopics: ['role', 'background', 'connection', 'interest'],
      companyTopics: ['fund', 'portfolio', 'news', 'company'],
      trend: 'always',
      bars: true,
      research: [
        { topic: 'fund', ask: 'What stage and check size do you usually focus on?' },
        { topic: 'portfolio', ask: 'Any portfolio companies close to what we do?' },
        { topic: 'decision', ask: 'What does your process look like from here?' },
      ],
    },
    followup: {
      plan: [ph('open', 'Catch up', 15), ph('show', 'Progress', 35), ph('learn', 'Their concerns', 30), ph('close', 'Next step', 20)],
      goalHint: 'the next step you want, e.g. a partner date',
      askHint: 'the ask: partner meeting, term sheet, timeline',
      personTopics: ['interest', 'quote', 'role', 'background'],
      companyTopics: ['news', 'fund', 'portfolio'],
      bars: true,
      research: [{ topic: 'decision', ask: 'What has to happen before a decision?' }],
    },
  },
  customer: {
    first: {
      plan: [ph('open', 'Open', 10), ph('learn', 'Their world', 45), ph('show', 'What you’d do', 25), ph('close', 'Next step', 20)],
      goalHint: 'what do you want to learn? e.g. their top pain',
      personTopics: ['role', 'interest', 'pain', 'background', 'connection'],
      companyTopics: ['company', 'pain', 'tools', 'news'],
      numbers: 2,
      questions: 5,
      trend: 'if-relevant',
      research: [
        { topic: 'pain', ask: 'What’s the most painful part of this today?' },
        { topic: 'tools', ask: 'What do you use for this today?' },
        { topic: 'decision', ask: 'Who else would weigh in on a decision like this?' },
      ],
      priority: { keynotes: 0, person: 10, questions: 15, note: 25, number: 45, trend: 60, bars: 80, timeline: 99 },
    },
    followup: {
      plan: [ph('open', 'Catch up', 15), ph('learn', 'Their concerns', 35), ph('show', 'Your answer', 30), ph('close', 'Next step', 20)],
      goalHint: 'what do you want? e.g. a pilot start date',
      askHint: 'the ask: pilot, start date, owner',
      companyTopics: ['pain', 'news', 'tools'],
      numbers: 2,
      research: [{ topic: 'decision', ask: 'Who needs to say yes for a pilot to start?' }],
    },
  },
  partnership: {
    first: {
      plan: [ph('open', 'Open', 10), ph('learn', 'What they want', 35), ph('show', 'The fit', 35), ph('close', 'Next step', 20)],
      goalHint: 'what do you want from this partnership?',
      askHint: 'the ask: a pilot or a named owner',
      personTopics: ['role', 'background', 'connection', 'decision', 'interest'],
      companyTopics: ['company', 'news', 'portfolio'],
      numbers: 2,
      research: [
        { topic: 'decision', ask: 'Who signs off on partnerships like this?' },
        { topic: 'portfolio', ask: 'Which partnerships have worked best for you?' },
      ],
    },
    followup: {
      askHint: 'the ask: a pilot or a named owner',
      numbers: 2,
      research: [{ topic: 'decision', ask: 'Who signs off, and what do they need to see?' }],
    },
  },
  negotiation: {
    first: {
      plan: [ph('open', 'Open', 10), ph('learn', 'Their position', 30), ph('show', 'Your terms', 40), ph('close', 'Agree next step', 20)],
      goalHint: 'your target terms and your walk-away',
      askHint: 'the ask: terms you want agreed',
      personTopics: ['role', 'decision', 'interest', 'background'],
      bars: true,
      research: [{ topic: 'decision', ask: 'Who has final say on terms?' }],
      priority: { keynotes: 0, person: 10, number: 20, note: 25, questions: 30, bars: 40, trend: 60, timeline: 99 },
    },
    followup: {
      plan: [ph('open', 'Catch up', 15), ph('learn', 'Open terms', 35), ph('show', 'Your position', 30), ph('close', 'Agree next step', 20)],
      goalHint: 'your target terms and your walk-away',
      askHint: 'the ask: terms you want agreed',
      bars: true,
      research: [{ topic: 'decision', ask: 'What’s left before you can sign?' }],
    },
  },
  other: {
    first: { numbers: 2, trend: 'if-relevant' },
    followup: { numbers: 2 },
  },
};

export function playbookFor(type: MeetingType, stage: Stage): Playbook {
  const base = stage === 'first' ? FIRST : FOLLOWUP;
  const o = BY_TYPE[type][stage];
  return { ...base, ...o, priority: { ...base.priority, ...(o.priority ?? {}) }, type, stage };
}

// Whole minutes for each share of a meeting, adding up to its length. Long meetings are planned
// in fives; every part gets at least a minute.
// How long a plan runs: the meeting's length in whole minutes, at least a minute a part. A length
// that's missing or not a number counts as none. The checker uses this too.
export const planLength = (durationMin: number, parts: number) => Math.max(parts, Number.isFinite(durationMin) ? Math.round(durationMin) : 0);

export function splitMinutes(durationMin: number, shares: number[]): number[] {
  const total = planLength(durationMin, shares.length);
  const sum = shares.reduce((a, b) => a + Math.max(0, b), 0) || shares.length;
  const step = total >= 45 && total % 5 === 0 ? 5 : 1;
  const out = shares.map(s => Math.max(step, Math.round((Math.max(0, s) / sum) * total / step) * step));
  // Rounding rarely lands on the total: the longest part gives or takes the difference.
  for (let guard = 0; guard < 200; guard++) {
    const diff = total - out.reduce((a, b) => a + b, 0);
    if (!diff) break;
    const i = diff > 0 ? out.indexOf(Math.max(...out)) : out.findIndex(v => v === Math.max(...out) && v > step);
    if (i < 0) { out[out.indexOf(Math.max(...out))] += diff; break; }
    out[i] += Math.sign(diff) * Math.min(step, Math.abs(diff));
  }
  return out;
}

// How many blocks (not counting the header and the plan) fit a meeting of this length.
export function blockBudget(durationMin: number): number {
  if (durationMin <= 20) return 8;
  if (durationMin <= 30) return 10;
  if (durationMin <= 45) return 12;
  return 14;
}
