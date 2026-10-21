import type { Block, BlockKind, Disclosure, Fact, FactTopic, GapKind, Line, Metric, MetricPoint, TimelineEvent } from './types.ts';
import type { Ctx } from './facts.ts';
import { blend, bump, isMemory, knows, relOf, score, validSources, warn, whyOf } from './facts.ts';
import type { Limit } from './text.ts';
import {
  LIMITS, daysBetween, firstName, fitClause, fitText, fits, fmtValue, gapText, isDate, lineLimit, longDate,
  monthLabel, ms, normalize, pctChange, pctText, shortDate, signed, titleLimit, wordCount,
} from './text.ts';

// ---------- lines ----------

interface LineOpts { label?: string; factIds?: string[]; tone?: Line['tone']; dedupe?: boolean; lim?: Limit }

function fit(ctx: Ctx, text: string, lim: Limit): string {
  const r = fitText(text, lim);
  if (r.trimmed) bump(ctx, 'trimmed');
  return r.text;
}

// The same line twice on one board is noise; the first placement wins.
function seen(ctx: Ctx, text: string): boolean {
  const k = normalize(text);
  if (ctx.seenText.has(k)) { bump(ctx, 'duplicate_dropped'); return true; }
  ctx.seenText.add(k);
  return false;
}

function finish(line: Line, o: LineOpts): Line {
  if (o.label) line.label = o.label;
  if (o.factIds) line.factIds = o.factIds;
  if (o.tone) line.tone = o.tone;
  return line;
}

// A line that states something as true. No valid source, no line.
function claim(ctx: Ctx, kind: BlockKind, idx: number, text: string, sourceIds: string[], o: LineOpts = {}): Line | null {
  const srcs = validSources(ctx, sourceIds);
  if (!srcs.length) { bump(ctx, 'unsourced_dropped'); return null; }
  const t = fit(ctx, text, o.lim ?? lineLimit(kind, idx));
  if (o.dedupe !== false && seen(ctx, t)) return null;
  const line: Line = { text: t, sourceIds: srcs, claim: true };
  if (isMemory(ctx, srcs)) line.memory = true;
  return finish(line, o);
}

// Intent, prompts and meeting details: the user's goal, a question to ask.
function plain(ctx: Ctx, kind: BlockKind, idx: number, text: string, o: LineOpts & { sourceIds?: string[]; gap?: GapKind } = {}): Line | null {
  const t = fit(ctx, text, o.lim ?? lineLimit(kind, idx));
  if (o.dedupe !== false && seen(ctx, t)) return null;
  const line: Line = { text: t, sourceIds: validSources(ctx, o.sourceIds ?? []), claim: false };
  if (isMemory(ctx, line.sourceIds)) line.memory = true;
  if (o.gap) line.gap = o.gap;
  return finish(line, o);
}

// Something unknown, shown in brackets so it can't pass for a fact.
function gap(ctx: Ctx, kind: BlockKind, idx: number, inner: string, g: GapKind, o: LineOpts = {}): Line | null {
  const t = gapText(inner, o.lim ?? lineLimit(kind, idx));
  if (o.dedupe !== false && seen(ctx, t)) return null;
  return finish({ text: t, sourceIds: [], claim: false, gap: g }, o);
}

const factText = (f: Fact) => {
  const t = f.text.trim();
  return f.topic === 'quote' && !/^["“]/.test(t) ? `“${t.replace(/^["“]|["”]$/g, '')}”` : t;
};

function factLine(ctx: Ctx, kind: BlockKind, idx: number, f: Fact, o: LineOpts = {}): Line | null {
  if (ctx.usedFacts.has(f.id)) return null;
  const l = claim(ctx, kind, idx, factText(f), f.sourceIds, { ...o, factIds: [f.id] });
  if (l) ctx.usedFacts.add(f.id);
  return l;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

// ---------- header ----------

export function header(ctx: Ctx): Block {
  const { p, fr } = ctx;
  const stage = fr.stage === 'first' ? 'First meeting' : `Follow-up · meeting ${fr.priorMeetings.length + 1}`;
  const base = `${longDate(p.meeting.startsAt)} · ${p.meeting.durationMin} min · ${stage}`;
  const names = fr.attendees.map(a => a.name).join(', ');
  const full = names ? `${base} · with ${names}` : base;
  const meta = plain(ctx, 'header', 0, fits(full, LIMITS.meta) ? full : base, { dedupe: false })!;
  return {
    id: 'header', kind: 'header', zone: 'top', slot: 'header', priority: -1, required: true,
    title: fit(ctx, p.meeting.title.trim() || 'Untitled meeting', titleLimit('header')),
    lines: [meta],
  };
}

// ---------- people ----------

export function personCards(ctx: Ctx): Block[] {
  const { pb, fr } = ctx;
  const kind: BlockKind = 'person';
  const companiesShown = new Set<string>();
  // When the model has ranked the attendees, the people who matter most get the cards.
  const order = ctx.intel ? [...fr.attendees].sort((a, b) => (relOf(ctx, `p:${b.id}`) ?? 1.5) - (relOf(ctx, `p:${a.id}`) ?? 1.5)) : fr.attendees;
  const shown = order.slice(0, pb.personCards);
  if (!fr.attendees.length) warn(ctx, 'no_attendees', 'The invite has no one else on it');
  return shown.map((person, i) => {
    const lines: Line[] = [];
    if (!person.resolved) {
      warn(ctx, 'person_unresolved', `Confirm who ${person.name} is before research runs`, person.id);
      lines.push(gap(ctx, kind, 0, `confirm who ${person.name} is`, 'confirm', { dedupe: false })!);
    } else {
      const ownsCompany = !!person.companyId && !companiesShown.has(person.companyId);
      if (person.companyId) companiesShown.add(person.companyId);
      const own = ctx.facts.filter(f => f.subject.kind === 'person' && f.subject.id === person.id);
      const company = ownsCompany ? ctx.facts.filter(f => f.subject.kind === 'company' && f.subject.id === person.companyId) : [];
      // Topics the playbook doesn't list still count if the model says they matter.
      const topicScore = (f: Fact, topics: FactTopic[]) => score(ctx, f, topics) || (relOf(ctx, f.id) ? 0.4 * f.confidence : 0);
      const ranked = [
        ...own.map(f => ({ f, s: blend(ctx, f.id, topicScore(f, pb.personTopics)), order: pb.personTopics.indexOf(f.topic) })),
        ...company.map(f => ({ f, s: blend(ctx, f.id, topicScore(f, pb.companyTopics) * 0.9), order: 100 + pb.companyTopics.indexOf(f.topic) })),
      ].filter(r => r.s > 0 && relOf(ctx, r.f.id) !== 0).sort((a, b) => b.s - a.s || a.f.id.localeCompare(b.f.id));

      const conflicts = ctx.conflicts.filter(c =>
        (c.subject.kind === 'person' && c.subject.id === person.id) ||
        (ownsCompany && c.subject.kind === 'company' && c.subject.id === person.companyId));
      const room = Math.max(1, pb.personLines - conflicts.length);
      const perTopic = new Map<FactTopic, number>();
      const picked: { l: Line; order: number; s: number }[] = [];
      for (const r of ranked) {
        if (picked.length >= room) break;
        const n = perTopic.get(r.f.topic) ?? 0;
        if (n >= 2) continue;
        const l = factLine(ctx, kind, 0, r.f);
        if (!l) continue;
        perTopic.set(r.f.topic, n + 1);
        picked.push({ l, order: r.order, s: r.s });
      }
      // With a model ranking, most important first; otherwise the playbook's reading order.
      picked.sort((a, b) => (ctx.intel ? b.s - a.s : 0) || a.order - b.order || b.s - a.s);
      lines.push(...picked.map(x => x.l));
      for (const c of conflicts) {
        const g = gap(ctx, kind, 0, `check: sources disagree on ${c.key}`, 'lookup', { dedupe: false });
        if (g && lines.length < pb.personLines) lines.push(g);
      }
      if (!lines.length) lines.push(gap(ctx, kind, 0, `look up ${person.name}’s role`, 'lookup', { dedupe: false })!);
    }
    if (i === 0 && fr.attendees.length > shown.length) {
      const rest = order.slice(shown.length).map(a => a.name).join(', ');
      const l = plain(ctx, kind, 0, `Also on the invite: ${rest}`, { dedupe: false });
      if (l) lines.push(l);
    }
    return {
      id: `person:${person.id}`, kind, zone: 'reference', slot: 'person',
      priority: pb.priority.person + i * 40, required: i === 0, color: 'sky',
      title: fit(ctx, person.name, LIMITS.title), lines, subjectId: person.id,
      ...(whyOf(ctx, `p:${person.id}`) ? { why: whyOf(ctx, `p:${person.id}`) } : {}),
    };
  });
}

// ---------- numbers ----------

export interface NumberInfo {
  m: Metric;
  index: number;
  points: MetricPoint[];
  latest: MetricPoint;
  prev?: MetricPoint;
  disc?: Disclosure; // the last value you shared with someone in this meeting
  own: boolean; // the user's own number, or the other side's
  since?: MetricPoint; // their number as it stood at the last meeting
  worse: boolean;
  relevant: boolean; // ties to something they care about
}

export function metricInfos(ctx: Ctx): NumberInfo[] {
  const { p, fr } = ctx;
  const interest = normalize(ctx.facts
    .filter(f => (f.topic === 'interest' || f.topic === 'quote' || f.topic === 'pain') && f.subject.kind === 'person' && fr.resolvedIds.has(f.subject.id))
    .map(f => f.text).join(' '));
  const now = ms(p.now), start = ms(p.meeting.startsAt);
  const out: NumberInfo[] = [];
  const companies = new Set(fr.attendees.filter(a => a.resolved).map(a => a.companyId).filter(Boolean));
  p.metrics.forEach((m, index) => {
    const own = !m.owner || m.owner.kind === 'self';
    // Someone else's numbers only belong on boards for meetings with them.
    if (!own && !(m.owner!.kind === 'company' ? companies.has(m.owner!.id) : fr.resolvedIds.has(m.owner!.id))) return;
    if (own && fr.type !== 'other' && !m.meetingTypes.includes(fr.type)) return;
    const byDay = new Map<string, MetricPoint>();
    for (const pt of m.points) {
      if (!isDate(pt.date) || ms(pt.date) > now || !Number.isFinite(pt.value)) continue;
      if (!validSources(ctx, [pt.sourceId]).length) { bump(ctx, 'unsourced_dropped'); continue; }
      byDay.set(new Date(pt.date).toISOString().slice(0, 10), pt);
    }
    const points = [...byDay.values()].sort((a, b) => ms(a.date) - ms(b.date));
    if (!points.length) return;
    const latest = points[points.length - 1];
    let disc = !own ? undefined : p.disclosures
      .filter(d => d.metricId === m.id && fr.resolvedIds.has(d.personId) && isDate(d.date) && ms(d.date) < start &&
        Number.isFinite(d.value) && validSources(ctx, [d.sourceId]).length > 0)
      .sort((a, b) => ms(a.date) - ms(b.date) || a.personId.localeCompare(b.personId)).at(-1);
    if (disc && ms(disc.date) > ms(latest.date)) {
      warn(ctx, 'metric_stale', `You shared ${m.label} after the newest value on file; update it`, m.id);
      disc = undefined;
    }
    const worse = !!disc && (m.better === 'up' ? latest.value < disc.value : latest.value > disc.value);
    const since = !own && fr.lastMeeting ? points.filter(pt => ms(pt.date) <= ms(fr.lastMeeting!.date)).at(-1) : undefined;
    const r = relOf(ctx, `m:${m.id}`);
    const relevant = r !== undefined ? r >= 2 : (m.keywords ?? []).some(k => { const n = normalize(k); return !!n && interest.includes(n); });
    if (r === 0) return;
    out.push({ m, index, points, latest, prev: points.at(-2), disc, own, since: since && since !== latest ? since : undefined, worse, relevant });
  });
  return out;
}

const changeLabel = (iso: string) => (new Date(iso).getUTCDate() === 1 ? monthLabel(iso, false) : shortDate(iso));

function numberNote(ctx: Ctx, n: NumberInfo): Line | null {
  const { m, latest, disc, prev } = n;
  const isBetter = (a: number, b: number) => (m.better === 'up' ? b > a : b < a);
  if (disc) {
    const pct = pctText(disc.value, latest.value);
    const diff = latest.value - disc.value;
    const change = diff === 0 ? 'no change' : pct === null ? (diff > 0 ? '+' : '−') + fmtValue(Math.abs(diff), m.prefix, m.suffix) : pct;
    const tone = diff === 0 ? undefined : isBetter(disc.value, latest.value) ? 'good' : 'bad';
    return claim(ctx, 'number', 1, `was ${fmtValue(disc.value, m.prefix, m.suffix)} · ${change}`, [latest.sourceId, disc.sourceId], { tone, dedupe: false });
  }
  if (n.since) {
    const s = n.since, pct = pctText(s.value, latest.value);
    const tone = latest.value === s.value ? undefined : isBetter(s.value, latest.value) ? 'good' : 'bad';
    return claim(ctx, 'number', 1, `was ${fmtValue(s.value, m.prefix, m.suffix)} · ${pct ?? 'changed'}`, [latest.sourceId, s.sourceId], { tone, dedupe: false });
  }
  if (prev) {
    const pct = pctText(prev.value, latest.value);
    if (pct === null) return null;
    const tone = latest.value === prev.value ? undefined : isBetter(prev.value, latest.value) ? 'good' : 'bad';
    return claim(ctx, 'number', 1, `${pct} vs ${changeLabel(prev.date)}`, [latest.sourceId, prev.sourceId], { tone, dedupe: false });
  }
  return null;
}

export function numberBlocks(ctx: Ctx, infos: NumberInfo[]): Block[] {
  const { pb } = ctx;
  // Whose numbers matter is the model's call when it has made one; ours by default.
  const side = ctx.intel?.brief?.numbers;
  const sideScore = (n: NumberInfo) => (side === 'theirs' ? +!n.own : side === 'ours' ? +n.own : 0);
  const sorted = [...infos].sort((a, b) =>
    ((relOf(ctx, `m:${b.m.id}`) ?? 1.5) - (relOf(ctx, `m:${a.m.id}`) ?? 1.5)) || (sideScore(b) - sideScore(a)) ||
    (+!!b.disc - +!!a.disc) || (+b.relevant - +a.relevant) || a.index - b.index);
  return sorted.slice(0, pb.numbers).map((n, i) => {
    const lines: Line[] = [];
    const v = claim(ctx, 'number', 0, fmtValue(n.latest.value, n.m.prefix, n.m.suffix), [n.latest.sourceId], { dedupe: false });
    if (v) lines.push(v);
    const note = numberNote(ctx, n);
    if (note) lines.push(note);
    return {
      id: `number:${n.m.id}`, kind: 'number', zone: 'numbers', slot: 'number',
      priority: pb.priority.number + i * pb.step, title: fit(ctx, n.m.label, LIMITS.title), lines, metricId: n.m.id,
      ...(whyOf(ctx, `m:${n.m.id}`) ? { why: whyOf(ctx, `m:${n.m.id}`) } : {}),
    };
  });
}

// ---------- visuals ----------

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// A line chart only when there are three or more dated values and the picture carries the point.
export function trendBlock(ctx: Ctx, infos: NumberInfo[], shown: Set<string>): Block | null {
  const { pb } = ctx;
  if (pb.trend === 'never') return null;
  // A chart earns its place by tying to what they care about and by showing real movement.
  const worth = (n: NumberInfo) => {
    const pts = n.points.slice(-12);
    const move = Math.abs(pctChange(pts[0].value, pts[pts.length - 1].value) ?? 0);
    return (n.relevant ? 2 : 0) + (shown.has(n.m.id) ? 1 : 0) + Math.min(move / 20, 2) + Math.min(pts.length / 6, 1);
  };
  const pick = infos
    .filter(n => n.points.length >= 3 && (pb.trend === 'always' || n.relevant))
    .map(n => ({ n, w: worth(n) }))
    .sort((a, b) => b.w - a.w || a.n.index - b.n.index)[0]?.n;
  if (!pick) return null;
  const { m } = pick;
  const pts = pick.points.slice(-12);
  const gaps = pts.slice(1).map((pt, i) => daysBetween(pts[i].date, pt.date));
  const monthly = median(gaps) >= 25 && median(gaps) <= 35;
  const withYear = daysBetween(pts[0].date, pts[pts.length - 1].date) > 330;
  const label = (iso: string) => (monthly ? monthLabel(iso, withYear) : shortDate(iso));
  const first = pts[0], last = pts[pts.length - 1];
  const pct = pctChange(first.value, last.value);
  const lines: Line[] = [];
  if (pct !== null && pct !== 0) {
    const good = m.better === 'up' ? pct > 0 : pct < 0;
    const l = claim(ctx, 'trend', 0, `${signed(pct)}% since ${label(first.date)}`, [first.sourceId, last.sourceId], { dedupe: false, tone: good ? 'good' : 'bad' });
    if (l) lines.push(l);
  }
  return {
    id: `trend:${m.id}`, kind: 'trend', zone: 'visual', slot: 'trend', priority: pb.priority.trend,
    title: fit(ctx, `${m.label} ${monthly ? 'by month' : 'over time'}`, LIMITS.title), lines, metricId: m.id,
    chart: { prefix: m.prefix ?? '', suffix: m.suffix ?? '', points: pts.map(pt => ({ label: label(pt.date), value: pt.value })), sourceIds: uniq(pts.map(pt => pt.sourceId)) },
  };
}

// Bars compare two to six amounts. More than that stays off the board.
export function barsBlock(ctx: Ctx): Block | null {
  const { p, pb, fr } = ctx;
  if (!pb.bars) return null;
  for (const a of p.amounts) {
    if (fr.type !== 'other' && !a.meetingTypes.includes(fr.type)) continue;
    if (relOf(ctx, `a:${a.id}`) === 0) continue;
    if (!validSources(ctx, [a.sourceId]).length) { bump(ctx, 'unsourced_dropped'); continue; }
    const items = a.items.filter(it => Number.isFinite(it.value) && it.label?.trim());
    if (items.length < 2 || items.length > 6) {
      warn(ctx, 'bars_skipped', `${a.label} has ${items.length} amounts; a bar chart needs 2 to 6`, a.id);
      continue;
    }
    return {
      id: `bars:${a.id}`, kind: 'bars', zone: 'visual', slot: 'bars', priority: pb.priority.bars,
      title: fit(ctx, a.label, LIMITS.title), lines: [],
      chart: { prefix: a.prefix ?? '', suffix: a.suffix ?? '', points: items.map(it => ({ label: fit(ctx, it.label, { words: 3, chars: 18 }), value: it.value })), sourceIds: [a.sourceId] },
    };
  }
  return null;
}

// ---------- relationship ----------

export function commitmentLines(ctx: Ctx, kind: BlockKind): Line[] {
  const { p, fr } = ctx;
  const start = ms(p.meeting.startsAt), now = ms(p.now);
  const people = new Map(p.people.map(x => [x.id, x]));
  const rows = p.commitments
    .filter(c => c.personId && fr.resolvedIds.has(c.personId) && isDate(c.madeAt) && ms(c.madeAt) < start && c.text?.trim())
    .map(c => {
      const done = isDate(c.doneAt) && ms(c.doneAt) <= now;
      const overdue = !done && isDate(c.due) && ms(c.due) < now;
      return { c, done, overdue, rank: overdue ? 0 : done ? 2 : 1, when: ms((done ? c.doneAt : c.due) ?? c.madeAt) || ms(c.madeAt) };
    })
    .filter(r => !r.done || daysBetween(r.c.doneAt!, p.meeting.startsAt) <= 60)
    .sort((a, b) => a.rank - b.rank || a.when - b.when || a.c.id.localeCompare(b.c.id));
  const lim = lineLimit(kind, 1);
  const lines: Line[] = [];
  for (const r of rows) {
    if (lines.length >= 3) break;
    const who = r.c.owner === 'self' ? 'You' : firstName(people.get(r.c.personId!)!.name);
    const suffix = r.done ? ` (done ${shortDate(r.c.doneAt!)})` : r.overdue ? ` (due ${shortDate(r.c.due!)})` : '';
    const body = fitText(r.c.text.trim(), {
      words: lim.words - wordCount(who) - wordCount(suffix),
      chars: lim.chars - who.length - 2 - suffix.length,
    });
    if (body.trimmed) bump(ctx, 'trimmed');
    const l = claim(ctx, kind, 1, `${who}: ${body.text}${suffix}`, [r.c.sourceId], { tone: r.done ? 'done' : r.overdue ? 'overdue' : 'open', lim });
    if (l) lines.push(l);
  }
  return lines;
}

export function timelineBlock(ctx: Ctx, commitments: Line[]): Block | null {
  const { p, pb, fr } = ctx;
  if (fr.stage !== 'followup') return null;
  const events: TimelineEvent[] = [];
  for (const t of fr.priorTouches) {
    const srcs = validSources(ctx, [t.sourceId]);
    if (!srcs.length || !t.summary?.trim()) continue;
    events.push({ date: t.date, kind: t.kind, label: fit(ctx, t.summary, LIMITS.event), memory: isMemory(ctx, srcs), sourceIds: srcs });
  }
  const recent = events.slice(-6);
  if (recent.length < 2) return null;
  recent.push({ date: p.meeting.startsAt, kind: 'today', label: 'Today', memory: false, sourceIds: [] });
  return {
    id: 'timeline', kind: 'timeline', zone: 'visual', slot: 'timeline', priority: pb.priority.timeline,
    title: 'Relationship timeline', lines: commitments, events: recent,
  };
}

// ---------- run of show ----------

function selfFact(ctx: Ctx, topic: FactTopic): Fact | undefined {
  return ctx.facts
    .filter(f => f.subject.kind === 'self' && f.topic === topic && !ctx.usedFacts.has(f.id) && (!f.meetingTypes || f.meetingTypes.includes(ctx.fr.type)))
    .sort((a, b) => (+!!b.meetingTypes - +!!a.meetingTypes) || b.confidence - a.confidence || a.id.localeCompare(b.id))[0];
}

function opener(ctx: Ctx, infos: NumberInfo[]): Line | null {
  const kind: BlockKind = 'keynotes';
  if (ctx.fr.stage === 'followup') {
    // Open with progress worth mentioning: a move of 2% or more in the right direction.
    const moved = infos
      .filter(n => n.disc && !n.worse && Math.abs(pctChange(n.disc.value, n.latest.value) ?? 0) >= 2)
      .map(n => ({ n, pct: pctChange(n.disc!.value, n.latest.value)! }))
      .sort((a, b) => (+b.n.relevant - +a.n.relevant) || a.n.index - b.n.index)[0];
    if (moved) {
      const { n, pct } = moved;
      const l = claim(ctx, kind, 0, `${n.m.label} ${n.latest.value > n.disc!.value ? 'up' : 'down'} ${Math.abs(pct)}% since ${shortDate(n.disc!.date)}`,
        [n.latest.sourceId, n.disc!.sourceId], { label: 'Open with' });
      if (l) return l;
    }
  }
  const f = selfFact(ctx, 'opener');
  const l = f && factLine(ctx, kind, 0, f, { label: 'Open with' });
  return l || suggestion(ctx, kind, ctx.intel?.brief?.opener, { label: 'Open with' })
    || gap(ctx, kind, 0, ctx.intel?.brief ? 'how you’ll open' : ctx.pb.openerHint, 'confirm', { label: 'Open with', dedupe: false });
}

// The model's reading, shown as a suggestion for the user to confirm: never a claim, never sourced.
// The user's own data comes first wherever there is any.
function suggestion(ctx: Ctx, kind: BlockKind, text: string | undefined, o: LineOpts): Line | null {
  if (!text?.trim()) return null;
  const r = fitClause(text.trim().replace(/(?<!\.)\.$/, ''), o.lim ?? lineLimit(kind, 0));
  if (r.trimmed) bump(ctx, 'trimmed');
  const l = plain(ctx, kind, 0, r.text, o);
  if (l) l.suggested = true;
  return l;
}

export function keynotes(ctx: Ctx, infos: NumberInfo[]): Block {
  const { p, pb, fr } = ctx;
  const kind: BlockKind = 'keynotes';
  const lines: (Line | null)[] = [];
  if (fr.lastMeeting) {
    const l = claim(ctx, kind, 0, fr.lastMeeting.summary, [fr.lastMeeting.sourceId], { label: 'Where we left off' });
    if (!l) warn(ctx, 'last_meeting_unsourced', 'The last meeting has no usable source, so it is left off', fr.lastMeeting.id);
    lines.push(l);
  }
  const goal = p.meeting.goal?.trim();
  const brief = ctx.intel?.brief;
  if (goal) lines.push(plain(ctx, kind, 0, goal, { label: 'Goal', dedupe: false }));
  else if (brief?.goal.text.trim()) {
    warn(ctx, 'goal_suggested', `Goal suggested from ${brief.goal.basis === 'agreed_next_step' ? 'the agreed next step' : 'what’s known'}; confirm it`);
    lines.push(suggestion(ctx, kind, brief.goal.text, { label: 'Goal', dedupe: false }));
  } else {
    warn(ctx, 'goal_missing', 'No goal set, so the board is more generic');
    lines.push(gap(ctx, kind, 0, pb.goalHint, 'confirm', { label: 'Goal', dedupe: false }));
  }
  // The goal is always shown, so it's never dropped as a repeat, but later lines can't repeat it.
  const goalLine = lines.at(-1);
  if (goalLine && !goalLine.gap) ctx.seenText.add(normalize(goalLine.text));
  lines.push(suggestion(ctx, kind, brief?.decides.find(d => d.trim()), { label: 'What decides it' }));
  lines.push(opener(ctx, infos));
  const ask = selfFact(ctx, 'ask');
  lines.push((ask && factLine(ctx, kind, 0, ask, { label: 'Ask' }))
    || suggestion(ctx, kind, brief?.ask, { label: 'Ask' })
    || gap(ctx, kind, 0, brief ? 'the next step you’ll ask for' : pb.askHint, 'confirm', { label: 'Ask', dedupe: false }));
  return {
    id: 'keynotes', kind, zone: 'run', slot: 'keynotes', priority: pb.priority.keynotes, required: true, color: 'mint',
    title: 'Key notes', lines: lines.filter((l): l is Line => !!l),
  };
}

// ---------- quick notes ----------

const TOPIC_TITLES: Record<FactTopic, string> = {
  role: 'Their role', background: 'Background', connection: 'How you’re connected', interest: 'What they care about',
  quote: 'In their words', company: 'About them', news: 'In the news', fund: 'Their fund', portfolio: 'Portfolio',
  pain: 'Their pain', tools: 'What they use today', decision: 'Who decides', opener: 'Opener', ask: 'The ask',
  proof: 'Proof point', avoid: 'Don’t repeat',
};
// The same topics, when the fact is about the user's own side.
const SELF_TITLES: Partial<Record<FactTopic, string>> = { fund: 'Your fund', portfolio: 'Your portfolio', company: 'About you', news: 'Your news' };

interface NoteCand { key: string; rel?: string; title: string; color: Block['color']; build: () => Line[] }

export function noteBlocks(ctx: Ctx, infos: NumberInfo[], promises: Line[], shownMetrics: Set<string>): Block[] {
  const { p, pb, fr } = ctx;
  const kind: BlockKind = 'note';
  const start = ms(p.meeting.startsAt);
  const one = (l: Line | null) => (l ? [l] : []);

  const objection = (o: (typeof p.objections)[number]): NoteCand => ({
    key: `obj:${o.id}`, rel: `o:${o.id}`, title: o.text, color: 'rose',
    build: () => {
      const a = o.answer?.trim() ? claim(ctx, kind, 0, o.answer, o.sourceIds) : null;
      return one(a ?? gap(ctx, kind, 0, 'your answer to this', 'confirm', { dedupe: false }));
    },
  });
  const fromFact = (f: Fact, title: string, color: Block['color']): NoteCand => ({
    key: `fact:${f.id}`, rel: f.id, title, color, build: () => one(factLine(ctx, kind, 0, f)),
  });

  const worse: NoteCand[] = infos.filter(n => n.worse && n.disc)
    .sort((a, b) => (+shownMetrics.has(b.m.id) - +shownMetrics.has(a.m.id)) || a.index - b.index)
    .map(n => {
    warn(ctx, 'metric_worse', `${n.m.label} is worse than when you last shared it`, n.m.id);
    // Worse can mean up (burn, churn) or down (revenue), so say which way it actually moved.
    const dir = n.latest.value > n.disc!.value ? 'up' : 'down';
    return {
      key: `worse:${n.m.id}`, title: `${n.m.label} is ${dir}`, color: 'rose',
      build: () => one(claim(ctx, kind, 0, `${n.m.label} was ${fmtValue(n.disc!.value, n.m.prefix, n.m.suffix)} on ${shortDate(n.disc!.date)}. Have the reason ready.`,
        [n.latest.sourceId, n.disc!.sourceId])),
    };
  });
  const promise: NoteCand[] = promises.length ? [{ key: 'promises', title: 'Promises', color: 'yellow', build: () => promises }] : [];
  const raised = p.objections
    .filter(o => o.raisedBy && fr.resolvedIds.has(o.raisedBy) && !o.resolved && (!o.raisedAt || (isDate(o.raisedAt) && ms(o.raisedAt) < start)))
    .map(objection);
  const library = p.objections
    .filter(o => !o.raisedBy && !o.resolved && (fr.type === 'other' || o.meetingTypes.includes(fr.type)))
    .map(objection);
  const avoid = ctx.facts
    .filter(f => f.topic === 'avoid' && (f.subject.kind === 'self' || (f.subject.kind === 'person' && fr.resolvedIds.has(f.subject.id))))
    .map(f => fromFact(f, 'Don’t repeat', 'yellow'));
  const companies = new Set(fr.attendees.filter(a => a.resolved).map(a => a.companyId).filter(Boolean));
  const since = fr.lastMeeting ? ms(fr.lastMeeting.date) : -Infinity;
  const news = ctx.facts
    .filter(f => f.topic === 'news' && f.subject.kind === 'company' && companies.has(f.subject.id) && ms(f.date!) > since)
    .sort((a, b) => ms(b.date!) - ms(a.date!) || a.id.localeCompare(b.id))
    .map(f => fromFact(f, fr.stage === 'first' ? 'In the news' : 'New since last call', 'sky'));
  const proof = ctx.facts
    .filter(f => f.subject.kind === 'self' && f.topic === 'proof' && (!f.meetingTypes || f.meetingTypes.includes(fr.type)))
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
    .map(f => fromFact(f, 'Proof point', 'mint'));

  // Facts the model rated must-have that have no other slot get a note of their own,
  // e.g. an investor's portfolio company that competes with the startup they're meeting.
  const placed = new Set([...news, ...proof, ...avoid].map(c => c.rel));
  const mustHave = ctx.intel ? ctx.facts
    .filter(f => relOf(ctx, f.id) === 3 && !placed.has(f.id) && !ctx.usedFacts.has(f.id))
    .map(f => fromFact(f, (f.subject.kind === 'self' && SELF_TITLES[f.topic]) || TOPIC_TITLES[f.topic], f.topic === 'portfolio' || f.topic === 'decision' ? 'rose' : 'sky')) : [];
  const soft = [...mustHave, ...(fr.stage === 'first' ? [...library, ...proof, ...news, ...avoid] : [...avoid, ...news, ...library, ...proof])];
  // Bad news, promises and objections they raised always lead; the model can't push them off.
  // The rest follow the model's ranking when there is one, and anything it scored 0 is left off.
  const ranked = ctx.intel
    ? soft.filter(c => relOf(ctx, c.rel!) !== 0).map((c, i) => ({ c, i, r: relOf(ctx, c.rel!) ?? 1.5 })).sort((a, b) => b.r - a.r || a.i - b.i).map(x => x.c)
    : soft;
  const ordered = [...worse, ...promise, ...(fr.stage === 'first' ? [] : raised), ...ranked];

  const blocks: Block[] = [];
  const titles = new Set<string>();
  for (const c of ordered) {
    if (blocks.length >= pb.notes) break;
    const title = fit(ctx, c.title, LIMITS.title);
    if (titles.has(normalize(title))) continue;
    const lines = c.build();
    if (!lines.length) continue;
    titles.add(normalize(title));
    const why = c.rel ? whyOf(ctx, c.rel) : undefined;
    blocks.push({
      id: `note:${c.key}`, kind, zone: 'notes', slot: 'note',
      priority: pb.priority.note + blocks.length * pb.step, color: c.color, title, lines, ...(why ? { why } : {}),
    });
  }
  return blocks;
}

// ---------- questions ----------

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export function questionsBlock(ctx: Ctx): Block | null {
  const { p, pb, fr } = ctx;
  const kind: BlockKind = 'questions';
  const now = ms(p.now), start = ms(p.meeting.startsAt);
  const lines: Line[] = [];
  const full = () => lines.length >= pb.questions;
  const push = (l: Line | null) => { if (l) lines.push(l); };

  // Promises they haven't kept come first: they're the easiest thing to forget to ask.
  const owed = p.commitments
    .filter(c => c.owner === 'them' && c.personId && fr.resolvedIds.has(c.personId) && isDate(c.madeAt) && ms(c.madeAt) < start &&
      !(isDate(c.doneAt) && ms(c.doneAt) <= now) && isDate(c.due) && ms(c.due) < now && c.text?.trim())
    .sort((a, b) => ms(a.due!) - ms(b.due!) || a.id.localeCompare(b.id));
  for (const c of owed) { if (full()) break; push(plain(ctx, kind, 0, `Any update on ${lowerFirst(c.text.trim().replace(/[.?!]+$/, ''))}?`, { sourceIds: [c.sourceId] })); }

  // What research couldn't answer, saved questions, and (with a model) questions it wrote for
  // this meeting's unknowns, ranked together. Without a model: research gaps, then saved questions.
  type Q = { text: string; gap?: boolean; r: number; i: number };
  const qs: Q[] = [];
  // The playbook's research questions assume a side (a founder asking an investor). Once a model
  // has read the meeting, they're kept only if it scored them.
  pb.research.forEach((r, i) => { if (!knows(ctx, r.topic)) qs.push({ text: r.ask, gap: true, r: relOf(ctx, `gap:${r.topic}`) ?? (ctx.intel ? 0 : 2), i }); });
  p.questions
    .filter(q => (fr.type === 'other' || q.meetingTypes.includes(fr.type)) && (!q.stage || q.stage === fr.stage) && q.text?.trim())
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .forEach((q, i) => qs.push({ text: q.text, r: relOf(ctx, `q:${q.id}`) ?? 1.5, i: 100 + i }));
  (ctx.intel?.questions ?? []).forEach((q, i) => { if (q.text.trim().endsWith('?')) qs.push({ text: q.text, gap: true, r: 2.5, i: 50 + i }); });
  const ordered = ctx.intel ? qs.filter(q => q.r > 0).sort((a, b) => b.r - a.r || a.i - b.i) : qs.sort((a, b) => a.i - b.i);
  for (const q of ordered) { if (full()) break; push(plain(ctx, kind, 0, q.text, q.gap ? { gap: 'ask' } : {})); }

  if (!lines.length) return null;
  return { id: 'questions', kind, zone: 'run', slot: 'questions', priority: pb.priority.questions, title: 'Questions to ask', lines };
}
