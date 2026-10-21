import type { Packet } from '../src/types.ts';

// The made-up relationship from the prototype's example board: Dana Ruiz at Halyard Ventures,
// first as a first meeting, then as the follow-up five weeks later.

const U = 'u-1';

export function danaFirst(): Packet {
  return {
    userId: U,
    now: '2026-09-15T18:00:00Z',
    meeting: {
      id: 'm-halyard-1', title: 'Halyard Ventures <> Cueboard', startsAt: '2026-09-16T17:00:00Z',
      durationMin: 30, type: 'investor', goal: 'Get the full-partner meeting', attendeeIds: ['p-dana'],
    },
    self: { companyName: 'Cueboard' },
    people: [{ id: 'p-dana', name: 'Dana Ruiz', email: 'dana@halyard.vc', companyId: 'c-halyard', resolved: true }],
    companies: [{ id: 'c-halyard', name: 'Halyard Ventures', domain: 'halyard.vc' }],
    sources: [
      { id: 's-team', kind: 'web', ref: 'https://halyard.vc/team', seenAt: '2026-09-15' },
      { id: 's-podcast', kind: 'web', ref: 'https://example.com/podcast/dana-ruiz', seenAt: '2026-09-15' },
      { id: 's-intro', kind: 'email', ref: 'msg:intro-priya', seenAt: '2026-08-28', ownerId: U },
      { id: 's-profile', kind: 'profile', ref: 'company profile', seenAt: '2026-09-01' },
      { id: 's-metrics', kind: 'profile', ref: 'metrics sheet', seenAt: '2026-10-01' },
      { id: 's-deck', kind: 'deck', ref: 'seed-deck.pdf', seenAt: '2026-09-01' },
    ],
    facts: [
      { id: 'f-role', subject: { kind: 'person', id: 'p-dana' }, topic: 'role', text: 'Partner at Halyard Ventures', sourceIds: ['s-team'], confidence: 0.95, key: 'title', value: 'Partner' },
      { id: 'f-bg1', subject: { kind: 'person', id: 'p-dana' }, topic: 'background', text: 'Led 3 dev-tools seed rounds', sourceIds: ['s-team'], confidence: 0.9 },
      { id: 'f-bg2', subject: { kind: 'person', id: 'p-dana' }, topic: 'background', text: 'Ex-PM at a payments company', sourceIds: ['s-team'], confidence: 0.85 },
      { id: 'f-int', subject: { kind: 'person', id: 'p-dana' }, topic: 'interest', text: 'Digs into retention cohorts', sourceIds: ['s-podcast'], date: '2026-07-10', confidence: 0.8 },
      { id: 'f-conn', subject: { kind: 'person', id: 'p-dana' }, topic: 'connection', text: 'Intro via Priya Shah, your angel', sourceIds: ['s-intro'], date: '2026-08-28', confidence: 0.95 },
      { id: 'f-open', subject: { kind: 'self', id: 'me' }, topic: 'opener', text: 'The customer story, not the market', sourceIds: ['s-profile'], confidence: 1, meetingTypes: ['investor'] },
      { id: 'f-ask', subject: { kind: 'self', id: 'me' }, topic: 'ask', text: 'Check size and decision timeline', sourceIds: ['s-profile'], confidence: 1, meetingTypes: ['investor'] },
    ],
    metrics: [
      {
        id: 'mrr', label: 'MRR', prefix: '$', better: 'up', meetingTypes: ['investor', 'other'], keywords: ['revenue', 'traction'],
        points: [
          { date: '2026-05-01', value: 19500, sourceId: 's-metrics' },
          { date: '2026-06-01', value: 23100, sourceId: 's-metrics' },
          { date: '2026-07-01', value: 28400, sourceId: 's-metrics' },
          { date: '2026-08-01', value: 33900, sourceId: 's-metrics' },
          { date: '2026-09-01', value: 40800, sourceId: 's-metrics' },
        ],
      },
      {
        id: 'nrr', label: 'Net retention', suffix: '%', better: 'up', meetingTypes: ['investor'], keywords: ['retention', 'cohort'],
        points: [
          { date: '2026-07-01', value: 121, sourceId: 's-metrics' },
          { date: '2026-08-01', value: 122, sourceId: 's-metrics' },
          { date: '2026-09-01', value: 124, sourceId: 's-metrics' },
        ],
      },
      {
        id: 'customers', label: 'Customers', better: 'up', meetingTypes: ['investor', 'customer'],
        points: [{ date: '2026-08-01', value: 27, sourceId: 's-metrics' }, { date: '2026-09-01', value: 31, sourceId: 's-metrics' }],
      },
    ],
    disclosures: [],
    amounts: [{
      id: 'use-of-funds', label: 'Use of funds', suffix: '%', meetingTypes: ['investor'], sourceId: 's-deck',
      items: [{ label: 'Product & eng', value: 55 }, { label: 'Go-to-market', value: 30 }, { label: 'Ops & hiring', value: 15 }],
    }],
    touches: [{ id: 't-intro', date: '2026-08-28', kind: 'intro', summary: 'Intro via Priya', personIds: ['p-dana'], sourceId: 's-intro' }],
    commitments: [],
    objections: [
      { id: 'o-feature', text: 'Isn’t this just a feature?', answer: '3 of our top 10 customers left the built-in version', meetingTypes: ['investor'], resolved: false, sourceIds: ['s-profile'] },
      { id: 'o-size', text: 'How big can this get?', answer: '40k support teams with 20+ agents', meetingTypes: ['investor'], resolved: false, sourceIds: ['s-deck'] },
    ],
    questions: [
      { id: 'q-who', text: 'Who else at the firm needs to meet us?', meetingTypes: ['investor'], priority: 2 },
      { id: 'q-inc', text: 'How do you think about the incumbents?', meetingTypes: ['investor'], stage: 'first', priority: 3 },
    ],
  };
}

export function danaFollowup(): Packet {
  const p = danaFirst();
  p.now = '2026-10-22T18:00:00Z';
  p.meeting = {
    id: 'm-halyard-2', title: 'Halyard Ventures follow-up', startsAt: '2026-10-23T17:00:00Z',
    durationMin: 45, type: 'investor', goal: 'A date for the full-partner meeting', attendeeIds: ['p-dana'],
  };
  p.sources.push(
    { id: 's-debrief-1', kind: 'debrief', ref: 'After notes, Sep 16', seenAt: '2026-09-16' },
    { id: 's-cohorts', kind: 'email', ref: 'msg:cohorts-sent', seenAt: '2026-09-19', ownerId: U },
    { id: 's-pricing', kind: 'email', ref: 'msg:dana-pricing', seenAt: '2026-10-02', ownerId: U },
  );
  p.facts.push(
    { id: 'f-churn', subject: { kind: 'person', id: 'p-dana' }, topic: 'interest', text: 'Asked twice about SMB churn', sourceIds: ['s-debrief-1'], date: '2026-09-16', confidence: 0.95 },
    { id: 'f-quote', subject: { kind: 'person', id: 'p-dana' }, topic: 'quote', text: 'Show me cohorts again in a month', sourceIds: ['s-debrief-1'], date: '2026-09-16', confidence: 0.95 },
    { id: 'f-pricing', subject: { kind: 'person', id: 'p-dana' }, topic: 'interest', text: 'Asked about pricing on Oct 2', sourceIds: ['s-pricing'], date: '2026-10-02', confidence: 0.9 },
    { id: 'f-avoid', subject: { kind: 'person', id: 'p-dana' }, topic: 'avoid', text: 'The market-size pitch. She’s seen it.', sourceIds: ['s-debrief-1'], date: '2026-09-16', confidence: 0.9 },
  );
  const mrr = p.metrics.find(m => m.id === 'mrr')!;
  mrr.points.push({ date: '2026-10-01', value: 48200, sourceId: 's-metrics' });
  p.metrics.find(m => m.id === 'customers')!.points.push({ date: '2026-10-01', value: 38, sourceId: 's-metrics' });
  p.metrics.push({
    id: 'churn', label: 'SMB churn', suffix: '%', better: 'down', meetingTypes: ['investor'], keywords: ['churn'],
    points: [
      { date: '2026-08-01', value: 4.1, sourceId: 's-metrics' },
      { date: '2026-09-01', value: 3.6, sourceId: 's-metrics' },
      { date: '2026-10-01', value: 2.8, sourceId: 's-metrics' },
    ],
  });
  p.disclosures.push(
    { metricId: 'mrr', personId: 'p-dana', value: 40800, date: '2026-09-16', sourceId: 's-debrief-1' },
    { metricId: 'customers', personId: 'p-dana', value: 31, date: '2026-09-16', sourceId: 's-debrief-1' },
    { metricId: 'churn', personId: 'p-dana', value: 3.6, date: '2026-09-16', sourceId: 's-debrief-1' },
  );
  p.touches.push(
    { id: 't-call-1', date: '2026-09-16', kind: 'meeting', summary: 'She wanted a month more of cohorts', personIds: ['p-dana'], sourceId: 's-debrief-1' },
    { id: 't-cohorts', date: '2026-09-19', kind: 'email', summary: 'You sent cohorts', personIds: ['p-dana'], sourceId: 's-cohorts' },
    { id: 't-pricing', date: '2026-10-02', kind: 'email', summary: 'She asked about pricing', personIds: ['p-dana'], sourceId: 's-pricing' },
  );
  p.commitments.push(
    { id: 'c-cohorts', owner: 'self', personId: 'p-dana', text: 'Send cohort data', madeAt: '2026-09-16', due: '2026-09-20', doneAt: '2026-09-19', sourceId: 's-cohorts' },
    { id: 'c-intro', owner: 'them', personId: 'p-dana', text: 'Intro to a platform partner', madeAt: '2026-09-16', due: '2026-10-10', sourceId: 's-debrief-1' },
  );
  p.objections.push({
    id: 'o-churn', text: 'SMB churn (her open question)', answer: 'Down from 3.6% to 2.8% a month',
    meetingTypes: ['investor'], raisedBy: 'p-dana', raisedAt: '2026-09-16', resolved: false, sourceIds: ['s-debrief-1', 's-metrics'],
  });
  p.questions.push({ id: 'q-pilots', text: 'What would make you lead this round?', meetingTypes: ['investor'], stage: 'followup', priority: 1 });
  return p;
}
