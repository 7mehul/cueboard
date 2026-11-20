import type { Board, Packet, Placement } from './types.ts';
import { MEMORY_KINDS, PHASE_SLOTS } from './types.ts';
import { MIN_CONFIDENCE, NEWS_MAX_AGE_DAYS } from './facts.ts';
import { blockBudget } from './playbooks.ts';
import { LIMITS, daysBetween, fits, fmtValue, isDate, lineLimit, ms, normalize, titleLimit } from './text.ts';

// The rules every board must keep, checked from the packet on their own terms rather than
// by re-running the engine's code. Used by unit tests, the scale run, and later on model output.

export interface Issue { code: string; message: string; ref?: string }

export function checkBoard(board: Board, p: Packet, opts: { maxBlocks?: number } = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, message: string, ref?: string) => { issues.push({ code, message, ref }); };

  const sources = new Map(p.sources.map(s => [s.id, s]));
  const facts = new Map(p.facts.map(f => [f.id, f]));
  const people = new Map(p.people.map(x => [x.id, x]));
  const start = ms(p.meeting.startsAt), now = ms(p.now);
  const okSource = (id: string) => { const s = sources.get(id); return !!s && (!s.ownerId || s.ownerId === p.userId); };
  const isMem = (id: string) => MEMORY_KINDS.includes(sources.get(id)?.kind as never);
  const attendees = [...new Set(p.meeting.attendeeIds)].map(id => people.get(id)).filter(x => !!x);
  const resolved = new Set(attendees.filter(a => a.resolved).map(a => a.id));

  // ---------- structure ----------
  const ids = board.blocks.map(b => b.id);
  if (new Set(ids).size !== ids.length) add('duplicate_block_id', 'Two blocks share an id');
  if (board.blocks.filter(b => b.kind === 'header').length !== 1) add('header_count', 'A board has exactly one header');
  if (!board.blocks.some(b => b.kind === 'keynotes')) add('missing_keynotes', 'Every board has key notes');
  if (attendees.length && !board.blocks.some(b => b.kind === 'person')) add('missing_person', 'The first attendee has no card');
  const max = opts.maxBlocks ?? blockBudget(p.meeting.durationMin);
  const used = board.blocks.filter(b => b.kind !== 'header' && b.kind !== 'phase').length;
  if (used > max) add('over_block_budget', `${used} blocks for a ${p.meeting.durationMin}-minute meeting (max ${max})`);
  for (const b of board.blocks) {
    if (!b.lines.length && !b.chart?.points.length && !b.events?.length && b.kind !== 'phase') add('empty_block', `${b.id} has nothing in it`, b.id);
    if (!fits(b.title, titleLimit(b.kind))) add('title_over_limit', `${b.id}: “${b.title}”`, b.id);
  }

  // ---------- lines ----------
  const shownFacts: string[] = [];
  const seenText = new Set<string>();
  for (const b of board.blocks) {
    b.lines.forEach((l, i) => {
      const ref = `${b.id}[${i}]`;
      if (!fits(l.text, lineLimit(b.kind, i))) add('line_over_limit', `${ref}: “${l.text}”`, ref);
      if (l.claim && (!l.sourceIds.length || !l.sourceIds.every(okSource))) add('unsourced_claim', `${ref}: “${l.text}”`, ref);
      for (const id of l.sourceIds) {
        const s = sources.get(id);
        if (!s) add('unknown_source', `${ref} cites ${id}`, ref);
        else if (s.ownerId && s.ownerId !== p.userId) add('private_leak', `${ref} cites another user’s ${s.kind}`, ref);
      }
      const mem = l.sourceIds.some(isMem);
      if (!!l.memory !== mem) add('memory_flag_wrong', `${ref} memory=${!!l.memory} but sources say ${mem}`, ref);
      if (l.gap && l.gap !== 'ask' && !/^\[.*\]$/.test(l.text)) add('gap_not_bracketed', `${ref}: “${l.text}”`, ref);
      if (l.gap && l.claim) add('gap_claim', `${ref} is both unknown and a claim`, ref);
      for (const fid of l.factIds ?? []) {
        shownFacts.push(fid);
        const f = facts.get(fid);
        if (!f) { add('unknown_fact', `${ref} cites fact ${fid}`, ref); continue; }
        if (f.visibleTo && f.visibleTo !== p.userId) add('private_leak', `${ref} shows another user’s fact`, ref);
        if (f.subject.kind === 'person' && !people.get(f.subject.id)?.resolved) add('unresolved_person_fact', `${ref} is about someone unconfirmed`, ref);
        if (!(f.confidence >= MIN_CONFIDENCE)) add('low_confidence_shown', `${ref} confidence ${f.confidence}`, ref);
        if (isDate(f.date) && ms(f.date) > now) add('future_fact', `${ref} is dated ${f.date}`, ref);
        if (f.topic === 'news' && (!isDate(f.date) || daysBetween(f.date, p.meeting.startsAt) > NEWS_MAX_AGE_DAYS)) add('stale_news', `${ref} news from ${f.date}`, ref);
        if (!l.claim) add('fact_not_claim', `${ref} shows a fact without marking it a claim`, ref);
      }
      const textual = b.kind === 'person' || b.kind === 'keynotes' || b.kind === 'phase' || b.kind === 'questions' || b.kind === 'note' || b.kind === 'timeline';
      if (textual && !l.gap) {
        const k = normalize(l.text);
        if (seenText.has(k)) add('duplicate_line', `“${l.text}” appears twice`, ref);
        seenText.add(k);
      }
    });
  }
  const counts = new Map<string, number>();
  for (const f of shownFacts) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, n] of counts) if (n > 1) add('fact_reused', `Fact ${f} shown ${n} times`, f);
  const byKey = new Map<string, Set<string>>();
  for (const fid of new Set(shownFacts)) {
    const f = facts.get(fid);
    if (!f?.key) continue;
    const k = `${f.subject.kind}:${f.subject.id}:${f.key}`;
    const vals = byKey.get(k) ?? new Set<string>();
    vals.add(normalize(f.value ?? f.text));
    byKey.set(k, vals);
  }
  for (const [k, vals] of byKey) if (vals.size > 1) add('conflict_shown', `Conflicting facts shown for ${k}`, k);

  // ---------- people ----------
  for (const b of board.blocks.filter(b => b.kind === 'person')) {
    const person = people.get(b.subjectId ?? '');
    if (!person) { add('person_unknown', `${b.id} is not an attendee`, b.id); continue; }
    if (!person.resolved && !b.lines.some(l => l.gap === 'confirm')) add('unresolved_not_flagged', `${person.name} isn’t confirmed and the card doesn’t say so`, b.id);
  }

  // ---------- stage ----------
  const priorMeetings = p.touches
    .filter(t => (t.kind === 'meeting' || t.kind === 'call') && isDate(t.date) && ms(t.date) < start && t.personIds.some(id => resolved.has(id)))
    .sort((a, b) => ms(a.date) - ms(b.date) || a.id.localeCompare(b.id));
  const expected = priorMeetings.length ? 'followup' : 'first';
  if (board.stage !== expected) add('stage_wrong', `Board is ${board.stage}, history says ${expected}`);
  const last = priorMeetings.at(-1);
  const keyBlock = board.blocks.find(b => b.kind === 'keynotes');
  if (board.stage === 'followup' && last && okSource(last.sourceId) && last.summary?.trim() &&
      !keyBlock?.lines.some(l => l.label === 'Where we left off')) add('missing_left_off', 'A follow-up must say where you left off');
  if (keyBlock && !keyBlock.lines.some(l => l.label === 'Goal')) add('missing_goal_line', 'Key notes must carry the goal, or a gap for it');

  // ---------- the plan ----------
  // Three or four parts, opening first and closing last, covering the meeting minute for minute.
  const phases = board.blocks.filter(b => b.kind === 'phase');
  const slots = phases.map(b => b.phase);
  if (phases.length < 3 || phases.length > 4 || slots[0] !== 'open' || slots.at(-1) !== 'close' ||
      new Set(slots).size !== slots.length || !slots.every(x => (PHASE_SLOTS as unknown[]).includes(x))) add('plan_shape', `The plan runs ${slots.join(' → ') || 'nowhere'}`);
  let clock = 0;
  for (const b of phases) {
    if (!b.minutes || b.minutes.from !== clock || !(b.minutes.to > b.minutes.from)) add('plan_minutes', `${b.id} runs ${b.minutes?.from}–${b.minutes?.to}, after minute ${clock}`, b.id);
    clock = b.minutes?.to ?? clock;
  }
  if (phases.length && clock !== Math.max(phases.length, Math.round(p.meeting.durationMin))) add('plan_minutes', `The plan ends at minute ${clock} of ${p.meeting.durationMin}`);
  if (!phases.at(-1)?.lines.some(l => l.label === 'Ask')) add('missing_ask_line', 'The plan must end on the ask, or a gap for it');
  for (const b of board.blocks) if (b.kind !== 'phase' && b.phase && !(PHASE_SLOTS as unknown[]).includes(b.phase)) add('plan_shape', `${b.id} sits under an unknown part`, b.id);

  // ---------- numbers ----------
  for (const b of board.blocks.filter(b => b.kind === 'number')) {
    const m = p.metrics.find(x => x.id === b.metricId);
    if (!m) { add('number_unknown', `${b.id} has no metric`, b.id); continue; }
    const pts = m.points.filter(pt => isDate(pt.date) && ms(pt.date) <= now && Number.isFinite(pt.value) && okSource(pt.sourceId))
      .sort((a, b) => ms(a.date) - ms(b.date));
    const latest = pts.at(-1);
    if (!latest) { add('number_unknown', `${b.id} shows a number with no valid data`, b.id); continue; }
    const expectV = fmtValue(latest.value, m.prefix, m.suffix);
    if (b.lines[0]?.text !== expectV) add('number_wrong', `${b.id} shows ${b.lines[0]?.text}, latest is ${expectV}`, b.id);
    const own = !m.owner || m.owner.kind === 'self';
    if (!own) {
      // The other side's number: "was X" must be their value as of the last meeting.
      const lastMeet = priorMeetings.at(-1);
      const before = lastMeet ? pts.filter(pt => ms(pt.date) <= ms(lastMeet.date)).at(-1) : undefined;
      const since = before && before !== latest ? before : undefined;
      const note = b.lines[1];
      if (since && !note?.text.startsWith(`was ${fmtValue(since.value, m.prefix, m.suffix)}`)) add('delta_wrong', `${b.id} should start “was ${fmtValue(since.value, m.prefix, m.suffix)}”, got “${note?.text}”`, b.id);
      if (!since && note?.text.startsWith('was ')) add('delta_wrong', `${b.id} claims an earlier value that isn’t on record`, b.id);
      const ownerOk = m.owner!.kind === 'company' ? attendees.some(a => a.resolved && a.companyId === m.owner!.id) : resolved.has(m.owner!.id);
      if (!ownerOk) add('number_unknown', `${b.id} shows someone else’s number in a meeting without them`, b.id);
      continue;
    }
    // The last number you shared. If it's newer than the data on file, no change can be shown honestly.
    const lastShared = p.disclosures
      .filter(d => d.metricId === m.id && resolved.has(d.personId) && isDate(d.date) && ms(d.date) < start &&
        Number.isFinite(d.value) && okSource(d.sourceId))
      .sort((a, b) => ms(a.date) - ms(b.date) || a.personId.localeCompare(b.personId)).at(-1);
    const disc = lastShared && ms(lastShared.date) <= ms(latest.date) ? lastShared : undefined;
    const note = b.lines[1];
    if (disc) {
      const want = `was ${fmtValue(disc.value, m.prefix, m.suffix)}`;
      if (!note?.text.startsWith(want)) add('delta_wrong', `${b.id} should start “${want}”, got “${note?.text}”`, b.id);
      const worse = m.better === 'up' ? latest.value < disc.value : latest.value > disc.value;
      if (worse && note?.tone !== 'bad') add('bad_news_hidden', `${m.label} got worse since it was shared but isn’t marked`, b.id);
      if (worse && !board.blocks.some(x => x.id === `note:worse:${m.id}`) && !board.budget.dropped.includes(`note:worse:${m.id}`)) {
        add('bad_news_hidden', `${m.label} got worse and no note prepares for it`, b.id);
      }
    } else if (note?.text.startsWith('was ')) add('delta_wrong', `${b.id} claims a shared value that isn’t on record`, b.id);
  }

  // Words like "up" and "down" must match what the numbers did.
  const metricMoves = (label: string) => {
    const m = p.metrics.find(x => x.label === label);
    if (!m) return null;
    const pts = m.points.filter(pt => isDate(pt.date) && ms(pt.date) <= now && Number.isFinite(pt.value) && okSource(pt.sourceId))
      .sort((a, b) => ms(a.date) - ms(b.date));
    const shared = p.disclosures.filter(d => d.metricId === m.id && resolved.has(d.personId) && isDate(d.date) && ms(d.date) < start && okSource(d.sourceId))
      .sort((a, b) => ms(a.date) - ms(b.date) || a.personId.localeCompare(b.personId)).at(-1);
    const latest = pts.at(-1);
    return latest && shared ? Math.sign(latest.value - shared.value) : null;
  };
  for (const b of board.blocks) {
    const said = b.id.startsWith('note:worse:') ? /^(.+) is (up|down)$/.exec(b.title) : null;
    const opener = b.kind === 'phase' ? b.lines.find(l => l.label === 'Open with' && !l.gap) : undefined;
    const said2 = opener ? /^(.+) (up|down) \d+% since /.exec(opener.text) : null;
    for (const m of [said, said2]) {
      if (!m) continue;
      const moved = metricMoves(m[1]);
      if (moved !== null && moved !== (m[2] === 'up' ? 1 : -1)) add('direction_wrong', `“${m[0]}” but the number went the other way`, b.id);
    }
  }

  // ---------- visuals ----------
  for (const b of board.blocks) {
    if (b.kind === 'trend') {
      const m = p.metrics.find(x => x.id === b.metricId);
      const n = b.chart?.points.length ?? 0;
      if (!m || n < 3 || n > 12) add('chart_rule', `${b.id} has ${n} points; a line needs 3 to 12`, b.id);
      if (m && b.chart) {
        const valid = new Set(m.points.filter(pt => isDate(pt.date) && ms(pt.date) <= now && okSource(pt.sourceId)).map(pt => pt.value));
        if (b.chart.points.some(pt => !valid.has(pt.value))) add('chart_data_mismatch', `${b.id} draws a value that isn’t sourced data`, b.id);
      }
    }
    if (b.kind === 'bars') {
      const n = b.chart?.points.length ?? 0;
      if (n < 2 || n > 6) add('chart_rule', `${b.id} has ${n} bars; needs 2 to 6`, b.id);
    }
    if (b.chart && !b.chart.sourceIds.every(okSource)) add('unsourced_claim', `${b.id} chart has a bad source`, b.id);
    if (b.kind === 'timeline') {
      if (board.stage !== 'followup') add('timeline_in_first', 'A first meeting has no relationship to draw');
      const ev = b.events ?? [];
      const past = ev.filter(e => e.kind !== 'today');
      if (past.length < 2 || past.length > 6) add('chart_rule', `Timeline has ${past.length} events; needs 2 to 6`, b.id);
      if (ev.at(-1)?.kind !== 'today') add('timeline_no_today', 'The timeline ends at today', b.id);
      for (let i = 1; i < past.length; i++) if (ms(past[i].date) < ms(past[i - 1].date)) add('timeline_order', 'Events out of order', b.id);
      for (const e of past) {
        if (!e.sourceIds.length || !e.sourceIds.every(okSource)) add('unsourced_claim', `Timeline event “${e.label}” has no valid source`, b.id);
        if (ms(e.date) >= start) add('timeline_future', `Event “${e.label}” isn’t before the meeting`, b.id);
        if (!fits(e.label, LIMITS.event)) add('line_over_limit', `Timeline label “${e.label}”`, b.id);
      }
    }
  }

  // ---------- layout ----------
  const placed = new Map<string, Placement>();
  for (const pl of board.canvas) {
    if (placed.has(pl.id)) add('layout_duplicate', `${pl.id} placed twice`, pl.id);
    placed.set(pl.id, pl);
    if (pl.x < 0 || pl.y < 0 || !(pl.w > 0) || !(pl.h > 0)) add('layout_bounds', `${pl.id} at ${pl.x},${pl.y} ${pl.w}×${pl.h}`, pl.id);
  }
  for (const id of ids) if (!placed.has(id)) add('layout_missing', `${id} has no position`, id);
  for (const id of placed.keys()) if (!ids.includes(id)) add('layout_orphan', `${id} placed but not on the board`, id);
  const pls = [...placed.values()];
  for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++) {
    const a = pls[i], c = pls[j];
    if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) add('layout_overlap', `${a.id} overlaps ${c.id}`, a.id);
  }
  if (board.rail.length !== ids.length || new Set(board.rail).size !== ids.length || !board.rail.every(id => ids.includes(id))) {
    add('rail_wrong', 'The rail must list every block once');
  }
  if (board.rail[0] !== 'header' || board.rail[1] !== 'keynotes') add('rail_order', 'The rail starts with the header, then key notes');

  const gapTexts = [...new Set(board.blocks.flatMap(b => b.lines.filter(l => l.gap).map(l => l.text)))];
  if (gapTexts.length !== board.gaps.length || gapTexts.some(g => !board.gaps.includes(g))) add('gaps_list_wrong', 'board.gaps must list every gap on the board');

  return issues;
}
