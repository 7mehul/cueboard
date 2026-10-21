import type {
  Amounts, Commitment, Disclosure, Fact, FactTopic, MeetingType, Metric, MetricPoint, Objection, Packet, Person,
  QuestionCandidate, Source, SourceKind, Stage, Subject, Touch,
} from '../src/types.ts';
import type { Rng } from './rng.ts';
import { rng } from './rng.ts';
import {
  COMPANIES, COMPANY_TOPICS, EMAIL_SUMMARIES, FACTS, FIRMS, FIRST, GOALS, INTROS, LAST, MEETING_SUMMARIES, METRICS, MONTHS,
  OBJECTIONS, PERSON_TOPICS, QUESTIONS, SELF_PROMISES, THEIR_PROMISES, TITLES,
} from './vocab.ts';
import type { MetricSpec } from './vocab.ts';

// Builds a realistic meeting packet from a seed, and at a set rate plants the problems real
// data has: unconfirmed people, missing or foreign sources, conflicts, stale news, bad numbers.
// Each planted problem is recorded in `tags` so results can be broken down by scenario.

export interface GenOptions { type?: MeetingType; stage?: Stage; edgeRate?: number }
export interface Generated { seed: number; tags: string[]; packet: Packet }

const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (t: number) => new Date(t).toISOString();
const day = (t: number) => iso(t).slice(0, 10);
const PRIVATE: SourceKind[] = ['email', 'notes', 'calendar', 'debrief', 'board', 'user'];

export function generate(seed: number, o: GenOptions = {}): Generated {
  const r = rng(seed);
  const tags: string[] = [];
  const rate = o.edgeRate ?? 0.12;
  const edge = (name: string, scale = 1) => {
    const on = r.chance(rate * scale);
    if (on) tags.push(name);
    return on;
  };

  const type: MeetingType = o.type ?? r.weighted<MeetingType>([['investor', 30], ['customer', 30], ['partnership', 15], ['negotiation', 15], ['other', 10]]);
  const follow = o.stage ? o.stage === 'followup' : r.chance(0.5);
  const richness = r.weighted<'sparse' | 'normal' | 'rich'>([['sparse', 25], ['normal', 50], ['rich', 25]]);
  const scale = { sparse: 0.4, normal: 1, rich: 1.8 }[richness];
  tags.unshift(type, follow ? 'followup' : 'first', richness);

  const userId = `u-${r.int(1, 9)}`;
  const otherUser = userId === 'u-1' ? 'u-2' : 'u-1';
  let k = 0;
  const nid = (prefix: string) => `${prefix}${++k}`;

  const start = Date.UTC(2026, 0, 5) + r.int(0, 330) * DAY + r.int(8, 18) * HOUR;
  const now = start - (edge('last_minute', 0.6) ? HOUR : r.pick([3, 18, 24, 40]) * HOUR);
  const durationMin = r.pick([15, 20, 30, 30, 30, 45, 45, 60, 90]);

  // ---------- sources ----------
  const sources: Source[] = [];
  const src = (kind: SourceKind, at: number, ref?: string) => {
    const id = nid('s');
    sources.push({ id, kind, ref: ref ?? `${kind}:${id}`, seenAt: day(at), ...(PRIVATE.includes(kind) ? { ownerId: userId } : {}) });
    return id;
  };
  const foreignSrc = () => {
    const id = nid('s');
    sources.push({ id, kind: 'email', ref: 'msg:someone-else', seenAt: day(now - 5 * DAY), ownerId: otherUser });
    return id;
  };
  const deadSrc = () => nid('gone');

  // ---------- their side ----------
  const theirName = r.pick(type === 'investor' ? FIRMS : COMPANIES);
  const company = { id: nid('c'), name: theirName, domain: theirName.toLowerCase().replace(/[^a-z]+/g, '') + '.com' };
  const vars: Record<string, string> = {
    firm: theirName, company: theirName, company2: r.pick(COMPANIES), self: 'Cueboard',
    name: `${r.pick(FIRST)} ${r.pick(LAST)}`, month: r.pick(MONTHS),
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, v: string) => (v === 'n' ? String(r.int(2, 9)) : vars[v] ?? v));

  const nPeople = edge('crowd', 0.5) ? r.int(4, 7) : r.weighted<number>([[1, 60], [2, 28], [3, 12]]);
  const people: Person[] = [];
  for (let i = 0; i < nPeople; i++) {
    const first = r.pick(FIRST);
    people.push({ id: nid('p'), name: `${first} ${r.pick(LAST)}`, email: `${first.toLowerCase()}@${company.domain}`, companyId: company.id, resolved: true });
  }
  if (people.length > 1 && edge('same_name', 0.3)) people[1].name = people[0].name;
  if (edge('unresolved', 0.8)) r.pick(people).resolved = false;
  let attendeeIds = people.map(x => x.id);
  if (edge('dangling_attendee', 0.25)) attendeeIds.push(nid('ghost'));
  if (edge('dup_attendee', 0.2)) attendeeIds.push(attendeeIds[0]);
  if (edge('no_attendees', 0.15)) attendeeIds = [];
  const resolvedPeople = () => people.filter(x => x.resolved);

  // ---------- history ----------
  const touches: Touch[] = [];
  const meetings: { at: number; sourceId: string; personIds: string[] }[] = [];
  let cursor = start - r.int(25, 220) * DAY;
  const primary = people[0];
  if (r.chance(0.6)) {
    touches.push({ id: nid('t'), date: day(cursor), kind: 'intro', summary: fill(r.pick(INTROS)), personIds: [primary.id], sourceId: src('email', cursor) });
  }
  const email = (at: number) => {
    touches.push({ id: nid('t'), date: day(at), kind: 'email', summary: r.pick(EMAIL_SUMMARIES), personIds: [r.pick(people).id], sourceId: src('email', at) });
  };
  if (follow) {
    const nMeet = r.int(1, Math.max(1, Math.round(4 * scale)));
    for (let i = 0; i < nMeet; i++) {
      cursor += r.int(5, 30) * DAY;
      if (cursor >= start - DAY) break;
      const sourceId = src('debrief', cursor);
      const personIds = r.sample(people, r.int(1, people.length)).map(x => x.id);
      // Memory only counts for confirmed people, so make sure a confirmed attendee was there.
      const confirmed = resolvedPeople()[0];
      if (confirmed && !personIds.includes(confirmed.id)) personIds.push(confirmed.id);
      meetings.push({ at: cursor, sourceId, personIds });
      touches.push({ id: nid('t'), date: day(cursor), kind: r.chance(0.8) ? 'meeting' : 'call', summary: r.pick(MEETING_SUMMARIES), personIds, sourceId });
      for (let e = r.int(0, 2); e > 0; e--) { const at = cursor + r.int(1, 4) * DAY; if (at < start - HOUR) email(at); }
    }
    if (!meetings.length) {
      const at = start - 7 * DAY;
      const sourceId = src('debrief', at);
      const personIds = [(resolvedPeople()[0] ?? primary).id];
      meetings.push({ at, sourceId, personIds });
      touches.push({ id: nid('t'), date: day(at), kind: 'meeting', summary: r.pick(MEETING_SUMMARIES), personIds, sourceId });
    }
  } else {
    for (let e = r.int(0, 2); e > 0; e--) email(start - r.int(2, 20) * DAY);
    const unconfirmed = people.find(x => !x.resolved);
    if (unconfirmed && edge('history_unresolved', 2)) {
      const at = start - 30 * DAY;
      touches.push({ id: nid('t'), date: day(at), kind: 'meeting', summary: 'Met at an event', personIds: [unconfirmed.id], sourceId: src('debrief', at) });
    }
  }
  if (touches.length && edge('unsourced_touch', 0.5)) r.pick(touches).sourceId = deadSrc();
  if (edge('future_touch', 0.3)) touches.push({ id: nid('t'), date: day(start + 3 * DAY), kind: 'meeting', summary: 'Scheduled next call', personIds: [primary.id], sourceId: src('calendar', now) });
  const lastMeeting = meetings.at(-1);

  // ---------- facts ----------
  const facts: Fact[] = [];
  const text = (topic: FactTopic) => {
    const pool = FACTS[topic]?.[type] ?? FACTS[topic]?.any ?? [];
    return pool.length ? fill(r.pick(pool)) : '';
  };
  const add = (subject: Subject, topic: FactTopic, t: string, sourceId: string, extra: Partial<Fact> = {}) => {
    if (!t) return;
    const f: Fact = { id: nid('f'), subject, topic, text: t, sourceIds: [sourceId], confidence: Math.round(r.float(0.45, 1) * 100) / 100, ...extra };
    facts.push(f);
    return f;
  };
  const pastDate = (maxDays: number) => day(now - r.int(1, maxDays) * DAY);

  for (const person of people) {
    const subject: Subject = { kind: 'person', id: person.id };
    const n = Math.round(r.int(1, 5) * scale);
    const topics = r.sample(PERSON_TOPICS[type], n);
    for (const topic of topics) {
      const t = text(topic);
      if (topic === 'role') {
        add(subject, topic, t, src(r.pick<SourceKind>(['web', 'enrichment']), now), { key: 'title', value: t.split(' at ')[0] });
      } else if (topic === 'background') {
        add(subject, topic, t, src(r.pick<SourceKind>(['web', 'enrichment']), now));
      } else if (topic === 'connection') {
        add(subject, topic, t, src('email', now - 20 * DAY), { date: pastDate(200) });
      } else if (lastMeeting && r.chance(0.6)) {
        add(subject, topic, t, lastMeeting.sourceId, { date: day(lastMeeting.at) });
      } else {
        add(subject, topic, t, src('web', now), { date: pastDate(400) });
      }
    }
  }
  const cSubject: Subject = { kind: 'company', id: company.id };
  for (const topic of r.sample(COMPANY_TOPICS[type], Math.round(r.int(1, 4) * scale))) {
    add(cSubject, topic, text(topic), src('web', now), { date: pastDate(topic === 'news' ? 240 : 500) });
  }
  const self: Subject = { kind: 'self', id: 'me' };
  const profile = src('profile', now - 30 * DAY);
  if (r.chance(0.8)) add(self, 'opener', text('opener'), profile, { confidence: 1, meetingTypes: [type] });
  if (r.chance(0.8)) add(self, 'ask', text('ask'), profile, { confidence: 1, meetingTypes: [type] });
  for (let i = r.int(0, 2); i > 0; i--) add(self, 'proof', text('proof'), profile, { confidence: 0.9 + r.float(0, 0.1) });
  if (lastMeeting && r.chance(0.5)) add({ kind: 'person', id: primary.id }, 'avoid', text('avoid'), lastMeeting.sourceId, { date: day(lastMeeting.at), confidence: 0.9 });

  if (edge('title_change', 0.6)) {
    const older = day(now - 200 * DAY);
    const newerConfident = r.chance(0.5);
    add({ kind: 'person', id: primary.id }, 'role', `Principal at ${theirName}`, src('enrichment', now), { key: 'title', value: 'Principal', date: older, confidence: 0.9 });
    add({ kind: 'person', id: primary.id }, 'role', `Partner at ${theirName}`, src('web', now),
      { key: 'title', value: 'Partner', date: newerConfident ? pastDate(30) : older, confidence: newerConfident ? 0.9 : 0.7 });
  }
  if (facts.length && edge('duplicate_fact', 0.7)) { const f = r.pick(facts); facts.push({ ...f, id: nid('f') }); }
  if (edge('unsourced_fact', 0.7)) {
    add({ kind: 'person', id: primary.id }, 'background', 'Rumored to be leaving the firm', deadSrc(), { confidence: 0.9 });
    facts.push({ id: nid('f'), subject: cSubject, topic: 'company', text: `${theirName} is about to be acquired`, sourceIds: [], confidence: 0.95 });
  }
  if (edge('foreign_fact', 0.5)) {
    add({ kind: 'person', id: primary.id }, 'interest', 'Thinks your pricing is too high', src('notes', now), { visibleTo: otherUser, confidence: 0.95 });
    add({ kind: 'person', id: primary.id }, 'quote', 'Told another founder they pass on everything', foreignSrc(), { confidence: 0.95 });
  }
  if (facts.length && edge('long_text', 0.7)) {
    for (const f of r.sample(facts, 3)) f.text = `${f.text}, and also ${text('background') || 'a lot more detail'} which matters because ${text('interest') || 'it does'}`;
  }
  if (edge('future_fact', 0.3)) add(cSubject, 'news', `${theirName} will announce a merger`, src('web', now), { date: day(now + 10 * DAY), confidence: 0.9 });
  if (edge('stale_news', 0.6)) add(cSubject, 'news', `${theirName} opened an office in Austin`, src('web', now), { date: day(now - 400 * DAY), confidence: 0.9 });

  // ---------- numbers ----------
  const metrics: Metric[] = [];
  const disclosures: Disclosure[] = [];
  const pool = METRICS.filter(m => m.types.includes(type));
  const nMetrics = type === 'investor' ? r.int(2, 5) : r.int(0, 2);
  const metricsSrc = src('profile', now - 2 * DAY);
  for (const spec of r.sample(pool, Math.round(nMetrics * Math.min(scale, 1.2)))) {
    metrics.push(makeMetric(r, spec, now, metricsSrc, richness, edge));
  }
  if (metrics.length && edge('bad_point', 0.5)) {
    const m = r.pick(metrics);
    const bad: MetricPoint = r.pick([
      { date: day(now - 3 * DAY), value: Number.NaN, sourceId: metricsSrc },
      { date: 'not-a-date', value: 10, sourceId: metricsSrc },
      { date: day(now + 20 * DAY), value: 999999, sourceId: metricsSrc },
      { date: day(now - 2 * DAY), value: 12, sourceId: deadSrc() },
    ]);
    m.points.push(bad);
  }
  const shareTo = () => (resolvedPeople()[0] ?? primary).id;
  if (lastMeeting) {
    for (const m of metrics) {
      if (!r.chance(0.6)) continue;
      const before = m.points.filter(pt => Number.isFinite(pt.value) && Date.parse(pt.date) <= lastMeeting.at && pt.sourceId === metricsSrc)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1);
      if (!before) continue;
      disclosures.push({ metricId: m.id, personId: shareTo(), value: before.value, date: day(lastMeeting.at), sourceId: lastMeeting.sourceId });
      if (edge('worse_since', 1)) {
        const latest = m.points.filter(pt => pt.sourceId === metricsSrc && Number.isFinite(pt.value) && Date.parse(pt.date) <= now)
          .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1)!;
        if (Date.parse(latest.date) > lastMeeting.at) latest.value = round(spec(m).kind, m.better === 'up' ? before.value * r.float(0.7, 0.97) : before.value * r.float(1.05, 1.4));
      }
    }
    if (metrics.length && edge('disclosure_newer', 0.3)) {
      disclosures.push({ metricId: metrics[0].id, personId: shareTo(), value: 1, date: day(start - HOUR * 2), sourceId: src('email', now) });
    }
    if (metrics.length && people.some(x => !x.resolved) && edge('disclosure_unresolved', 1)) {
      disclosures.push({ metricId: metrics[0].id, personId: people.find(x => !x.resolved)!.id, value: 7, date: day(lastMeeting.at), sourceId: lastMeeting.sourceId });
    }
  } else if (metrics.length && r.chance(0.1)) {
    tags.push('emailed_numbers');
    const m = metrics[0];
    const pt = m.points.filter(x => x.sourceId === metricsSrc && Number.isFinite(x.value)).at(-2);
    if (pt) disclosures.push({ metricId: m.id, personId: shareTo(), value: pt.value, date: day(Date.parse(pt.date) + DAY), sourceId: src('email', now) });
  }

  // Sometimes the other side's numbers too: a prospect's volumes, a startup's traction for an investor.
  if (r.chance(0.4)) {
    tags.push('their_numbers');
    const theirSrc = src(r.pick<SourceKind>(['deck', 'email', 'web']), now);
    const label = type === 'investor' ? 'Their MRR' : type === 'partnership' ? 'Their customers' : 'Tickets per month';
    const start0 = r.int(500, 50000);
    const pts: MetricPoint[] = [];
    for (let i = r.int(1, 5); i >= 0; i--) pts.push({ date: day(now - i * 30 * DAY - r.int(1, 5) * DAY), value: Math.round(start0 * (1 + r.float(-0.2, 0.4)) ), sourceId: r.chance(0.9) ? theirSrc : deadSrc() });
    metrics.push({ id: nid('their'), owner: r.chance(0.85) ? { kind: 'company', id: company.id } : { kind: 'company', id: 'c-elsewhere' }, label, better: r.pick(['up', 'down']), meetingTypes: [type], points: pts });
  }

  const amounts: Amounts[] = [];
  if ((type === 'investor' || type === 'negotiation') && r.chance(0.6)) {
    const many = edge('too_many_bars', 0.4);
    const labels = type === 'investor'
      ? ['Product & eng', 'Go-to-market', 'Ops & hiring', 'Data infra', 'Security', 'Design', 'Support', 'Legal']
      : ['Starter', 'Team', 'Business', 'Enterprise', 'Annual', 'Monthly', 'Pilot', 'Custom'];
    const items = r.sample(labels, many ? 8 : r.int(2, 4)).map(label => ({ label, value: r.int(5, 60) }));
    amounts.push({ id: nid('a'), label: type === 'investor' ? 'Use of funds' : 'Pricing options', suffix: type === 'investor' ? '%' : '', prefix: type === 'investor' ? '' : '$', meetingTypes: [type], items, sourceId: src('deck', now) });
  }

  // ---------- promises, objections, questions ----------
  const commitments: Commitment[] = [];
  if (follow) {
    for (let i = r.int(0, 4); i > 0; i--) {
      const m = r.pick(meetings);
      const owner = r.chance(0.5) ? 'self' : 'them';
      const due = m.at + r.int(3, 25) * DAY;
      const done = r.chance(0.5) && due < now;
      commitments.push({
        id: nid('k'), owner, personId: r.pick(m.personIds), text: r.pick(owner === 'self' ? SELF_PROMISES : THEIR_PROMISES),
        madeAt: day(m.at), due: day(due), ...(done ? { doneAt: day(m.at + r.int(1, 3) * DAY) } : {}), sourceId: m.sourceId,
      });
    }
    const unconfirmed = people.find(x => !x.resolved);
    if (unconfirmed && edge('promise_unresolved', 1)) {
      commitments.push({ id: nid('k'), owner: 'them', personId: unconfirmed.id, text: 'Send the budget numbers', madeAt: day(meetings[0].at), due: day(meetings[0].at + 5 * DAY), sourceId: meetings[0].sourceId });
    }
  } else if (r.chance(0.15)) {
    commitments.push({ id: nid('k'), owner: 'self', personId: primary.id, text: 'Send the deck before the call', madeAt: day(now - 5 * DAY), due: day(now - DAY), sourceId: src('email', now) });
  }

  const objections: Objection[] = [];
  for (const [t, answer] of r.sample(OBJECTIONS[type], r.int(1, 3))) {
    objections.push({ id: nid('o'), text: t, ...(r.chance(0.7) ? { answer } : {}), meetingTypes: [type], resolved: false, sourceIds: [r.chance(0.5) ? profile : src('deck', now)] });
  }
  if (lastMeeting) {
    for (const [t, answer] of r.sample(OBJECTIONS[type], r.int(0, 2))) {
      objections.push({
        id: nid('o'), text: t, ...(r.chance(0.6) ? { answer } : {}), meetingTypes: [type], raisedBy: r.pick(lastMeeting.personIds),
        raisedAt: day(lastMeeting.at), resolved: r.chance(0.3), sourceIds: [lastMeeting.sourceId],
      });
    }
  }

  const questions: QuestionCandidate[] = r.sample(QUESTIONS[type], r.int(1, 5)).map(([t, stage], i) => ({
    id: nid('q'), text: t, meetingTypes: [type], ...(stage ? { stage } : {}), priority: i,
  }));

  // ---------- the meeting ----------
  vars.name = primary.name;
  const stage: Stage = follow ? 'followup' : 'first';
  const typeMissing = edge('type_missing', 1.2);
  const noGoal = edge('no_goal', 1.2);

  const packet: Packet = {
    userId,
    now: iso(now),
    meeting: {
      id: `m${seed}`, title: fill(r.pick(TITLES[type])), startsAt: iso(start), durationMin,
      ...(typeMissing ? {} : { type }), ...(noGoal ? {} : { goal: r.pick(GOALS[type][stage]) }), attendeeIds,
    },
    self: { companyName: 'Cueboard' },
    people, companies: [company], sources, facts, metrics, disclosures, amounts, touches, commitments, objections, questions,
  };
  return { seed, tags, packet };
}

const spec = (m: Metric) => METRICS.find(s => s.id === m.id)!;

function round(kind: MetricSpec['kind'], v: number): number {
  if (kind === 'money') return Math.round(v / 100) * 100;
  if (kind === 'pct') return Math.round(v * 10) / 10;
  return Math.max(0, Math.round(v));
}

function makeMetric(r: Rng, s: MetricSpec, now: number, sourceId: string, richness: string, edge: (n: string, k?: number) => boolean): Metric {
  const len = edge('single_point', 0.4) ? 1 : richness === 'sparse' ? r.int(1, 2) : richness === 'normal' ? r.int(2, 6) : r.int(6, 18);
  const irregular = edge('irregular_dates', 0.5);
  const d = new Date(now);
  const points: MetricPoint[] = [];
  let v = r.float(s.base[0], s.base[1]);
  const dates: number[] = [];
  for (let i = len - 1; i >= 0; i--) {
    dates.push(irregular ? now - (i * r.int(4, 20) + r.int(1, 3)) * DAY : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
  }
  dates.sort((a, b) => a - b);
  for (const t of dates) {
    points.push({ date: new Date(t).toISOString().slice(0, 10), value: round(s.kind, v), sourceId });
    v = v * (1 + r.float(s.drift[0], s.drift[1]));
  }
  return { id: s.id, label: s.label, prefix: s.prefix, suffix: s.suffix, better: s.better, meetingTypes: s.types, keywords: s.keywords, points };
}
