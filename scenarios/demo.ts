import type { Extraction } from '../src/intel/schemas.ts';
import { commit, propose } from '../src/memory/extract.ts';
import type { CalendarEvent } from '../src/memory/calendar.ts';
import type { GranolaNote } from '../src/memory/granola.ts';
import { emptyMemory } from '../src/memory/types.ts';
import type { Doc, Memory } from '../src/memory/types.ts';
import type { UserProfile } from '../src/types.ts';

// A founder's week to explore Cueboard with (node scripts/serve.ts --demo). Alex Rivera is raising
// a seed round and selling at the same time. Five relationships, each at a different point:
// - Larkspur Ventures: partner meeting tomorrow. The first call's notes are in Granola, not memory.
// - Brightline Health: a customer whose renewal is at risk, check-in in about 90 minutes.
// - Northwind Logistics: a first sales call tomorrow, from an intro email.
// - Fieldstone CRM: a partnership, technical follow-up in three days.
// - Loomwise: coffee with Lena that just ended, waiting for notes.
// Everything is dated from today, so the week is always this week. Every document carries the
// reading a good model would give, so the stand-in model (--fake-model) can play the whole thing.

export const DEMO_USER: UserProfile = {
  name: 'Alex Rivera', email: 'alex@cueboard.example', role: 'Founder & CEO', persona: 'founder', company: 'Cueboard',
  objectives: ['Raise a $3M seed round by December', 'Land 3 logistics companies as design partners', 'Sign one CRM integration partner'],
};

export interface DemoDoc { doc: Doc; ideal: Extraction }
export interface DemoSample { id: string; label: string; hint: string; text: string }
export interface DemoWorld { seed: DemoDoc[]; known: DemoDoc[]; samples: DemoSample[]; events: CalendarEvent[]; granola: GranolaNote[] }

const none: Extraction = { summary: '', meeting: null, happened: null, people: [], companies: [], facts: [], numbers: [], promises: [], kept: [], objections: [], settled: [] };

const at = (now: Date, days: number, h = 12, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
// The next given weekday after a day (0 Sunday … 6 Saturday), for "by Friday".
const next = (d: Date, dow: number) => { const x = new Date(d); x.setDate(x.getDate() + (((dow - x.getDay() + 7) % 7) || 7)); return x; };
const quarter = (t: number, up: boolean) => { const q = 15 * 60_000; return new Date((up ? Math.ceil(t / q) : Math.floor(t / q)) * q); };

export function demoWorld(now = new Date()): DemoWorld {
  const D = (days: number, h?: number, m?: number) => at(now, days, h, m);
  // Months named in the documents, counted back from today, so the week reads right in any month.
  const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });
  const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
  const early = monthEnd(D(-170)), recent = monthEnd(D(-60)), afterRecent = new Date(recent.getFullYear(), recent.getMonth() + 1, 1, 12);
  const longDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const renewal = D(25), decision = D(12);
  const today = D(0);

  // ---------- what memory already holds ----------
  const samIntro: DemoDoc = {
    doc: { id: 'demo-sam-intro', kind: 'email', date: ymd(D(-10)), text: `From: Sam Patel <sam@patel.example>
To: Maya Chen <maya@larkspur.example>, Alex Rivera <alex@cueboard.example>
Subject: Intro: Alex (Cueboard) <> Maya (Larkspur)

Maya, meet Alex. Alex is building Cueboard, meeting prep boards for founders and sales teams. They've grown MRR from $12k in ${monthName(early)} to $31k in ${monthName(recent)} with no paid marketing.

Alex, Maya is a partner at Larkspur and led the seed rounds for Fieldwork and Loomwise. She's been looking at tools that sit on top of the calendar.

I'll let you two take it from here.
Sam` },
    ideal: {
      ...none, summary: 'Sam Patel’s intro email to Maya',
      happened: { kind: 'intro', date: ymd(D(-10)), summary: 'Sam Patel introduced you to Maya', peopleRefs: ['p1', 'p2'], quote: 'Maya, meet Alex.' },
      people: [{ ref: 'p1', knownId: null, name: 'Maya Chen', email: 'maya@larkspur.example', companyRef: 'c1' }, { ref: 'p2', knownId: null, name: 'Sam Patel', email: 'sam@patel.example', companyRef: null }],
      companies: [{ ref: 'c1', knownId: null, name: 'Larkspur Ventures', domain: 'larkspur.example' }],
      facts: [
        { about: 'p1', topic: 'role', text: 'Partner at Larkspur Ventures', quote: 'Maya is a partner at Larkspur' },
        { about: 'p1', topic: 'connection', text: 'Intro via Sam Patel', quote: 'Maya, meet Alex.' },
        { about: 'p1', topic: 'portfolio', text: 'Led the seed rounds for Fieldwork and Loomwise', quote: 'led the seed rounds for Fieldwork and Loomwise' },
        { about: 'p1', topic: 'interest', text: 'Looking at tools that sit on top of the calendar', quote: 'looking at tools that sit on top of the calendar' },
      ],
      numbers: [
        { owner: 'self', label: 'MRR', value: 12000, prefix: '$', suffix: '', asOf: ymd(early), better: 'up', sharedWith: [], quote: `MRR from $12k in ${monthName(early)}` },
        { owner: 'self', label: 'MRR', value: 31000, prefix: '$', suffix: '', asOf: ymd(recent), better: 'up', sharedWith: [], quote: `$31k in ${monthName(recent)}` },
      ],
    },
  };

  const qbr: DemoDoc = {
    doc: { id: 'demo-brightline-qbr', kind: 'notes', date: ymd(D(-30)), text: `Brightline Health QBR, ${short(D(-30))}

- Jordan Ellis (VP Operations) ran it. She's our champion there.
- 40 active seats today, down from 44 in the summer. Usage dropped in the two Phoenix clinic teams.
- Jordan asked about SSO again. Their IT won't approve the renewal without it.
- I'll send Jordan our SSO timeline by ${short(D(-16))}.
- Pushback on price: "Otter is half the price per seat."
- I said our boards replace prep time, not just notes. Brightline's reps save about 40 minutes a week.
- Renewal is coming up in November.` },
    ideal: {
      ...none, summary: 'Your notes from the Brightline QBR',
      happened: { kind: 'meeting', date: ymd(D(-30)), summary: 'Usage fell in Phoenix; IT needs SSO to renew', peopleRefs: ['p1'], quote: "Their IT won't approve the renewal without it." },
      people: [{ ref: 'p1', knownId: null, name: 'Jordan Ellis', email: null, companyRef: 'c1' }],
      companies: [{ ref: 'c1', knownId: null, name: 'Brightline Health', domain: 'brightlinehealth.example' }],
      facts: [
        { about: 'p1', topic: 'role', text: 'VP Operations at Brightline; our champion', quote: "Jordan Ellis (VP Operations) ran it. She's our champion there." },
        { about: 'c1', topic: 'pain', text: 'Their IT won’t approve the renewal without SSO', quote: "Their IT won't approve the renewal without it." },
        { about: 'c1', topic: 'news', text: 'Usage dropped in the two Phoenix clinic teams', quote: 'Usage dropped in the two Phoenix clinic teams.' },
        { about: 'c1', topic: 'decision', text: 'Renewal comes up in November', quote: 'Renewal is coming up in November.' },
        { about: 'self', topic: 'proof', text: 'Brightline’s reps save about 40 minutes a week', quote: "Brightline's reps save about 40 minutes a week." },
      ],
      numbers: [
        { owner: 'c1', label: 'Active seats', value: 44, prefix: '', suffix: '', asOf: ymd(D(-75)), better: 'up', sharedWith: [], quote: 'down from 44 in the summer' },
        { owner: 'c1', label: 'Active seats', value: 40, prefix: '', suffix: '', asOf: ymd(D(-30)), better: 'up', sharedWith: [], quote: '40 active seats today' },
      ],
      promises: [{ by: 'user', personRef: 'p1', text: 'Send the SSO timeline', due: ymd(D(-16)), quote: `I'll send Jordan our SSO timeline by ${short(D(-16))}.` }],
      objections: [{ text: 'Otter is half the price', raisedByRef: 'p1', answer: 'Boards replace prep time, not just notes: about 40 minutes a week per rep', quote: '"Otter is half the price per seat."' }],
    },
  };

  const fieldstoneCall: DemoDoc = {
    doc: { id: 'demo-fieldstone-call', kind: 'notes', date: ymd(D(-8)), text: `Call with Omar Haddad (Fieldstone), ${short(D(-8))}

- Omar runs partnerships at Fieldstone CRM. They have 1,200 customers, mostly sales teams under 50 reps.
- He wants Cueboard boards inside Fieldstone deal pages, as an integration.
- His big question: "Where are transcripts stored, and who can see them?"
- I said nothing leaves the customer's own workspace, and every line on a board shows its source.
- I'll send Omar the API overview by ${short(D(-5))}.
- He'll bring in their CTO, Hana Ito, for the next call.` },
    ideal: {
      ...none, summary: 'Your notes from the call with Omar',
      happened: { kind: 'call', date: ymd(D(-8)), summary: 'He wants boards inside Fieldstone deal pages', peopleRefs: ['p1'], quote: 'He wants Cueboard boards inside Fieldstone deal pages, as an integration.' },
      people: [{ ref: 'p1', knownId: null, name: 'Omar Haddad', email: null, companyRef: 'c1' }, { ref: 'p2', knownId: null, name: 'Hana Ito', email: null, companyRef: 'c1' }],
      companies: [{ ref: 'c1', knownId: null, name: 'Fieldstone CRM', domain: 'fieldstone.example' }],
      facts: [
        { about: 'p1', topic: 'role', text: 'Runs partnerships at Fieldstone CRM', quote: 'Omar runs partnerships at Fieldstone CRM.' },
        { about: 'c1', topic: 'company', text: 'Mostly sales teams under 50 reps', quote: 'mostly sales teams under 50 reps' },
        { about: 'p1', topic: 'interest', text: 'Wants boards inside Fieldstone deal pages', quote: 'He wants Cueboard boards inside Fieldstone deal pages, as an integration.' },
        { about: 'p2', topic: 'role', text: 'CTO at Fieldstone CRM', quote: 'their CTO, Hana Ito' },
      ],
      numbers: [{ owner: 'c1', label: 'Customers', value: 1200, prefix: '', suffix: '', asOf: ymd(D(-8)), better: 'up', sharedWith: [], quote: 'They have 1,200 customers' }],
      promises: [
        { by: 'user', personRef: 'p1', text: 'Send the API overview', due: ymd(D(-5)), quote: `I'll send Omar the API overview by ${short(D(-5))}.` },
        { by: 'them', personRef: 'p1', text: 'Bring in their CTO, Hana Ito', due: null, quote: "He'll bring in their CTO, Hana Ito, for the next call." },
      ],
      objections: [{ text: 'Where are transcripts stored?', raisedByRef: 'p1', answer: 'Nothing leaves the customer’s workspace; every line shows its source', quote: '"Where are transcripts stored, and who can see them?"' }],
    },
  };

  const apiEmail: DemoDoc = {
    doc: { id: 'demo-api-email', kind: 'email', date: ymd(D(-5)), text: `From: Alex Rivera <alex@cueboard.example>
To: Omar Haddad <omar@fieldstone.example>
Subject: Cueboard API overview

Hi Omar,

As promised, here's the API overview. Happy to walk Hana through it on our next call.

Alex` },
    ideal: {
      ...none, summary: 'Your email to Omar with the API overview',
      happened: { kind: 'email', date: ymd(D(-5)), summary: 'You sent Omar the API overview', peopleRefs: ['p1'], quote: "As promised, here's the API overview." },
      people: [{ ref: 'p1', knownId: null, name: 'Omar Haddad', email: 'omar@fieldstone.example', companyRef: null }],
      kept: [{ promiseId: 'KNOWN:promise:API overview', quote: "As promised, here's the API overview." }],
    },
  };

  const jordanEmail: DemoDoc = {
    doc: { id: 'demo-jordan-email', kind: 'email', date: ymd(D(-6)), text: `From: Jordan Ellis <jordan.ellis@brightlinehealth.example>
To: Alex Rivera <alex@cueboard.example>
Subject: Re: Brightline renewal

Hi Alex,

Quick heads-up before our check-in. Active seats are down to 32 since the Phoenix teams paused. Our renewal date is ${longDay(renewal)}, and Sofia Marin from procurement will join the next call.

We still need an answer on SSO before we can renew.

Jordan` },
    ideal: {
      ...none, summary: 'Jordan’s heads-up before the renewal check-in',
      happened: { kind: 'email', date: ymd(D(-6)), summary: 'Seats down to 32; SSO still blocks the renewal', peopleRefs: ['p1'], quote: 'We still need an answer on SSO before we can renew.' },
      people: [{ ref: 'p1', knownId: null, name: 'Jordan Ellis', email: 'jordan.ellis@brightlinehealth.example', companyRef: 'c1' }, { ref: 'p2', knownId: null, name: 'Sofia Marin', email: null, companyRef: 'c1' }],
      companies: [{ ref: 'c1', knownId: null, name: 'Brightline Health', domain: null }],
      facts: [
        { about: 'p2', topic: 'role', text: 'Procurement at Brightline Health', quote: 'Sofia Marin from procurement will join the next call.' },
        { about: 'c1', topic: 'decision', text: `Renewal date is ${longDay(renewal)}`, quote: `Our renewal date is ${longDay(renewal)}` },
      ],
      numbers: [{ owner: 'c1', label: 'Active seats', value: 32, prefix: '', suffix: '', asOf: ymd(D(-6)), better: 'up', sharedWith: [], quote: 'Active seats are down to 32 since the Phoenix teams paused.' }],
    },
  };

  const northwindIntro: DemoDoc = {
    doc: { id: 'demo-northwind-intro', kind: 'email', date: ymd(D(-2)), text: `From: Sam Patel <sam@patel.example>
To: Priya Raman <priya.raman@northwind.example>, Alex Rivera <alex@cueboard.example>
Subject: Intro: Priya (Northwind) <> Alex (Cueboard)

Priya, meet Alex, who's building Cueboard: prep boards that are ready before every customer meeting.

Alex, Priya runs field operations at Northwind Logistics, with 220 field sales reps across the Midwest. Her reps prep for customer visits from Salesforce notes and Gong recordings, and she says it takes them an hour a visit.

Worth a call.
Sam` },
    ideal: {
      ...none, summary: 'Sam Patel’s intro to Priya',
      happened: { kind: 'intro', date: ymd(D(-2)), summary: 'Sam Patel introduced you to Priya', peopleRefs: ['p1', 'p2'], quote: 'Priya, meet Alex' },
      people: [{ ref: 'p1', knownId: null, name: 'Priya Raman', email: 'priya.raman@northwind.example', companyRef: 'c1' }, { ref: 'p2', knownId: null, name: 'Sam Patel', email: 'sam@patel.example', companyRef: null }],
      companies: [{ ref: 'c1', knownId: null, name: 'Northwind Logistics', domain: 'northwind.example' }],
      facts: [
        { about: 'p1', topic: 'role', text: 'Runs field operations at Northwind Logistics', quote: 'Priya runs field operations at Northwind Logistics' },
        { about: 'p1', topic: 'connection', text: 'Intro via Sam Patel', quote: 'Priya, meet Alex' },
        { about: 'c1', topic: 'tools', text: 'Reps prep from Salesforce notes and Gong recordings', quote: 'Her reps prep for customer visits from Salesforce notes and Gong recordings' },
        { about: 'c1', topic: 'pain', text: 'Prep takes each rep an hour a visit', quote: 'she says it takes them an hour a visit' },
      ],
      numbers: [{ owner: 'c1', label: 'Field sales reps', value: 220, prefix: '', suffix: '', asOf: ymd(D(-2)), better: 'up', sharedWith: [], quote: 'with 220 field sales reps across the Midwest' }],
    },
  };

  const metrics: DemoDoc = {
    doc: { id: 'demo-metrics', kind: 'other', date: ymd(D(-3)), title: 'Weekly metrics', text: `Weekly metrics, ${short(D(-3))}
MRR: $38.5k (month to date)
Customers: 46
Small-team churn: 2.6%` },
    ideal: {
      ...none, summary: 'Your weekly metrics',
      numbers: [
        { owner: 'self', label: 'MRR', value: 38500, prefix: '$', suffix: '', asOf: ymd(D(-3)), better: 'up', sharedWith: [], quote: 'MRR: $38.5k (month to date)' },
        { owner: 'self', label: 'Customers', value: 46, prefix: '', suffix: '', asOf: ymd(D(-3)), better: 'up', sharedWith: [], quote: 'Customers: 46' },
        { owner: 'self', label: 'Small-team churn', value: 2.6, prefix: '', suffix: '%', asOf: ymd(D(-3)), better: 'down', sharedWith: [], quote: 'Small-team churn: 2.6%' },
      ],
    },
  };

  // ---------- what arrives while you explore ----------
  const mayaCall = D(-9, 10);
  const mayaNotes = `Call with Maya (Larkspur), ${short(mayaCall)}

- Good energy. She's done 3 seed deals in workflow tools this year.
- Asked twice about churn in small teams. We're at 3.1% monthly for teams under 10 seats.
- Told her MRR is $33k as of ${longDay(afterRecent)}.
- Pushback: "Isn't this just a feature Zoom will add?" I said we work across Zoom, Meet and Teams, and 4 of our 10 biggest accounts use two of them.
- She wants to see a cohort table before taking it to partners.
- I'll send the cohort table by Friday.
- She'll introduce us to her partner Ben Okoro for the partner meeting.
- Don't pitch market size again, she knows it cold.`;
  const callNotes: DemoDoc = {
    doc: { id: 'demo-maya-call', kind: 'notes', date: ymd(mayaCall), text: mayaNotes },
    ideal: {
      ...none, summary: 'Your notes from the call with Maya',
      happened: { kind: 'call', date: ymd(mayaCall), summary: 'She wants a cohort table before going to partners', peopleRefs: ['p1'], quote: 'She wants to see a cohort table before taking it to partners.' },
      people: [{ ref: 'p1', knownId: null, name: 'Maya Chen', email: null, companyRef: 'c1' }, { ref: 'p2', knownId: null, name: 'Ben Okoro', email: null, companyRef: 'c1' }],
      companies: [{ ref: 'c1', knownId: null, name: 'Larkspur Ventures', domain: null }],
      facts: [
        { about: 'p1', topic: 'background', text: 'Did 3 seed deals in workflow tools this year', quote: "She's done 3 seed deals in workflow tools this year." },
        { about: 'p1', topic: 'interest', text: 'Asked twice about churn in small teams', quote: 'Asked twice about churn in small teams.' },
        { about: 'p1', topic: 'avoid', text: 'The market-size pitch. She knows it cold', quote: "Don't pitch market size again, she knows it cold." },
        { about: 'p2', topic: 'role', text: 'Partner at Larkspur Ventures', quote: 'her partner Ben Okoro' },
      ],
      numbers: [
        { owner: 'self', label: 'Small-team churn', value: 3.1, prefix: '', suffix: '%', asOf: ymd(mayaCall), better: 'down', sharedWith: ['p1'], quote: "We're at 3.1% monthly for teams under 10 seats." },
        { owner: 'self', label: 'MRR', value: 33000, prefix: '$', suffix: '', asOf: ymd(afterRecent), better: 'up', sharedWith: ['p1'], quote: `Told her MRR is $33k as of ${longDay(afterRecent)}.` },
      ],
      promises: [
        { by: 'user', personRef: 'p1', text: 'Send the cohort table', due: ymd(next(mayaCall, 5)), quote: "I'll send the cohort table by Friday." },
        { by: 'them', personRef: 'p1', text: 'Introduce you to her partner Ben Okoro', due: null, quote: "She'll introduce us to her partner Ben Okoro" },
      ],
      objections: [{ text: 'Isn’t this a Zoom feature?', raisedByRef: 'p1', answer: 'Works across Zoom, Meet and Teams; 4 of the top 10 accounts use two', quote: '"Isn\'t this just a feature Zoom will add?"' }],
    },
  };

  const coffeeStart = quarter(now.getTime() - 75 * 60_000, false);
  const lena: DemoDoc = {
    doc: { id: 'demo-lena-notes', kind: 'notes', date: ymd(today), text: `Coffee with Lena Park (Loomwise), ${short(today)}

- Lena founded Loomwise. Maya led their seed, so she knows how Maya works.
- Lena says Maya always pushes on churn and wants cohort data before partners.
- Loomwise's customer success team (8 people) could pilot Cueboard in December.
- I'll send Lena a demo link by Monday.
- She'll put in a good word with Maya before our partner meeting.` },
    ideal: {
      ...none, summary: 'Your notes from coffee with Lena',
      happened: { kind: 'meeting', date: ymd(today), summary: 'Loomwise’s CS team could pilot in December', peopleRefs: ['p1'], quote: "Loomwise's customer success team (8 people) could pilot Cueboard in December." },
      people: [{ ref: 'p1', knownId: null, name: 'Lena Park', email: null, companyRef: 'c1' }, { ref: 'p2', knownId: null, name: 'Maya Chen', email: null, companyRef: null }],
      companies: [{ ref: 'c1', knownId: null, name: 'Loomwise', domain: null }],
      facts: [
        { about: 'p1', topic: 'role', text: 'Founder of Loomwise', quote: 'Lena founded Loomwise.' },
        { about: 'p1', topic: 'connection', text: 'Maya led Loomwise’s seed', quote: 'Maya led their seed, so she knows how Maya works.' },
        { about: 'p2', topic: 'interest', text: 'Always pushes on churn; wants cohort data before partners', quote: 'Lena says Maya always pushes on churn and wants cohort data before partners.' },
        { about: 'c1', topic: 'news', text: 'CS team of 8 could pilot Cueboard in December', quote: "Loomwise's customer success team (8 people) could pilot Cueboard in December." },
      ],
      promises: [
        { by: 'user', personRef: 'p1', text: 'Send a demo link', due: ymd(next(today, 1)), quote: "I'll send Lena a demo link by Monday." },
        { by: 'them', personRef: 'p1', text: 'Put in a good word with Maya', due: null, quote: "She'll put in a good word with Maya before our partner meeting." },
      ],
    },
  };

  const cohortEmail: DemoDoc = {
    doc: { id: 'demo-cohort-email', kind: 'email', date: ymd(today), text: `From: Alex Rivera <alex@cueboard.example>
To: Maya Chen <maya@larkspur.example>
Subject: Cueboard cohort table

Hi Maya,

As promised, the cohort table is attached. Small-team churn has come down to 2.6% this month.

Best,
Alex` },
    ideal: {
      ...none, summary: 'Your email to Maya with the cohort table',
      happened: { kind: 'email', date: ymd(today), summary: 'You sent Maya the cohort table', peopleRefs: ['p1'], quote: 'As promised, the cohort table is attached.' },
      people: [{ ref: 'p1', knownId: null, name: 'Maya Chen', email: 'maya@larkspur.example', companyRef: null }],
      numbers: [{ owner: 'self', label: 'Small-team churn', value: 2.6, prefix: '', suffix: '%', asOf: ymd(today), better: 'down', sharedWith: ['p1'], quote: 'Small-team churn has come down to 2.6% this month.' }],
      kept: [{ promiseId: 'KNOWN:promise:cohort', quote: 'As promised, the cohort table is attached.' }],
    },
  };

  const sofia: DemoDoc = {
    doc: { id: 'demo-sofia-email', kind: 'email', date: ymd(today), text: `From: Sofia Marin <sofia.marin@brightlinehealth.example>
To: Alex Rivera <alex@cueboard.example>
Cc: Jordan Ellis <jordan.ellis@brightlinehealth.example>
Subject: Brightline renewal: pricing

Hi Alex,

Ahead of today's call: to renew, we'd need a 15% discount at 32 seats, and a decision by ${longDay(decision)}. Jordan tells me SSO is still the blocker for IT.

Thanks,
Sofia` },
    ideal: {
      ...none, summary: 'Sofia’s pricing ask before the check-in',
      happened: { kind: 'email', date: ymd(today), summary: `Wants 15% off at 32 seats; decision by ${short(decision)}`, peopleRefs: ['p1', 'p2'], quote: "to renew, we'd need a 15% discount at 32 seats" },
      people: [{ ref: 'p1', knownId: null, name: 'Sofia Marin', email: 'sofia.marin@brightlinehealth.example', companyRef: 'c1' }, { ref: 'p2', knownId: null, name: 'Jordan Ellis', email: 'jordan.ellis@brightlinehealth.example', companyRef: 'c1' }],
      companies: [{ ref: 'c1', knownId: null, name: 'Brightline Health', domain: null }],
      facts: [
        { about: 'p1', topic: 'ask', text: 'Wants a 15% discount to renew at 32 seats', quote: "to renew, we'd need a 15% discount at 32 seats" },
        { about: 'c1', topic: 'decision', text: `Needs a decision by ${longDay(decision)}`, quote: `a decision by ${longDay(decision)}` },
      ],
      objections: [{ text: 'SSO still blocks IT', raisedByRef: 'p1', answer: null, quote: 'Jordan tells me SSO is still the blocker for IT.' }],
    },
  };

  const hana: DemoDoc = {
    doc: { id: 'demo-hana-profile', kind: 'profile', date: ymd(today), text: `Hana Ito, CTO at Fieldstone CRM
Previously led platform engineering at Pipedrive for six years.
Writes often about data residency and SOC 2 for small SaaS teams.` },
    ideal: {
      ...none, summary: 'Hana Ito’s profile',
      people: [{ ref: 'p1', knownId: null, name: 'Hana Ito', email: null, companyRef: 'c1' }],
      companies: [{ ref: 'c1', knownId: null, name: 'Fieldstone CRM', domain: null }],
      facts: [
        { about: 'p1', topic: 'background', text: 'Led platform engineering at Pipedrive for six years', quote: 'Previously led platform engineering at Pipedrive for six years.' },
        { about: 'p1', topic: 'interest', text: 'Writes about data residency and SOC 2', quote: 'Writes often about data residency and SOC 2 for small SaaS teams.' },
      ],
    },
  };

  const samples: DemoSample[] = [
    { id: 'lena', label: 'Notes from coffee with Lena', hint: 'After the Loomwise coffee: what Lena said about Maya lands on the Larkspur board too', text: lena.doc.text },
    { id: 'sofia', label: 'Email from Sofia (Brightline)', hint: 'New terms before today’s renewal call: watch the Brightline board update', text: sofia.doc.text },
    { id: 'cohort', label: 'Your cohort email to Maya', hint: 'After importing the Granola call: the promise to Maya is marked done', text: cohortEmail.doc.text },
    { id: 'hana', label: 'Hana Ito’s profile', hint: 'Before the Fieldstone follow-up: who the CTO is', text: hana.doc.text },
  ];

  // ---------- the calendar ----------
  const me = { email: 'alex@cueboard.example', name: 'Alex Rivera', self: true, response: 'accepted' as const };
  const gcal = (id: string) => `https://calendar.google.com/calendar/event?eid=${id}`;
  const ev = (id: string, title: string, start: Date, minutes: number, attendees: CalendarEvent['attendees'], more: Partial<CalendarEvent> = {}): CalendarEvent =>
    ({ id, title, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString(), status: 'confirmed', kind: 'default', url: gcal(id), attendees: [me, ...attendees], ...more });
  const soon = quarter(now.getTime() + 90 * 60_000, true);
  const events: CalendarEvent[] = [
    ev('demo_brightline_renewal', 'Brightline renewal check-in', soon, 45,
      [{ email: 'jordan.ellis@brightlinehealth.example', name: 'Jordan Ellis', response: 'accepted' }, { email: 'sofia.marin@brightlinehealth.example', name: 'Sofia Marin', response: 'accepted' }],
      { joinUrl: 'https://zoom.us/j/5550101', description: 'Check-in before the November 15 renewal. Agenda: seats, SSO, pricing.<br><br>Join Zoom Meeting<br>https://zoom.us/j/5550101<br>Meeting ID: 555 0101' }),
    ev('demo_loomwise_coffee', 'Coffee with Lena (Loomwise)', coffeeStart, 45, [{ email: 'lena@loomwise.example', name: 'Lena Park', response: 'accepted' }], { location: 'Blue Bottle, Hayes Valley' }),
    ev('demo_larkspur_partner', 'Larkspur partner meeting: Cueboard', D(1, 11), 45,
      [{ email: 'maya@larkspur.example', name: 'Maya Chen', organizer: true, response: 'accepted' }, { email: 'ben@larkspur.example', name: 'Ben Okoro', response: 'needsAction' }],
      { joinUrl: 'https://zoom.us/j/8812345678', description: 'Partner meeting. Please bring the cohort data and your plan for the round.<br><br>Join Zoom Meeting<br>https://zoom.us/j/8812345678' }),
    ev('demo_northwind_intro', 'Intro: Priya (Northwind) <> Alex', D(1, 15), 30, [{ email: 'priya.raman@northwind.example', name: 'Priya Raman', response: 'accepted' }],
      { joinUrl: 'https://meet.google.com/abc-defg-hij', description: 'Sam thought we should talk about how Northwind’s field reps prepare for customer visits.\n\nGoogle Meet joining info\nVideo call link: https://meet.google.com/abc-defg-hij' }),
    ev('demo_fieldstone_tech', 'Fieldstone integration: technical follow-up', D(3, 14), 45,
      [{ email: 'omar@fieldstone.example', name: 'Omar Haddad', organizer: true, response: 'accepted' }, { email: 'hana@fieldstone.example', name: 'Hana Ito', response: 'accepted' }],
      { description: 'Hana will go through the API overview and how customer data is handled.' }),
    ev('demo_maya_call', 'Call with Maya (Larkspur)', mayaCall, 30, [{ email: 'maya@larkspur.example', name: 'Maya Chen', organizer: true, response: 'accepted' }]),
    ev('demo_fieldstone_call', 'Cueboard <> Fieldstone', D(-8, 13), 30, [{ email: 'omar@fieldstone.example', name: 'Omar Haddad', response: 'accepted' }]),
    // What else a real calendar holds: none of these gets a board.
    ev('demo_team_sync', 'Weekly team sync', D(1, 10), 30, [{ email: 'theo@cueboard.example', name: 'Theo Grant', response: 'accepted' }]),
    ev('demo_focus', 'Focus time', D(1, 9), 60, [], { kind: 'focusTime' }),
    { ...ev('demo_sam_coffee', 'Coffee with Sam', D(2, 12), 60, [{ email: 'sam@patel.example', name: 'Sam Patel', organizer: true, response: 'accepted' }]), attendees: [{ ...me, response: 'declined' }, { email: 'sam@patel.example', name: 'Sam Patel', organizer: true, response: 'accepted' }] },
    { ...ev('demo_offsite', 'Company offsite', D(4), 0, [{ email: 'theo@cueboard.example', name: 'Theo Grant' }]), start: ymd(D(4)), end: ymd(D(5)), allDay: true },
  ];

  // ---------- Granola ----------
  const ME = { name: 'Alex Rivera', email: 'alex@cueboard.example' };
  const granola: GranolaNote[] = [
    {
      id: 'not_DemoMayaCall01', title: 'Call with Maya (Larkspur)', owner: ME, created_at: new Date(mayaCall.getTime() + 32 * 60_000).toISOString(),
      web_url: 'https://notes.granola.ai/d/demo-larkspur-call',
      calendar_event: { event_title: 'Call with Maya (Larkspur)', scheduled_start_time: mayaCall.toISOString(), scheduled_end_time: new Date(mayaCall.getTime() + 30 * 60_000).toISOString() },
      attendees: [ME, { name: 'Maya Chen', email: 'maya@larkspur.example' }],
      private_notes_markdown: mayaNotes,
      summary_markdown: '### Churn\n- Maya asked about churn for small teams twice\n\n### Next steps\n- Alex to send the cohort table\n- Maya to introduce Ben Okoro',
      transcript: [
        { speaker: { source: 'speaker', attribution: 'them', name: 'Maya Chen' }, text: 'Thanks for making time. How does churn look for the small teams?' },
        { speaker: { source: 'microphone', attribution: 'me' }, text: 'We’re at 3.1% a month for teams under ten seats.' },
        { speaker: { source: 'speaker', attribution: 'them', name: 'Maya Chen' }, text: 'Isn’t this just a feature Zoom will add?' },
        { speaker: { source: 'microphone', attribution: 'me' }, text: 'We work across Zoom, Meet and Teams, and four of our ten biggest accounts use two of them.' },
      ],
    },
    {
      id: 'not_DemoTeamSync01', title: 'Weekly team sync', owner: ME, created_at: D(-6, 10, 35).toISOString(),
      web_url: 'https://notes.granola.ai/d/demo-team-sync',
      calendar_event: { event_title: 'Weekly team sync', scheduled_start_time: D(-6, 10).toISOString(), scheduled_end_time: D(-6, 10, 30).toISOString() },
      attendees: [ME, { name: 'Theo Grant', email: 'theo@cueboard.example' }],
      private_notes_markdown: null, summary_markdown: '- Shipped calendar sync\n- Next: the 30-second hero card',
      transcript: [{ speaker: { source: 'speaker', attribution: 'them', name: 'Theo Grant' }, text: 'Calendar sync is live for the design partners.' }],
    },
  ];

  return { seed: [samIntro, qbr, fieldstoneCall, apiEmail, jordanEmail, metrics, northwindIntro], known: [callNotes, lena, cohortEmail, sofia, hana], samples, events, granola };
}

// "KNOWN:promise:cohort" → the open promise whose text mentions the cohort, in memory or in the
// prompt's KNOWN OPEN PROMISES list.
function bind(x: Extraction, promiseIdFor: (needle: string) => string | undefined): Extraction {
  return { ...x, kept: x.kept.map(k => (k.promiseId.startsWith('KNOWN:promise:') ? { ...k, promiseId: promiseIdFor(k.promiseId.slice(14)) ?? 'missing' } : k)) };
}

// Memory as if Alex had pasted the week's documents, each read and saved the ordinary way.
export function demoMemory(now = new Date()): Memory {
  let m = emptyMemory('me', DEMO_USER);
  for (const d of demoWorld(now).seed) {
    const ideal = bind(d.ideal, needle => m.commitments.find(c => !c.doneAt && c.text.toLowerCase().includes(needle.toLowerCase()))?.id);
    const p = propose(m, d.doc, ideal);
    m = commit(m, d.doc, p, { people: p.people.map(x => x.ref), items: p.items.map(i => i.id), meeting: null }).memory;
  }
  return m;
}

// The stand-in model's reading of a demo document, found by its text in the prompt.
export function demoAnswer(prompt: string, now = new Date()): Extraction | null {
  const w = demoWorld(now);
  const d = [...w.seed, ...w.known].find(x => prompt.includes(x.doc.text.trim()));
  if (!d) return null;
  const lines = prompt.split('\n'), from = lines.indexOf('KNOWN OPEN PROMISES');
  const promises = from < 0 ? [] : lines.slice(from + 1, lines.findIndex((l, i) => i > from && !l.startsWith('- ')) >>> 0);
  return bind(d.ideal, needle => promises.find(l => l.toLowerCase().includes(needle.toLowerCase()))?.match(/^- \[([^\]]+)\]/)?.[1]);
}

// ---------- the stand-in model's reading of each meeting ----------
// What a good model would say each demo meeting is for: a goal, a couple of other goals it could
// have, and for each the plan that follows from it. Picking one of the other goals (or typing
// something close) redraws the board around that plan, so the goal can be tried without a key.

interface Reading { goal: string; opener: string; decides: string; ask: string; plan: [slot: string, name: string, minutes: number, aim: string][]; questions: string[] }
interface DemoMeeting { title: RegExp; type: string; process: string; step: string; purpose: string; numbers: string; basis: 'agreed_next_step' | 'inferred'; readings: Reading[] }

const DEMO_MEETINGS: DemoMeeting[] = [
  {
    title: /Brightline renewal/, type: 'customer', process: 'Renewals', step: 'Renewal at risk · check-in', numbers: 'theirs', basis: 'inferred',
    purpose: 'Brightline’s renewal is coming up while seats are falling and a promise is late.',
    readings: [
      { goal: 'Jordan agrees to renew at the current seat count', opener: 'The SSO timeline is late, and that’s on me', decides: 'Owning the late SSO timeline before he raises it', ask: 'A renewal decision date, and who signs',
        plan: [['open', 'Own the delay', 5, ''], ['learn', 'Behind the drop', 15, 'Hear why seats fell before defending the price'], ['show', 'Price and SSO', 15, 'Answer the price with what they’d lose by switching'], ['close', 'Renewal date', 10, '']],
        questions: ['What would make renewing an easy yes for you?', 'Who else weighs in on the renewal?'] },
      { goal: 'Find out why seats are falling at Brightline', opener: 'I’d like to understand the seat drop before anything else', decides: 'Jordan saying it plainly, not politely', ask: 'An intro to the team leads who stopped using it',
        plan: [['open', 'Open', 5, ''], ['learn', 'Why seats fell', 25, 'Ask, then stay quiet: let Jordan list every reason'], ['show', 'What you’d change', 10, 'Offer one fix per reason, nothing more'], ['close', 'Who to talk to', 5, '']],
        questions: ['Which teams stopped using it, and when?', 'What did they go back to doing instead?', 'What would have kept them?'] },
      { goal: 'Get IT to commit to an SSO rollout date', opener: 'The SSO timeline is late; here it is', decides: 'Whether SSO is IT’s real blocker or a polite no', ask: 'A call with their IT lead this week',
        plan: [['open', 'Own the delay', 5, ''], ['show', 'SSO timeline', 15, 'Walk through the SSO timeline you owe them'], ['learn', 'IT’s blockers', 15, 'Ask what IT needs beyond SSO to say yes'], ['close', 'IT call', 10, '']],
        questions: ['If SSO shipped tomorrow, would IT approve it?', 'Who in IT owns the decision?'] },
    ],
  },
  {
    title: /Larkspur partner meeting/, type: 'investor', process: 'Seed fundraise', step: 'Seed fundraise · partner meeting', numbers: 'ours', basis: 'inferred',
    purpose: 'Maya is bringing Cueboard to the Larkspur partnership after the first call.',
    readings: [
      { goal: 'Leave with a clear path to a term sheet', opener: 'What’s changed since Maya and I first spoke', decides: 'A straight answer on churn, with the cohort table', ask: 'What each partner needs to see to say yes',
        plan: [['open', 'Open', 5, ''], ['show', 'The numbers', 15, 'Lead with growth, then go straight to the cohorts'], ['learn', 'Partner questions', 15, 'Let every partner voice their doubt once'], ['close', 'Path to yes', 10, '']],
        questions: ['What would you need to see to lead this round?', 'What’s your process and timing from here?'] },
      { goal: 'Get Maya to champion the deal with her partners', opener: 'Thank Maya for bringing this to the partnership', decides: 'Maya having an answer for each partner’s doubt', ask: 'Which partner is least convinced, and why',
        plan: [['open', 'Open', 5, ''], ['learn', 'Partner doubts', 15, 'Find out which objections the partners hold'], ['show', 'Your answers', 15, 'Give a one-line answer to each doubt'], ['close', 'Her next step', 10, '']],
        questions: ['Which partner needs the most convincing?', 'What did the partners ask after our first call?'] },
    ],
  },
  {
    title: /Priya \(Northwind\)/, type: 'customer', process: 'Design partners', step: 'Design partners · first call', numbers: 'none', basis: 'inferred',
    purpose: 'A first call with Priya at Northwind Logistics, from an introduction.',
    readings: [
      { goal: 'Learn how Northwind prepares for customer calls today', opener: 'I’m here to learn how your team works', decides: 'Priya describing a recent call that went badly', ask: 'A second call with one of her team',
        plan: [['open', 'Open', 5, ''], ['learn', 'Their prep today', 15, 'Get one real story of a call that went wrong'], ['show', 'How you’d help', 5, 'Show only what answers that story'], ['close', 'Next call', 5, '']],
        questions: ['Walk me through how you prepared for your last big call?', 'What gets missed when prep is rushed?', 'Who else on the team feels this most?'] },
      { goal: 'Get Priya to agree to a two-week pilot', opener: 'A short pilot is the cheapest way to find out', decides: 'Showing value on her team’s own calls', ask: 'Five people for a two-week pilot',
        plan: [['open', 'Open', 5, ''], ['learn', 'Their pain', 10, 'Confirm the problem is worth a pilot to her'], ['show', 'The pilot', 10, 'Lay out two weeks, five people, one measure'], ['close', 'Start date', 5, '']],
        questions: ['What would a pilot need to prove for you?', 'Who would need to approve a pilot?'] },
    ],
  },
  {
    title: /Fieldstone integration/, type: 'partnership', process: 'CRM integration partner', step: 'Integration partner · technical follow-up', numbers: 'none', basis: 'agreed_next_step',
    purpose: 'The technical follow-up agreed on the last call with Fieldstone.',
    readings: [
      { goal: 'Agree the integration scope and who builds what', opener: 'Did the API overview answer what your team needed?', decides: 'Their engineers seeing the API as low effort', ask: 'A named engineer and a first milestone date',
        plan: [['open', 'Catch up', 5, ''], ['show', 'The API', 15, 'Walk through the API overview you sent'], ['learn', 'Their constraints', 15, 'Ask what their roadmap can’t move for'], ['close', 'Owners and dates', 10, '']],
        questions: ['What would make this a one-sprint build for you?', 'Who signs off on integrations on your side?'] },
      { goal: 'Find out whether Fieldstone will co-sell it', opener: 'Beyond the build: how would this reach your customers?', decides: 'Whether their sales team gains from it', ask: 'An intro to whoever runs their partner program',
        plan: [['open', 'Catch up', 5, ''], ['learn', 'Their partners', 20, 'Ask how their best integrations get sold'], ['show', 'What you bring', 10, 'Name the customers you’d bring to them'], ['close', 'Partner intro', 10, '']],
        questions: ['Which integrations do your reps actually sell?', 'What does a partner need to get on that list?'] },
    ],
  },
];

const words = (t: string) => new Set(t.toLowerCase().match(/[a-z’']{4,}/g) ?? []);
function readingFor(m: DemoMeeting, stated: string | undefined): Reading {
  if (!stated) return m.readings[0];
  const said = words(stated);
  const score = (r: Reading) => [...words(`${r.goal} ${r.ask} ${r.plan.map(x => x[1]).join(' ')}`)].filter(w => said.has(w)).length;
  return [...m.readings].sort((a, b) => score(b) - score(a))[0];
}

// The brief for a demo meeting, read from the understand step's prompt.
export function demoBrief(prompt: string) {
  const title = /^"(.+)", /m.exec(prompt.slice(prompt.indexOf('\nMEETING\n') + 1))?.[1] ?? '';
  const m = DEMO_MEETINGS.find(x => x.title.test(title));
  if (!m) return null;
  const stated = /The user's stated goal: "(.+)"\.$/m.exec(prompt)?.[1];
  const r = readingFor(m, stated);
  return {
    persona: 'founder', meetingType: m.type, process: m.process, step: m.step, purpose: m.purpose,
    goal: { text: stated ?? r.goal, basis: stated ? 'stated' : m.basis, alternatives: m.readings.filter(x => x !== r).map(x => x.goal) },
    theyWant: [], decides: [r.decides], opener: r.opener, ask: r.ask, risks: [], numbers: m.numbers, needs: [], unknowns: [],
    plan: r.plan.map(([slot, name, minutes, aim]) => ({ slot, name, minutes, aim })),
  };
}

// And its ranking: the questions that go with the reading, and the usual research questions kept.
export function demoRanking(prompt: string) {
  const r = DEMO_MEETINGS.flatMap(m => m.readings).find(x => prompt.includes(JSON.stringify(x.ask)));
  if (!r) return null;
  const gaps = [...prompt.matchAll(/^\[(gap:[\w-]+)\]/gm)].map(x => x[1]);
  return { items: gaps.map(id => ({ id, score: 1, why: 'worth asking' })), questions: r.questions.map(text => ({ text, why: 'serves the goal' })) };
}

// What a search would turn up before the first Northwind call: a few pages about Priya and her
// company, and one claim from a page the search never returned, which the checks throw out.
export function demoResearch(prompt: string, now = new Date()) {
  if (!prompt.includes(`${DEMO_USER.role} at ${DEMO_USER.company}`)) return null;
  const ref = (re: RegExp) => re.exec(prompt)?.[1];
  const p = ref(/^- \[(p\d+)\] Priya Raman/m), c = ref(/^- \[(c\d+)\] Northwind/m);
  const day = (n: number) => ymd(at(now, n));
  const findings = [
    ...(p ? [
      { about: p, topic: 'background', text: 'Ran dispatch at a regional 3PL for six years', url: 'https://northwind.example/team/priya-raman', published: '' },
      { about: p, topic: 'interest', text: 'Writes about giving reps back admin time', url: 'https://northwind.example/blog/rep-time', published: day(-25) },
    ] : []),
    ...(c ? [
      { about: c, topic: 'company', text: 'Midwest freight carrier with 14 depots', url: 'https://northwind.example/about', published: '' },
      { about: c, topic: 'news', text: 'Opened a Reno hub, its first in the West', url: 'https://freightnews.example/northwind-reno', published: day(-9) },
      { about: c, topic: 'news', text: 'Said to be raising a Series B', url: 'https://rumours.example/northwind', published: day(-3) },
    ] : []),
  ];
  const found = ['https://northwind.example/team/priya-raman', 'https://northwind.example/blog/rep-time', 'https://northwind.example/about/', 'https://freightnews.example/northwind-reno']
    .filter(() => p || c).map(url => ({ url }));
  return { value: { findings }, found };
}
