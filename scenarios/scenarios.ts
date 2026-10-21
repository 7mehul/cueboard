import type { Commitment, ContextDoc, Fact, FactTopic, MeetingType, Metric, Packet, Person, QuestionCandidate, Source, SourceKind, Stage, Subject, Touch, UserProfile } from '../src/types.ts';
import { danaFirst, danaFollowup } from '../test/fixtures.ts';

// One realistic meeting per persona and situation, each with what a good board must and must
// not contain. They are the spec for "intelligent": the rules engine is expected to miss some of
// these, and a model-backed run should pass them. Every person and company here is made up.

export interface Expect {
  type?: MeetingType | MeetingType[];
  stage?: Stage;
  goal?: RegExp;            // the goal on the board, stated or suggested
  show?: string[];          // fact ids, m:<metric>, o:<objection>, p:<person> that must be on the board
  hide?: string[];          // ids that must not be
  hideText?: RegExp[];      // text that must not appear anywhere on the board
  numbers?: 'ours' | 'theirs';
  ask?: RegExp[];           // each must match at least one question
}

export interface Scenario { id: string; persona: string; situation: string; packet: Packet; expect: Expect }

// ---------- builders ----------

const U = 'u-1';
function kit(now: string) {
  const sources: Source[] = [];
  const src = (id: string, kind: SourceKind, ref: string, seenAt = now.slice(0, 10)) => {
    const priv = ['email', 'notes', 'debrief', 'board', 'calendar', 'user'].includes(kind);
    sources.push({ id, kind, ref, seenAt, ...(priv ? { ownerId: U } : {}) });
    return id;
  };
  const fact = (id: string, subject: Subject, topic: FactTopic, text: string, sourceId: string, extra: Partial<Fact> = {}): Fact =>
    ({ id, subject, topic, text, sourceIds: [sourceId], confidence: 0.9, ...extra });
  return { sources, src, fact };
}
const person = (id: string, name: string, companyId: string, resolved = true): Person => ({ id, name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, companyId, resolved });
const P = (id: string): Subject => ({ kind: 'person', id });
const C = (id: string): Subject => ({ kind: 'company', id });
const ME: Subject = { kind: 'self', id: 'me' };
const doc = (id: string, kind: ContextDoc['kind'], text: string, sourceId: string, date?: string): ContextDoc => ({ id, kind, text, sourceId, ...(date ? { date } : {}) });
const empty = { disclosures: [], amounts: [], touches: [] as Touch[], commitments: [] as Commitment[], objections: [], questions: [] as QuestionCandidate[] };

// ---------- founder ----------

function founderFirst(): Scenario {
  const p = danaFirst();
  delete p.meeting.goal;
  p.user = { role: 'Founder & CEO', persona: 'founder', company: 'Cueboard', objectives: ['Raise a $3M seed round by December', 'Find a lead investor'] };
  p.context = [doc('d-intro', 'email', 'Priya: "Dana, meet Maya. Cueboard is at about $40k MRR with strong retention. Dana told me she wants to understand retention before she brings anyone to Monday’s partner meeting."', 's-intro', '2026-08-28')];
  p.sources.push({ id: 's-marathon', kind: 'web', ref: 'https://example.com/race-results', seenAt: '2026-09-15' });
  p.facts.push({ id: 'f-noise-marathon', subject: P('p-dana'), topic: 'background', text: 'Ran the city marathon in 2025', sourceIds: ['s-marathon'], confidence: 0.97 });
  return {
    id: 'founder-investor-first', persona: 'founder', situation: 'First call with a partner', packet: p,
    expect: { type: 'investor', stage: 'first', goal: /partner/i, show: ['f-int', 'f-conn'], hide: ['f-noise-marathon'], numbers: 'ours' },
  };
}

function founderFollowup(): Scenario {
  const p = danaFollowup();
  delete p.meeting.goal;
  p.user = { role: 'Founder & CEO', persona: 'founder', company: 'Cueboard', objectives: ['Raise a $3M seed round by December'] };
  p.sources.push(
    { id: 's-dana-oct20', kind: 'email', ref: 'msg:dana-oct20', seenAt: '2026-10-20', ownerId: U },
    { id: 's-miami', kind: 'web', ref: 'https://example.com/halyard-miami', seenAt: '2026-10-10' },
  );
  p.context = [doc('d-dana', 'email', 'Dana: "Looking forward to Thursday. If the cohorts look like you described, I’d like to get you in front of the full partnership in November."', 's-dana-oct20', '2026-10-20')];
  p.facts.push({ id: 'f-noise-miami', subject: C('c-halyard'), topic: 'news', text: 'Halyard opened a small office in Miami', sourceIds: ['s-miami'], date: '2026-10-08', confidence: 0.9 });
  return {
    id: 'founder-investor-followup', persona: 'founder', situation: 'Follow-up with the same investor', packet: p,
    expect: { type: 'investor', stage: 'followup', goal: /partner/i, show: ['f-churn', 'o:o-churn', 'm:churn'], hide: ['f-noise-miami'], numbers: 'ours' },
  };
}

// ---------- discovery ----------

function discoveryFirst(): Scenario {
  const now = '2026-10-27T15:00:00Z';
  const { sources, src, fact } = kit(now);
  const user: UserProfile = { role: 'Head of Product', persona: 'discovery', company: 'Cueboard', objectives: ['Validate that support leads at mid-size retailers lose hours to duplicate tickets', 'Find 3 design partners for a pilot'] };
  src('s-web', 'web', 'https://example.com/ridgeway'); src('s-pod', 'web', 'https://example.com/cx-podcast'); src('s-enrich', 'enrichment', 'enrichment:grace');
  src('s-form', 'email', 'msg:inbound-form'); src('s-notes', 'notes', 'study plan'); src('s-profile', 'profile', 'company profile'); src('s-sponsor', 'web', 'https://example.com/sponsor');
  const p: Packet = {
    userId: U, now, user,
    context: [
      doc('d-form', 'email', 'Inbound form: "We handle about 12k support tickets a month with 40 agents. Same customer, same issue, three tickets. Want to see how you handle that."', 's-form', '2026-10-20'),
      doc('d-plan', 'notes', 'Study: H1 duplicate tickets cost agents 5+ hours a week. H2 the helpdesk’s built-in dedupe isn’t trusted. H3 support leads own a tooling budget under $20k. Don’t demo in first calls.', 's-notes'),
    ],
    meeting: { id: 'm-ridgeway', title: 'Intro call: Ridgeway Foods', startsAt: '2026-10-28T16:00:00Z', durationMin: 45, attendeeIds: ['p-grace'] },
    self: { companyName: 'Cueboard' },
    people: [person('p-grace', 'Grace Okafor', 'c-ridge')],
    companies: [{ id: 'c-ridge', name: 'Ridgeway Foods', domain: 'ridgewayfoods.example' }],
    sources,
    facts: [
      fact('f-grace-role', P('p-grace'), 'role', 'Head of Customer Support at Ridgeway Foods', 's-enrich', { key: 'title', value: 'Head of Customer Support' }),
      fact('f-grace-bg', P('p-grace'), 'background', 'Joined from a logistics company in 2023', 's-enrich'),
      fact('f-grace-int', P('p-grace'), 'interest', 'Spoke on a CX podcast about agent burnout from repeat tickets', 's-pod', { date: '2026-09-02' }),
      fact('f-ridge-co', C('c-ridge'), 'company', 'Regional grocery chain with 50 stores', 's-web'),
      fact('f-ridge-tools', C('c-ridge'), 'tools', 'Runs support on a legacy helpdesk', 's-web'),
      fact('f-ridge-delivery', C('c-ridge'), 'news', 'Launched home delivery in May; ticket volume up since', 's-web', { date: '2026-08-15' }),
      fact('f-noise-sponsor', C('c-ridge'), 'news', 'Sponsored a local charity 5k run', 's-sponsor', { date: '2026-10-01' }),
      fact('f-proof', ME, 'proof', 'Cut duplicate tickets by 40% at a pilot', 's-profile'),
    ],
    metrics: [
      { id: 'tickets', owner: C('c-ridge'), label: 'Tickets per month', better: 'down', meetingTypes: ['customer'], points: [{ date: '2026-10-20', value: 12000, sourceId: 's-form' }] },
      { id: 'agents', owner: C('c-ridge'), label: 'Support agents', better: 'up', meetingTypes: ['customer'], points: [{ date: '2026-10-20', value: 40, sourceId: 's-form' }] },
      { id: 'customers', label: 'Customers', better: 'up', meetingTypes: ['investor', 'customer'], points: [{ date: '2026-09-01', value: 31, sourceId: 's-profile' }, { date: '2026-10-01', value: 38, sourceId: 's-profile' }] },
    ],
    ...empty,
    objections: [{ id: 'o-tool', text: 'We already have a tool for this', answer: 'It plugs into the helpdesk you have', meetingTypes: ['customer'], resolved: false, sourceIds: ['s-profile'] }],
    questions: [
      { id: 'q-last', text: 'Walk me through the last time a ticket spike hit', meetingTypes: ['customer'], priority: 1 },
      { id: 'q-measure', text: 'How do you measure agent time today?', meetingTypes: ['customer'], priority: 2 },
    ],
  };
  return {
    id: 'discovery-first-interview', persona: 'discovery', situation: 'First interview', packet: p,
    expect: { type: 'customer', stage: 'first', goal: /learn|understand|validate|duplicate|repeat|pain|how/i, show: ['f-grace-int'], hide: ['m:customers', 'f-noise-sponsor'], numbers: 'theirs', ask: [/duplicate|repeat|same (issue|customer)|dedupe/i] },
  };
}

// ---------- investor ----------

function investorFirst(): Scenario {
  const now = '2026-10-29T13:00:00Z';
  const { sources, src, fact } = kit(now);
  src('s-deck', 'deck', 'parcelwise-seed-deck.pdf'); src('s-enrich', 'enrichment', 'enrichment:founders'); src('s-intro', 'email', 'msg:intro-parcelwise');
  src('s-fund', 'notes', 'fund portfolio notes'); src('s-web', 'web', 'https://example.com/parcelwise');
  const p: Packet = {
    userId: U, now,
    user: { role: 'Partner at Northbeam Capital', persona: 'investor', company: 'Northbeam Capital', objectives: ['Lead 6 seed deals this year in logistics software'] },
    context: [doc('d-intro', 'email', 'Intro from an angel: "Lena and Omar are raising a $2.5M seed for Parcelwise, route software for regional couriers. Two of their five design partners pay. Worth 30 minutes."', 's-intro', '2026-10-24')],
    meeting: { id: 'm-parcelwise', title: 'Parcelwise <> Northbeam', startsAt: '2026-10-30T15:00:00Z', durationMin: 30, attendeeIds: ['p-lena', 'p-omar'] },
    self: { companyName: 'Northbeam Capital' },
    people: [person('p-lena', 'Lena Brandt', 'c-pw'), person('p-omar', 'Omar Haddad', 'c-pw')],
    companies: [{ id: 'c-pw', name: 'Parcelwise', domain: 'parcelwise.example' }],
    sources,
    facts: [
      fact('f-lena-role', P('p-lena'), 'role', 'CEO and co-founder of Parcelwise', 's-enrich', { key: 'title', value: 'CEO' }),
      fact('f-lena-bg', P('p-lena'), 'background', 'Ran operations at a 300-van delivery company', 's-enrich'),
      fact('f-omar-role', P('p-omar'), 'role', 'CTO and co-founder of Parcelwise', 's-enrich', { key: 'title', value: 'CTO' }),
      fact('f-omar-bg', P('p-omar'), 'background', 'Built routing at a mapping startup', 's-enrich'),
      fact('f-pw-what', C('c-pw'), 'company', 'Route software for regional couriers', 's-deck'),
      fact('f-pw-round', C('c-pw'), 'company', 'Raising a $2.5M seed, no lead yet', 's-intro'),
      fact('f-pw-pilots', C('c-pw'), 'company', 'Two of five design partners pay', 's-intro'),
      fact('f-conflict', ME, 'portfolio', 'Northbeam portfolio includes Lattice Freight, which sells route software to couriers', 's-fund'),
      fact('f-thesis', ME, 'fund', 'Thesis: vertical software for logistics operators', 's-fund'),
    ],
    metrics: [
      { id: 'pw-mrr', owner: C('c-pw'), label: 'Parcelwise MRR', prefix: '$', better: 'up', meetingTypes: ['investor'], points: [
        { date: '2026-07-01', value: 18000, sourceId: 's-deck' }, { date: '2026-08-01', value: 24000, sourceId: 's-deck' }, { date: '2026-09-01', value: 31000, sourceId: 's-deck' }] },
      { id: 'pw-couriers', owner: C('c-pw'), label: 'Couriers live', better: 'up', meetingTypes: ['investor'], points: [{ date: '2026-09-01', value: 14, sourceId: 's-deck' }] },
    ],
    ...empty,
    questions: [
      { id: 'q-who', text: 'Who else at the firm needs to meet us?', meetingTypes: ['investor'], priority: 2 },
    ],
  };
  return {
    id: 'investor-founder-first', persona: 'investor', situation: 'First call with a founder', packet: p,
    expect: {
      type: 'investor', stage: 'first', goal: /partner|decide|diligence|lead|fit/i, show: ['f-conflict', 'm:pw-mrr'], numbers: 'theirs',
      hideText: [/check size do you/i, /who else at the firm needs to meet us/i], ask: [/churn|retention|pay|pricing|price|unit|margin|competi|why/i],
    },
  };
}

// ---------- partnerships ----------

function partnershipsFirst(): Scenario {
  const now = '2026-11-03T09:00:00Z';
  const { sources, src, fact } = kit(now);
  src('s-web', 'web', 'https://example.com/calder'); src('s-enrich', 'enrichment', 'enrichment:calder'); src('s-email', 'email', 'msg:calder-intro');
  src('s-profile', 'profile', 'company profile'); src('s-summit', 'web', 'https://example.com/summit'); src('s-crm', 'notes', 'partner pipeline sheet');
  const p: Packet = {
    userId: U, now,
    user: { role: 'Head of Global Partnerships', persona: 'partnerships', company: 'Cueboard', objectives: ['Sign 3 reseller partners in EMEA by Q2', 'Partner-sourced pipeline of $1M by year end'] },
    context: [doc('d-email', 'email', 'Ines: "Our support-desk customers keep asking about duplicate tickets. Happy to explore whether Cueboard fits our reseller catalogue. Felix runs DACH sales and will join."', 's-email', '2026-10-28')],
    meeting: { id: 'm-calder', title: 'Calder Systems <> Cueboard', startsAt: '2026-11-04T10:00:00Z', durationMin: 45, attendeeIds: ['p-ines', 'p-felix'] },
    self: { companyName: 'Cueboard' },
    people: [person('p-ines', 'Ines Moreau', 'c-calder'), person('p-felix', 'Felix Berg', 'c-calder')],
    companies: [{ id: 'c-calder', name: 'Calder Systems', domain: 'calder.example' }],
    sources,
    facts: [
      fact('f-ines-role', P('p-ines'), 'role', 'Head of Alliances at Calder Systems', 's-enrich', { key: 'title', value: 'Head of Alliances' }),
      fact('f-ines-bg', P('p-ines'), 'background', 'Built the alliance program at a CRM vendor', 's-enrich'),
      fact('f-ines-decision', P('p-ines'), 'decision', 'Signs reseller agreements up to €250k a year', 's-email'),
      fact('f-felix-role', P('p-felix'), 'role', 'Sales Director, DACH at Calder Systems', 's-enrich', { key: 'title', value: 'Sales Director, DACH' }),
      fact('f-felix-int', P('p-felix'), 'interest', 'Measured on DACH services revenue', 's-enrich'),
      fact('f-calder-overlap', C('c-calder'), 'company', '1,200 support-team customers across DACH and France', 's-web'),
      fact('f-calder-resells', C('c-calder'), 'tools', 'Resells two helpdesk products today', 's-web'),
      fact('f-calder-program', C('c-calder'), 'company', 'Partner program pays 20% referral margin', 's-web'),
      fact('f-calder-paris', C('c-calder'), 'news', 'Opened a Paris office in August', 's-web', { date: '2026-08-20' }),
      fact('f-noise-summit', C('c-calder'), 'news', 'CEO spoke at a cybersecurity summit', 's-summit', { date: '2026-10-15' }),
    ],
    metrics: [
      { id: 'emea', label: 'EMEA customers', better: 'up', meetingTypes: ['partnership'], points: [{ date: '2026-09-01', value: 7, sourceId: 's-crm' }, { date: '2026-10-01', value: 9, sourceId: 's-crm' }] },
      { id: 'pipeline', label: 'Partner-sourced pipeline', prefix: '$', better: 'up', meetingTypes: ['partnership'], points: [{ date: '2026-10-01', value: 120000, sourceId: 's-crm' }] },
    ],
    ...empty,
    objections: [{ id: 'o-whats-in', text: 'What’s in it for us?', answer: 'Attach revenue on every helpdesk deal you already sell', meetingTypes: ['partnership'], resolved: false, sourceIds: ['s-profile'] }],
  };
  return {
    id: 'partnerships-first-meeting', persona: 'partnerships', situation: 'First meeting with a potential partner', packet: p,
    expect: { type: ['partnership'], stage: 'first', goal: /pilot|joint|first|resell|catalogue|agree|owner|opportunit/i, show: ['f-ines-decision', 'f-calder-overlap'], hide: ['f-noise-summit'], ask: [/customer|pilot|first|which|deal/i] },
  };
}

// ---------- account executive ----------

function aeDemo(): Scenario {
  const now = '2026-10-22T14:00:00Z';
  const { sources, src, fact } = kit(now);
  src('s-call1', 'debrief', 'After notes, Sep 30'); src('s-call2', 'debrief', 'After notes, Oct 14'); src('s-email', 'email', 'msg:hannah-oct16');
  src('s-enrich', 'enrichment', 'enrichment:brightdesk'); src('s-profile', 'profile', 'company profile');
  const p: Packet = {
    userId: U, now,
    user: { role: 'Account Executive', persona: 'ae', company: 'Cueboard', objectives: ['Close Q4 quota: $420k, currently at $310k'] },
    context: [doc('d-email', 'email', 'Hannah: "Bringing Ravi (finance) and Tomás (IT security) to the demo. Ravi will want the 120-seat price; Tomás needs SSO and EU data residency answered before anything moves."', 's-email', '2026-10-16')],
    meeting: { id: 'm-bright', title: 'Brightdesk evaluation', startsAt: '2026-10-23T16:00:00Z', durationMin: 60, attendeeIds: ['p-hannah', 'p-ravi', 'p-tomas', 'p-chris'] },
    self: { companyName: 'Cueboard' },
    people: [person('p-hannah', 'Hannah Becker', 'c-bright'), person('p-ravi', 'Ravi Iyer', 'c-bright'), person('p-tomas', 'Tomás Alvarez', 'c-bright'), person('p-chris', 'Chris', 'c-bright', false)],
    companies: [{ id: 'c-bright', name: 'Brightdesk', domain: 'brightdesk.example' }],
    sources,
    facts: [
      fact('f-hannah-role', P('p-hannah'), 'role', 'Support Ops Lead at Brightdesk', 's-enrich', { key: 'title', value: 'Support Ops Lead' }),
      fact('f-hannah-int', P('p-hannah'), 'interest', 'Measured on first-response time', 's-call1', { date: '2026-09-30' }),
      fact('f-ravi-role', P('p-ravi'), 'role', 'VP Finance at Brightdesk', 's-enrich', { key: 'title', value: 'VP Finance' }),
      fact('f-ravi-int', P('p-ravi'), 'interest', 'Wants the 120-seat price', 's-email', { date: '2026-10-16' }),
      fact('f-tomas-role', P('p-tomas'), 'role', 'IT Security Manager at Brightdesk', 's-enrich', { key: 'title', value: 'IT Security Manager' }),
      fact('f-tomas-int', P('p-tomas'), 'interest', 'Needs SSO and EU data residency answered', 's-email', { date: '2026-10-16' }),
      fact('f-bright-co', C('c-bright'), 'company', 'B2B software company, about 400 people', 's-enrich'),
    ],
    metrics: [
      { id: 'b-tickets', owner: C('c-bright'), label: 'Tickets per month', better: 'down', meetingTypes: ['customer'], points: [{ date: '2026-09-30', value: 30000, sourceId: 's-call1' }] },
      { id: 'b-agents', owner: C('c-bright'), label: 'Support agents', better: 'up', meetingTypes: ['customer'], points: [{ date: '2026-09-30', value: 120, sourceId: 's-call1' }] },
    ],
    disclosures: [], amounts: [],
    touches: [
      { id: 't-1', date: '2026-09-30', kind: 'call', summary: 'Duplicates cost 6 agents a day; fix needed before Q1', personIds: ['p-hannah'], sourceId: 's-call1' },
      { id: 't-2', date: '2026-10-14', kind: 'meeting', summary: 'Hannah asked for security review and 120-seat pricing', personIds: ['p-hannah'], sourceId: 's-call2' },
      { id: 't-3', date: '2026-10-16', kind: 'email', summary: 'Hannah is bringing finance and IT security', personIds: ['p-hannah'], sourceId: 's-email' },
    ],
    commitments: [
      { id: 'k-soc2', owner: 'self', personId: 'p-hannah', text: 'Send the SOC 2 report', madeAt: '2026-10-14', due: '2026-10-17', doneAt: '2026-10-16', sourceId: 's-call2' },
      { id: 'k-price', owner: 'self', personId: 'p-hannah', text: 'Send pricing for 120 seats', madeAt: '2026-10-14', due: '2026-10-21', sourceId: 's-call2' },
    ],
    objections: [{ id: 'o-builtin', text: 'How is this different from our helpdesk’s built-in AI?', answer: 'Merges across channels; built-in only works within email', meetingTypes: ['customer'], raisedBy: 'p-hannah', raisedAt: '2026-10-14', resolved: false, sourceIds: ['s-call2'] }],
    questions: [],
  };
  return {
    id: 'ae-demo-new-stakeholders', persona: 'ae', situation: 'Demo with new stakeholders', packet: p,
    expect: { type: ['customer', 'negotiation'], stage: 'followup', goal: /security|price|pricing|agree|next|pilot|approv|proposal|buy/i, show: ['p:p-ravi', 'p:p-tomas', 'o:o-builtin'], numbers: 'theirs' },
  };
}

export function scenarios(): Scenario[] {
  return [founderFirst(), founderFollowup(), discoveryFirst(), investorFirst(), partnershipsFirst(), aeDemo()];
}
