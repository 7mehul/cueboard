import type { FactTopic, MeetingType, Stage } from '../src/types.ts';

// Made-up names and phrasing for synthetic packets. Every firm and company here is fictional.

export const FIRST = ['Dana', 'Priya', 'Marcus', 'Elena', 'Kenji', 'Amara', 'Tomás', 'Sofia', 'Wei', 'Olu', 'Hannah', 'Ravi',
  'Chloe', 'Mateo', 'Aisha', 'Lukas', 'Noor', 'Jonah', 'Ines', 'Kwame', 'Yuki', 'Farah', 'Diego', 'Maren', 'Arjun', 'Zoë',
  'Samir', 'Leila', 'Owen', 'Mei', 'Bianca', 'Tariq', 'Nadia', 'Felix', 'Rosa', 'Idris', 'Greta', 'Hugo', 'Anika', 'Theo'];

export const LAST = ['Ruiz', 'Shah', 'Okafor', 'Lindqvist', 'Tanaka', 'Mensah', 'Alvarez', 'Rossi', 'Chen', 'Adeyemi', 'Becker',
  'Iyer', 'Dubois', 'Herrera', 'Khan', 'Novak', 'Haddad', 'Park', 'Moreau', 'Asante', 'Sato', 'Rahman', 'Castillo', 'Berg',
  'Nair', 'Fischer', 'Kowalski', 'Mahmoud', 'Walsh', 'Lin', "O'Connor", 'Oyelaran', 'Svensson', 'Delgado', 'Brandt'];

export const FIRMS = ['Halyard Ventures', 'Northbeam Capital', 'Tidewater Partners', 'Foundry Lane', 'Kestrel Fund', 'Basalt Ventures',
  'Oakmoor Capital', 'Lumen Seed', 'Granite Bay Ventures', 'Copperline', 'Meridian Arc', 'Fieldnote Capital', 'Harbor Light VC',
  'Silverpine Partners', 'Westwind Ventures'];

export const COMPANIES = ['Ridgeway Foods', 'Parcelwise', 'Brightdesk', 'Corvid Health', 'Lattice Freight', 'Mapleview Clinics',
  'Quillstone', 'Harrow & Finch', 'Bluefin Logistics', 'Stellate', 'Oakline Retail', 'Pinecrest Insurance', 'Tessellate',
  'Northwind Grocers', 'Driftwood Labs', 'Calder Systems', 'Ferrous Works', 'Juniper Fleet', 'Amberly Travel', 'Kinfolk Care',
  'Sablewood', 'Vantage Rooms', 'Glasshouse HR', 'Riverbend Credit'];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type ByType = Partial<Record<MeetingType | 'any', string[]>>;

export const FACTS: Partial<Record<FactTopic, ByType>> = {
  role: {
    investor: ['Partner at {firm}', 'Principal at {firm}', 'General Partner at {firm}', 'Associate at {firm}', 'Venture Partner at {firm}'],
    customer: ['VP of Operations at {company}', 'Head of Support at {company}', 'Director of IT at {company}', 'COO at {company}', 'Support Ops Lead at {company}'],
    partnership: ['Head of Partnerships at {company}', 'BD Lead at {company}', 'VP Product at {company}', 'Ecosystem Lead at {company}'],
    negotiation: ['Procurement Manager at {company}', 'CFO at {company}', 'VP Finance at {company}', 'Head of Vendor Management at {company}'],
    other: ['Founder of {company}', 'Advisor to early-stage teams', 'Operator in residence', 'Engineering Manager at {company}'],
  },
  background: {
    investor: ['Led {n} dev-tools seed rounds', 'Ex-PM at a payments company', 'Former founder, sold to {company2}', 'Engineer turned investor', 'Spent {n} years in growth equity'],
    any: ['Ran support at a 500-person SaaS company', 'Ten years in logistics ops', 'Previously at a consulting firm', 'Built the partner program at {company2}',
      'Started as a support agent', 'Joined {company} {n} years ago', 'Grew a team from 5 to {n}0'],
  },
  connection: {
    any: ['Intro via {name}, your angel', 'Met at a founder dinner in {month}', 'Former colleague of your cofounder', 'Replied to your cold email',
      'Customer of a friend’s company', 'You met at a conference in {month}'],
  },
  interest: {
    investor: ['Digs into retention cohorts', 'Cares about capital efficiency', 'Wants to see net revenue retention', 'Asks about churn early', 'Focuses on revenue growth', 'Pushes on market size'],
    customer: ['Focused on cutting support costs', 'Wants a 30-day pilot first', 'Cares about security reviews', 'Measured on response times', 'Wants fewer tools, not more'],
    partnership: ['Wants shared customers first', 'Cares about co-marketing reach', 'Asks how integrations get maintained'],
    negotiation: ['Pushing for a multi-year discount', 'Wants pricing tied to seats used', 'Cares about cancellation terms'],
    other: ['Into early-stage hiring', 'Curious about AI tooling'],
  },
  quote: {
    any: ['Show me cohorts again in a month', 'We tried building this ourselves', 'Price matters less than rollout time', 'Our CFO signs off on anything over $50k',
      'We need this live before Q4', 'Convince me this isn’t a feature', 'Churn is what kills these companies'],
  },
  fund: { investor: ['Fund II, $120M, seed and Series A', 'Writes $1–3M first checks', 'Leads about 8 deals a year', 'New $80M fund closed in {month}'] },
  portfolio: { investor: ['Backed two support-tooling companies', 'No direct competitors in portfolio', 'Portfolio includes a helpdesk startup', 'Invested in {company2} last year'] },
  news: {
    investor: ['{firm} closed a new fund in {month}', '{firm} led a Series A in {month}', '{firm} added two partners'],
    any: ['{company} raised a Series B in {month}', '{company} opened a second warehouse', '{company} hired a new CTO', '{company} announced layoffs in {month}',
      '{company} launched a self-serve plan', '{company} expanded to Europe'],
  },
  company: {
    any: ['{company} has about {n}00 employees', 'Regional chain with {n}0 stores', 'B2B SaaS, about {n}0 people', 'Family-owned, {n}0 years old', 'Publicly listed, mid-cap'],
  },
  pain: { any: ['Duplicate tickets eat agent time', 'Delivery costs up 20% this year', 'Onboarding takes six weeks', 'Manual reporting every Friday', 'Two systems that don’t talk'] },
  tools: { any: ['Runs support on a legacy helpdesk', 'Tracks everything in spreadsheets', 'Built an in-house dashboard', 'Uses three tools for one workflow'] },
  decision: { any: ['CFO signs off over $50k', 'Partners decide on Mondays', 'Security review takes four weeks', 'Needs board approval this year'] },
  opener: {
    investor: ['The customer story, not the market', 'Lead with growth since the last raise', 'Start with why support teams switch'],
    customer: ['What we heard from teams like yours', 'Start with their numbers, not ours'],
    partnership: ['Our shared customers and what they ask for', 'What each side gets in month one'],
    negotiation: ['Where we already agree, before price', 'The value delivered so far'],
    other: ['What I’m working on and why'],
  },
  ask: {
    investor: ['A partner meeting next week', 'Check size and decision timeline', 'Lead the round'],
    customer: ['A 30-day pilot with one team', 'A second call with their ops lead'],
    partnership: ['A named owner and a pilot', 'A joint webinar date'],
    negotiation: ['Annual terms at list price', 'Signature by month end'],
    other: ['An intro to someone they know'],
  },
  proof: { any: ['3 of top 10 customers left the built-in version', 'Cut duplicate tickets by 40% at a pilot', '40+ integrations vs their 6', 'Two pilots converted to annual', 'Payback under 4 months'] },
  avoid: { any: ['The market-size pitch. They’ve seen it.', 'Don’t re-explain the integration', 'Skip the team slide', 'Don’t reopen pricing'] },
};

export const PERSON_TOPICS: Record<MeetingType, FactTopic[]> = {
  investor: ['role', 'background', 'background', 'connection', 'interest', 'interest', 'quote'],
  customer: ['role', 'background', 'interest', 'interest', 'quote', 'connection'],
  partnership: ['role', 'background', 'interest', 'connection', 'quote'],
  negotiation: ['role', 'interest', 'quote', 'background'],
  other: ['role', 'background', 'connection', 'interest'],
};

export const COMPANY_TOPICS: Record<MeetingType, FactTopic[]> = {
  investor: ['fund', 'portfolio', 'news', 'news'],
  customer: ['company', 'news', 'pain', 'tools', 'decision'],
  partnership: ['company', 'news', 'decision', 'portfolio'],
  negotiation: ['company', 'decision', 'news'],
  other: ['company', 'news'],
};

export const OBJECTIONS: Record<MeetingType, [string, string][]> = {
  investor: [
    ['Isn’t this just a feature?', '3 of our top 10 customers left the built-in version'],
    ['How big can this get?', '40k support teams with 20+ agents'],
    ['Why now?', 'Ticket volume doubled while teams stayed flat'],
    ['What stops an incumbent copying this?', 'Two years of merge data they don’t have'],
    ['Is the team big enough?', 'Hiring two engineers with this round'],
  ],
  customer: [
    ['We already have a tool for this', 'It plugs into the one you have'],
    ['No budget this quarter', 'Pilot is free; pay from next quarter'],
    ['Security review will take months', 'SOC 2 report and answers ready today'],
    ['Our team won’t adopt another tool', 'Runs inside the helpdesk they use'],
  ],
  partnership: [
    ['What’s in it for us?', 'Shared customers ask for this weekly'],
    ['Partnerships like this stall', 'Start with one joint customer, not a program'],
    ['Our roadmap is full', 'We build the integration; you review it'],
  ],
  negotiation: [
    ['Your price is above other quotes', 'Payback in 4 months at full price'],
    ['We need a 3-year lock', 'Yes, with a usage floor'],
    ['We want a pilot discount', 'Pilot is already priced at cost'],
  ],
  other: [['Why spend time on this?', 'Ten minutes, one concrete ask']],
};

export const QUESTIONS: Record<MeetingType, [string, Stage | undefined][]> = {
  investor: [
    ['Who else at the firm needs to meet us?', undefined], ['How do you think about the incumbents?', 'first'],
    ['What would you need to see to lead?', undefined], ['What’s your timeline for a decision?', undefined],
    ['How involved are you after the check?', 'first'], ['What changed for you since we last spoke?', 'followup'],
  ],
  customer: [
    ['Walk me through the last time this broke', 'first'], ['How do you measure this today?', undefined],
    ['What happens if you do nothing?', 'first'], ['Who owns this problem?', undefined],
    ['What would a pilot need to show?', undefined], ['How did the pilot land with the team?', 'followup'],
  ],
  partnership: [
    ['How do your best partnerships start?', 'first'], ['Who owns this on your side?', undefined],
    ['What does success look like in 6 months?', undefined], ['What’s blocking the pilot?', 'followup'],
  ],
  negotiation: [
    ['Which terms matter most to you?', undefined], ['What’s driving the timeline?', undefined],
    ['Who else has to approve?', undefined], ['What changed since the last draft?', 'followup'],
  ],
  other: [['What are you working on lately?', undefined], ['How can I help?', undefined]],
};

export const TITLES: Record<MeetingType, string[]> = {
  investor: ['{firm} <> {self}', 'Intro: {name} ({firm})', '{firm} partner meeting', 'Seed round chat with {firm}', '{self} / {firm}'],
  customer: ['{company} discovery', 'Demo for {company}', '{company} pilot kickoff', 'Intro call: {company}', '{company} <> {self}'],
  partnership: ['{company} partnership', '{company} integration partners sync', '{self} x {company}'],
  negotiation: ['{company} contract renewal', 'Pricing call with {company}', '{company} terms review', '{company} MSA redlines'],
  other: ['Coffee with {name}', 'Catch-up: {name}', '{name} / {self}'],
};

export const GOALS: Record<MeetingType, Record<Stage, string[]>> = {
  investor: { first: ['Get the full-partner meeting', 'Learn their check size and process', 'Leave with a second meeting'], followup: ['A date for the full-partner meeting', 'A term sheet timeline', 'Close the churn question'] },
  customer: { first: ['Learn their top pain', 'Book a demo with their ops lead', 'Qualify budget and timing'], followup: ['A pilot start date', 'A named owner for the pilot', 'Agree success criteria'] },
  partnership: { first: ['Find a first joint customer', 'Name an owner on their side'], followup: ['Sign the pilot scope', 'Pick a launch date'] },
  negotiation: { first: ['Annual terms at list', 'Hold price, trade on term length'], followup: ['Signature this month', 'Close the open redlines'] },
  other: { first: ['Ask for one intro', 'Get honest feedback'], followup: ['Follow up on the intro', 'Share progress'] },
};

export const INTROS = ['Intro via {name}', 'Warm intro from {name}', 'Cold email reply'];
export const MEETING_SUMMARIES = ['They wanted a month more of cohorts', 'Liked the demo, asked for pricing', 'Agreed on a pilot scope', 'Pushed back on price',
  'Asked for two references', 'Wanted to see the roadmap', 'Went deep on churn', 'Asked who else is on the round', 'Talked security review steps'];
export const EMAIL_SUMMARIES = ['You sent the deck', 'They asked about pricing', 'You shared cohort data', 'They sent a security questionnaire',
  'Scheduling back and forth', 'They forwarded it to their CFO', 'You sent an investor update'];
export const SELF_PROMISES = ['Send cohort data', 'Share pricing options', 'Send two customer references', 'Fill in the security questionnaire', 'Send the updated deck'];
export const THEIR_PROMISES = ['Intro to a platform partner', 'Share their current volumes', 'Loop in their CFO', 'Send the contract redlines', 'Book the partner meeting'];

export interface MetricSpec {
  id: string; label: string; prefix?: string; suffix?: string; better: 'up' | 'down';
  types: MeetingType[]; keywords: string[]; base: [number, number]; drift: [number, number]; kind: 'money' | 'pct' | 'count' | 'months';
}

export const METRICS: MetricSpec[] = [
  { id: 'mrr', label: 'MRR', prefix: '$', better: 'up', types: ['investor', 'other'], keywords: ['revenue', 'growth', 'traction'], base: [5000, 80000], drift: [0.02, 0.2], kind: 'money' },
  { id: 'nrr', label: 'Net retention', suffix: '%', better: 'up', types: ['investor'], keywords: ['retention', 'cohort'], base: [95, 130], drift: [-0.02, 0.02], kind: 'pct' },
  { id: 'customers', label: 'Customers', better: 'up', types: ['investor', 'customer'], keywords: ['customers', 'logos'], base: [5, 200], drift: [0, 0.15], kind: 'count' },
  { id: 'burn', label: 'Monthly burn', prefix: '$', better: 'down', types: ['investor'], keywords: ['capital efficiency', 'burn'], base: [40000, 300000], drift: [-0.05, 0.06], kind: 'money' },
  { id: 'runway', label: 'Runway', suffix: ' mo', better: 'up', types: ['investor'], keywords: ['runway'], base: [8, 30], drift: [-0.08, 0.02], kind: 'months' },
  { id: 'churn', label: 'Logo churn', suffix: '%', better: 'down', types: ['investor'], keywords: ['churn'], base: [1, 6], drift: [-0.12, 0.08], kind: 'pct' },
  { id: 'saved', label: 'Hours saved per agent', better: 'up', types: ['customer'], keywords: ['support costs', 'response times'], base: [2, 12], drift: [0, 0.1], kind: 'count' },
  { id: 'merged', label: 'Tickets merged', better: 'up', types: ['customer'], keywords: ['duplicate tickets'], base: [200, 9000], drift: [0.02, 0.25], kind: 'count' },
  { id: 'shared', label: 'Shared customers', better: 'up', types: ['partnership'], keywords: ['shared customers'], base: [3, 60], drift: [0, 0.12], kind: 'count' },
  { id: 'integrations', label: 'Integrations live', better: 'up', types: ['partnership'], keywords: ['integrations'], base: [5, 45], drift: [0, 0.08], kind: 'count' },
  { id: 'acv', label: 'Average contract', prefix: '$', better: 'up', types: ['negotiation'], keywords: ['pricing', 'price'], base: [10000, 120000], drift: [-0.03, 0.06], kind: 'money' },
  { id: 'seats', label: 'Seats quoted', better: 'up', types: ['negotiation'], keywords: ['seats'], base: [20, 400], drift: [-0.05, 0.1], kind: 'count' },
  { id: 'discount', label: 'Discount asked', suffix: '%', better: 'down', types: ['negotiation'], keywords: ['discount'], base: [5, 30], drift: [-0.1, 0.1], kind: 'pct' },
];
