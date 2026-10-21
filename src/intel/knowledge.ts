// What we know about the people who use Cueboard and the processes their meetings belong to.
// This is knowledge the model reasons with, not a set of code paths: nothing branches on a
// persona id. Edit it as design partners teach us more.

export interface Stage { name: string; goal: string }
export interface Situation { name: string; wants: string[]; needs: string[] }
export interface Persona {
  id: string;
  label: string;
  who: string;
  processes: { name: string; stages: Stage[] }[];
  numbers: 'ours' | 'theirs' | 'both';
  prepMinutes: number;
  alwaysNeeds: string[];
  situations: Situation[];
}

export const PERSONAS: Persona[] = [
  {
    id: 'founder',
    label: 'Founder raising a round',
    who: 'Seed or Series A founder running 30-80 investor conversations in parallel, plus early customers.',
    processes: [{
      name: 'Fundraise',
      stages: [
        { name: 'Intro call', goal: 'Get to a partner meeting' },
        { name: 'Partner meeting', goal: 'Get to diligence or a term sheet discussion' },
        { name: 'Diligence', goal: 'Answer open questions and keep momentum' },
        { name: 'Term sheet', goal: 'Agree terms and close' },
      ],
    }],
    numbers: 'ours',
    prepMinutes: 10,
    alwaysNeeds: [
      'whether this fund can lead at this stage and size',
      'what this investor asked or pushed back on before',
      'the numbers they have already seen, so nothing contradicts them',
      'one clear ask that moves to the next stage',
    ],
    situations: [
      { name: 'First call with a partner', wants: ['who they are', 'a crisp opener', 'key numbers'], needs: ['fund fit', 'their likely objections', 'the ask'] },
      { name: 'Follow-up with the same investor', wants: ['what happened last time'], needs: ['what they asked for and whether it was delivered', 'what changed since', 'what is left before a decision'] },
      { name: 'Several investor calls in one day', wants: ['not to mix them up'], needs: ['objections recurring across investors', 'where each investor is in the process'] },
    ],
  },
  {
    id: 'discovery',
    label: 'Product lead or founder doing customer discovery',
    who: 'Runs interviews to learn and validate, not to sell; synthesizes across many calls.',
    processes: [{
      name: 'Discovery',
      stages: [
        { name: 'First interview', goal: 'Learn how they work today and test hypotheses' },
        { name: 'Follow-up interview', goal: 'Go deeper on the pain and what success looks like' },
        { name: 'Pilot conversation', goal: 'Agree a pilot scope, owner and success criteria' },
      ],
    }],
    numbers: 'theirs',
    prepMinutes: 15,
    alwaysNeeds: [
      'questions in order: their situation, the problem, its impact, who decides',
      'the hypotheses to test, phrased so as not to lead',
      'their numbers and tools, not ours',
      'what not to pitch',
    ],
    situations: [
      { name: 'First interview', wants: ['a question script', 'company background'], needs: ['to listen, not pitch', 'hypotheses to test', 'neutral questions'] },
      { name: 'Follow-up with a possible pilot', wants: ['what they said'], needs: ['their words about the pain', 'success criteria', 'who approves a pilot'] },
    ],
  },
  {
    id: 'ae',
    label: 'Account executive on a sales team',
    who: 'Carries a quota, 5-7 calls a day, deals with several buyer stakeholders, CRM as source of truth.',
    processes: [{
      name: 'Deal',
      stages: [
        { name: 'Discovery', goal: 'Qualify: pain, budget, who decides, timeline' },
        { name: 'Demo or evaluation', goal: 'Prove value to each stakeholder and agree next steps' },
        { name: 'Proposal', goal: 'Align on scope and price' },
        { name: 'Negotiation', goal: 'Agree terms within approved limits' },
        { name: 'Close', goal: 'Signature' },
      ],
    }],
    numbers: 'theirs',
    prepMinutes: 3,
    alwaysNeeds: [
      'who is in the room and what each person cares about',
      'what changed since the last touch',
      'qualification gaps turned into questions',
      'competitor objections and answers',
      'promises both ways',
    ],
    situations: [
      { name: 'Discovery booked by an SDR', wants: ['account basics'], needs: ['what the SDR learned', 'qualification gaps', 'a next step'] },
      { name: 'Demo with new stakeholders', wants: ['who is who'], needs: ['who decides, who champions, who blocks', 'a talk track per person', 'competitor answers'] },
      { name: 'Negotiation with a manager joining', wants: ['terms and limits'], needs: ['walk-away', 'approved concessions', 'roles in the call'] },
    ],
  },
  {
    id: 'sales-leader',
    label: 'Head of sales',
    who: 'Leads a team of AEs, joins key late-stage calls, runs pipeline reviews.',
    processes: [{ name: 'Deal', stages: [{ name: 'Late-stage call', goal: 'Remove the risk that is blocking the close' }] }],
    numbers: 'both',
    prepMinutes: 1,
    alwaysNeeds: ['where the deal stands', 'why they are on this call', 'the one risk to fix'],
    situations: [
      { name: 'Joining an AE call cold', wants: ['a 30-second brief'], needs: ['deal stage', 'the risk', 'their role in the call'] },
    ],
  },
  {
    id: 'investor',
    label: 'Venture investor',
    who: 'Partner at a fund, 6-10 founder calls a day, plus partner meetings and portfolio board meetings.',
    processes: [
      {
        name: 'Deal flow',
        stages: [
          { name: 'First call', goal: 'Decide whether to take it to the partner meeting' },
          { name: 'Deep dive', goal: 'Resolve the questions that would kill or make the deal' },
          { name: 'Partner meeting', goal: 'Win the partnership’s support or pass' },
        ],
      },
      { name: 'Portfolio', stages: [{ name: 'Board meeting', goal: 'Understand progress against plan and push on the one thing that matters' }] },
    ],
    numbers: 'theirs',
    prepMinutes: 2,
    alwaysNeeds: [
      'the company’s traction and round, from their own materials',
      'the questions that would kill or advance the deal',
      'fit with the fund’s thesis and conflicts with portfolio companies',
      'founder backgrounds and what needs verifying',
    ],
    situations: [
      { name: 'First call with a founder', wants: ['what they do', 'traction', 'the round'], needs: ['kill questions', 'thesis fit', 'portfolio conflicts'] },
      { name: 'Portfolio board meeting', wants: ['the key numbers'], needs: ['changes since the last board meeting', 'runway', 'what the founder promised'] },
    ],
  },
  {
    id: 'partnerships',
    label: 'Head of global partnerships',
    who: 'Builds and runs reseller, referral and technology partners across regions; often owns partner-sourced revenue alongside sales.',
    processes: [{
      name: 'Partnership',
      stages: [
        { name: 'First meeting', goal: 'Test fit and find a first joint opportunity' },
        { name: 'Business case', goal: 'Agree what each side brings and a pilot' },
        { name: 'Agreement', goal: 'Agree terms: revenue share, territory, exclusivity' },
        { name: 'Quarterly review', goal: 'Review partner-sourced pipeline and agree next quarter’s plan' },
      ],
    }],
    numbers: 'both',
    prepMinutes: 10,
    alwaysNeeds: [
      'how much their customer base overlaps with ours, by region',
      'what each side gets in the first 90 days',
      'who on their side owns the partnership and who signs',
      'their partner program and what they already sell',
    ],
    situations: [
      { name: 'First meeting with a potential partner', wants: ['who they are', 'their partner program'], needs: ['customer overlap', 'a first joint opportunity', 'who owns it on their side'] },
      { name: 'Quarterly review with a regional partner', wants: ['the numbers'], needs: ['partner-sourced pipeline against target', 'what changed since last quarter', 'promises both ways'] },
      { name: 'Negotiating a co-sell agreement', wants: ['the terms'], needs: ['walk-away on revenue share and territory', 'what was promised', 'who signs'] },
    ],
  },
];

// A compact text form for prompts. Stable order, so it caches well.
export function personaLibrary(): string {
  return PERSONAS.map(p => [
    `## ${p.label} (id: ${p.id})`,
    p.who,
    `Processes: ${p.processes.map(pr => `${pr.name}: ${pr.stages.map(s => `${s.name} → ${s.goal}`).join('; ')}`).join(' | ')}`,
    `Whose numbers matter: ${p.numbers}. Typical prep time: ${p.prepMinutes} min.`,
    `Always needs: ${p.alwaysNeeds.join('; ')}.`,
    ...p.situations.map(s => `Situation "${s.name}": wants ${s.wants.join(', ')}; needs ${s.needs.join(', ')}.`),
  ].join('\n')).join('\n\n');
}
