import type { Extraction } from '../src/intel/schemas.ts';
import type { Doc } from '../src/memory/types.ts';
import type { UserProfile } from '../src/types.ts';

// A founder's first three weeks with an investor, as the documents they'd actually paste:
// an invite, an intro email, their own call notes, the follow-up they sent, the partner-meeting
// invite and a metrics update. Each has the reading a good model should give (for tests and the
// fake model) and what any correct reading must contain (for scoring a real model).

export const STORY_USER: UserProfile = {
  name: 'Alex Rivera', email: 'alex@cueboard.example', role: 'Founder & CEO', persona: 'founder', company: 'Cueboard',
  objectives: ['Raise a $3M seed round by December'],
};

export interface StoryDoc { doc: Doc; ideal: Extraction; expect: { kind: string; match: RegExp }[] }

const none = { meeting: null, happened: null, people: [], companies: [], facts: [], numbers: [], promises: [], kept: [], objections: [], settled: [] };

export const STORY: StoryDoc[] = [
  {
    doc: {
      id: 'd1', kind: 'invite', date: '2026-10-01',
      text: `Cueboard <> Larkspur Ventures
Thursday, October 8, 2026 · 10:00 – 10:30 (America/New_York)
Google Meet: meet.google.com/xqv-hmta-pwe
Guests: Maya Chen <maya@larkspur.example>, Alex Rivera <alex@cueboard.example>

Intro call. Sam Patel connected us. Maya leads seed investments in workflow software.`,
    },
    ideal: {
      ...none,
      summary: 'Invite to the intro call with Maya',
      meeting: { title: 'Cueboard <> Larkspur Ventures', startsAt: '2026-10-08T10:00:00-04:00', durationMin: 30, attendeeRefs: ['p1'], goal: null },
      people: [{ ref: 'p1', knownId: null, name: 'Maya Chen', email: 'maya@larkspur.example', companyRef: 'c1' }],
      companies: [{ ref: 'c1', knownId: null, name: 'Larkspur Ventures', domain: 'larkspur.example' }],
      facts: [{ about: 'p1', topic: 'role', text: 'Leads seed investments in workflow software', quote: 'Maya leads seed investments in workflow software' }],
    },
    expect: [{ kind: 'meeting', match: /larkspur/i }, { kind: 'person', match: /maya chen/i }],
  },
  {
    doc: {
      id: 'd2', kind: 'email', date: '2026-10-02',
      text: `From: Sam Patel <sam@patel.example>
To: Maya Chen <maya@larkspur.example>, Alex Rivera <alex@cueboard.example>
Subject: Intro: Alex (Cueboard) <> Maya (Larkspur)

Maya, meet Alex. Alex is building Cueboard, meeting prep boards for founders and sales teams. They've grown MRR from $12k in May to $31k in September with no paid marketing.

Alex, Maya is a partner at Larkspur and led the seed rounds for Fieldwork and Loomwise. She's been looking at tools that sit on top of the calendar.

I'll let you two take it from here.
Sam`,
    },
    ideal: {
      ...none,
      summary: 'Sam Patel’s intro email to Maya',
      happened: { kind: 'intro', date: '2026-10-02', summary: 'Sam Patel introduced you to Maya', peopleRefs: ['p1', 'p2'], quote: 'Maya, meet Alex.' },
      people: [
        { ref: 'p1', knownId: 'KNOWN:maya', name: 'Maya Chen', email: 'maya@larkspur.example', companyRef: 'c1' },
        { ref: 'p2', knownId: null, name: 'Sam Patel', email: 'sam@patel.example', companyRef: null },
      ],
      companies: [{ ref: 'c1', knownId: 'KNOWN:larkspur', name: 'Larkspur Ventures', domain: null }],
      facts: [
        { about: 'p1', topic: 'connection', text: 'Intro via Sam Patel', quote: 'Maya, meet Alex.' },
        { about: 'p1', topic: 'background', text: 'Led the seed rounds for Fieldwork and Loomwise', quote: 'led the seed rounds for Fieldwork and Loomwise' },
        { about: 'p1', topic: 'interest', text: 'Looking at tools that sit on top of the calendar', quote: 'looking at tools that sit on top of the calendar' },
      ],
      numbers: [
        { owner: 'self', label: 'MRR', value: 12000, prefix: '$', suffix: '', asOf: '2026-05-31', better: 'up', sharedWith: [], quote: 'MRR from $12k in May' },
        { owner: 'self', label: 'MRR', value: 31000, prefix: '$', suffix: '', asOf: '2026-09-30', better: 'up', sharedWith: [], quote: '$31k in September' },
      ],
    },
    expect: [{ kind: 'fact', match: /fieldwork/i }, { kind: 'fact', match: /calendar/i }, { kind: 'number', match: /31/ }, { kind: 'person', match: /sam patel/i }],
  },
  {
    doc: {
      id: 'd3', kind: 'notes', date: '2026-10-08',
      text: `Call with Maya (Larkspur), Oct 8

- Good energy. She's done 3 seed deals in workflow tools this year.
- Asked twice about churn in small teams. We're at 3.1% monthly for teams under 10 seats.
- Told her MRR is $33k as of October 1.
- Pushback: "Isn't this just a feature Zoom will add?" I said we work across Zoom, Meet and Teams, and 4 of our 10 biggest accounts use two of them.
- She wants to see a cohort table before taking it to partners.
- I'll send the cohort table by Friday.
- She'll introduce us to her partner Ben Okoro for the partner meeting.
- Don't pitch market size again, she knows it cold.
- Next step: partner meeting in two weeks.`,
    },
    ideal: {
      ...none,
      summary: 'Your notes from the call with Maya',
      happened: { kind: 'call', date: '2026-10-08', summary: 'She wants a cohort table before going to partners', peopleRefs: ['p1'], quote: 'She wants to see a cohort table before taking it to partners.' },
      people: [
        { ref: 'p1', knownId: 'KNOWN:maya', name: 'Maya Chen', email: null, companyRef: 'c1' },
        { ref: 'p2', knownId: null, name: 'Ben Okoro', email: null, companyRef: 'c1' },
      ],
      companies: [{ ref: 'c1', knownId: 'KNOWN:larkspur', name: 'Larkspur Ventures', domain: null }],
      facts: [
        { about: 'p1', topic: 'background', text: 'Did 3 seed deals in workflow tools this year', quote: "She's done 3 seed deals in workflow tools this year." },
        { about: 'p1', topic: 'interest', text: 'Asked twice about churn in small teams', quote: 'Asked twice about churn in small teams.' },
        { about: 'p1', topic: 'avoid', text: 'The market-size pitch. She knows it cold', quote: "Don't pitch market size again, she knows it cold." },
        { about: 'p2', topic: 'role', text: 'Partner at Larkspur Ventures', quote: 'her partner Ben Okoro' },
      ],
      numbers: [
        { owner: 'self', label: 'Small-team churn', value: 3.1, prefix: '', suffix: '%', asOf: '2026-10-08', better: 'down', sharedWith: ['p1'], quote: "We're at 3.1% monthly for teams under 10 seats." },
        { owner: 'self', label: 'MRR', value: 33000, prefix: '$', suffix: '', asOf: '2026-10-01', better: 'up', sharedWith: ['p1'], quote: 'Told her MRR is $33k as of October 1.' },
      ],
      promises: [
        { by: 'user', personRef: 'p1', text: 'Send the cohort table', due: '2026-10-09', quote: "I'll send the cohort table by Friday." },
        { by: 'them', personRef: 'p1', text: 'Introduce you to her partner Ben Okoro', due: null, quote: "She'll introduce us to her partner Ben Okoro" },
      ],
      objections: [{
        text: 'Isn’t this a Zoom feature?', raisedByRef: 'p1', answer: 'Works across Zoom, Meet and Teams; 4 of top 10 accounts use two',
        quote: '"Isn\'t this just a feature Zoom will add?"',
      }],
    },
    expect: [
      { kind: 'happened', match: /cohort/i }, { kind: 'number', match: /33/ }, { kind: 'number', match: /3\.1/ },
      { kind: 'promise', match: /cohort/i }, { kind: 'promise', match: /ben/i }, { kind: 'objection', match: /zoom/i },
      { kind: 'fact', match: /market/i }, { kind: 'person', match: /ben okoro/i },
    ],
  },
  {
    doc: {
      id: 'd4', kind: 'email', date: '2026-10-09',
      text: `From: Alex Rivera <alex@cueboard.example>
To: Maya Chen <maya@larkspur.example>
Subject: Cueboard cohort table

Hi Maya,

As promised, the cohort table is attached. Small-team churn has come down to 2.6% in October.

Best,
Alex`,
    },
    ideal: {
      ...none,
      summary: 'Your email to Maya with the cohort table',
      happened: { kind: 'email', date: '2026-10-09', summary: 'You sent Maya the cohort table', peopleRefs: ['p1'], quote: 'As promised, the cohort table is attached.' },
      people: [{ ref: 'p1', knownId: 'KNOWN:maya', name: 'Maya Chen', email: 'maya@larkspur.example', companyRef: null }],
      numbers: [{ owner: 'self', label: 'Small-team churn', value: 2.6, prefix: '', suffix: '%', asOf: '2026-10-09', better: 'down', sharedWith: ['p1'], quote: 'Small-team churn has come down to 2.6% in October.' }],
      kept: [{ promiseId: 'KNOWN:cohort', quote: 'As promised, the cohort table is attached.' }],
    },
    expect: [{ kind: 'kept', match: /cohort/i }, { kind: 'number', match: /2\.6/ }],
  },
  {
    doc: {
      id: 'd5', kind: 'invite', date: '2026-10-14',
      text: `Larkspur partner meeting: Cueboard
Thursday, October 22, 2026 · 11:00 – 11:45 (America/New_York)
Zoom: https://zoom.us/j/8812345678
Guests: Maya Chen <maya@larkspur.example>, Ben Okoro <ben@larkspur.example>, Alex Rivera <alex@cueboard.example>

Partner meeting. Please bring the cohort data and your plan for the round.`,
    },
    ideal: {
      ...none,
      summary: 'Invite to the Larkspur partner meeting',
      meeting: { title: 'Larkspur partner meeting: Cueboard', startsAt: '2026-10-22T11:00:00-04:00', durationMin: 45, attendeeRefs: ['p1', 'p2'], goal: null },
      people: [
        { ref: 'p1', knownId: 'KNOWN:maya', name: 'Maya Chen', email: 'maya@larkspur.example', companyRef: 'c1' },
        { ref: 'p2', knownId: 'KNOWN:ben', name: 'Ben Okoro', email: 'ben@larkspur.example', companyRef: 'c1' },
      ],
      companies: [{ ref: 'c1', knownId: 'KNOWN:larkspur', name: 'Larkspur Ventures', domain: 'larkspur.example' }],
      kept: [{ promiseId: 'KNOWN:intro-ben', quote: 'Ben Okoro <ben@larkspur.example>' }],
    },
    expect: [{ kind: 'meeting', match: /partner/i }],
  },
  {
    doc: {
      id: 'd6', kind: 'other', date: '2026-10-20', title: 'Weekly metrics',
      text: `Weekly metrics, Oct 20
MRR: $38.5k (October to date)
Customers: 46
Small-team churn: 2.6%`,
    },
    ideal: {
      ...none,
      summary: 'Your weekly metrics',
      numbers: [
        { owner: 'self', label: 'MRR', value: 38500, prefix: '$', suffix: '', asOf: '2026-10-20', better: 'up', sharedWith: [], quote: 'MRR: $38.5k (October to date)' },
        { owner: 'self', label: 'Customers', value: 46, prefix: '', suffix: '', asOf: '2026-10-20', better: 'up', sharedWith: [], quote: 'Customers: 46' },
        { owner: 'self', label: 'Small-team churn', value: 2.6, prefix: '', suffix: '%', asOf: '2026-10-20', better: 'down', sharedWith: [], quote: 'Small-team churn: 2.6%' },
      ],
    },
    expect: [{ kind: 'number', match: /38/ }, { kind: 'number', match: /46/ }],
  },
];

// The ideal readings refer to known records by role ("KNOWN:maya"), since real ids are made as
// memory fills. This swaps in the ids memory actually holds before an answer is used.
export function bindKnown(x: Extraction, ids: Record<string, string | undefined>): Extraction {
  const swap = (v: string | null) => (v && v.startsWith('KNOWN:') ? ids[v.slice(6)] ?? null : v);
  return {
    ...x,
    people: x.people.map(p => ({ ...p, knownId: swap(p.knownId) })),
    companies: x.companies.map(c => ({ ...c, knownId: swap(c.knownId) })),
    kept: x.kept.map(k => ({ ...k, promiseId: swap(k.promiseId) ?? 'missing' })),
    settled: x.settled.map(k => ({ ...k, objectionId: swap(k.objectionId) ?? 'missing' })),
  };
}
