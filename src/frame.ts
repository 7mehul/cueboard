import type { MeetingType, Packet, Person, Stage, Touch } from './types.ts';
import { isDate, ms } from './text.ts';

// Picking the meeting type is a model step in the full pipeline. This keyword rule is the
// default so the engine runs without a model; pass a different classifier to swap it.
export type Classifier = (title: string) => MeetingType;

const RULES: [MeetingType, RegExp][] = [
  ['negotiation', /\b(pricing|contract|terms|renewal|negotiat\w*|procurement|msa|redlines?)\b/i],
  ['partnership', /\b(partnership|alliance|co-?marketing|integration partners?|reseller|channel partners?)\b/i],
  ['investor', /\b(ventures?|capital|vc|fund|investors?|seed|series [a-d]|pitch|angel)\b/i],
  ['customer', /\b(discovery|demo|pilot|customer|user interview|onboarding|kickoff|intro call)\b/i],
];

export const classifyByTitle: Classifier = title => RULES.find(([, re]) => re.test(title))?.[0] ?? 'other';

export interface Frame {
  type: MeetingType;
  typeGuessed: boolean;
  stage: Stage;
  attendees: Person[];
  resolvedIds: Set<string>;
  priorTouches: Touch[];
  priorMeetings: Touch[];
  lastMeeting?: Touch;
}

export function frame(p: Packet, classify: Classifier = classifyByTitle): Frame {
  const type = p.meeting.type ?? classify(p.meeting.title);
  const byId = new Map(p.people.map(x => [x.id, x]));
  const attendees: Person[] = [];
  for (const id of new Set(p.meeting.attendeeIds)) {
    const person = byId.get(id);
    if (person) attendees.push(person);
  }
  // Memory is only trusted for people whose identity is confirmed: a wrong match would put
  // someone else's history on the board.
  const resolvedIds = new Set(attendees.filter(a => a.resolved).map(a => a.id));
  const start = ms(p.meeting.startsAt);
  const priorTouches = p.touches
    .filter(t => isDate(t.date) && ms(t.date) < start && t.personIds.some(id => resolvedIds.has(id)))
    .sort((a, b) => ms(a.date) - ms(b.date) || a.id.localeCompare(b.id));
  const priorMeetings = priorTouches.filter(t => t.kind === 'meeting' || t.kind === 'call');
  return {
    type,
    typeGuessed: !p.meeting.type,
    stage: priorMeetings.length ? 'followup' : 'first',
    attendees,
    resolvedIds,
    priorTouches,
    priorMeetings,
    lastMeeting: priorMeetings.at(-1),
  };
}
