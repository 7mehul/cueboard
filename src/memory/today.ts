import { firstName, fmtValue, isDate, ms, pctChange } from '../text.ts';
import type { MeetingRecord, Memory } from './types.ts';
import { unrecordedMeetings } from './calendar.ts';

// What the Today view shows: the meetings ahead, whether each board is ready, what changed since
// you last spoke, and what's owed. Worked out from memory alone; the page only draws it.

export type MeetingStatus = 'ready' | 'not_prepped' | 'needs_notes' | 'add_notes';
export interface TodayMeeting {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  people: string[];
  stage: 'first' | 'followup';
  meetingNo: number;
  status: MeetingStatus;
  goal?: string;
  since?: string;          // "MRR $38.5k, up from the $33k you told Maya"
  owed: { text: string; overdue: boolean }[];
  notesFor?: string;       // the earlier meeting whose notes aren't in yet
  joinUrl?: string;        // the call link, from the calendar
}
export interface TodaySection { key: 'earlier' | 'today' | 'tomorrow' | 'week' | 'later'; label: string; meetings: TodayMeeting[] }
export interface OwedItem { text: string; due?: string; overdue: boolean; theirs: boolean }
export interface TodayModel { sections: TodaySection[]; owed: OwedItem[]; upcoming: number }

const DAY = 86_400_000;
// Days counted in the viewer's own time zone, so "today" means their today. A plain date
// ("2026-10-08") is that day where the viewer is, not midnight in London.
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayOf = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : dayStart(ms(iso));
};

export function todayModel(memory: Memory, now: string, withBoards: string[]): TodayModel {
  const t = ms(now), today = dayStart(t);
  const people = new Map(memory.people.map(p => [p.id, p]));
  const made = new Set(withBoards);
  const end = (m: MeetingRecord) => ms(m.startsAt) + m.durationMin * 60_000;
  // Notes are in when memory holds a call or meeting with these people on its day or just after.
  const hasNotes = (m: MeetingRecord) => memory.touches.some(x =>
    (x.kind === 'meeting' || x.kind === 'call') && x.personIds.some(id => m.attendeeIds.includes(id))
    && dayOf(x.date) >= dayOf(m.startsAt) && dayOf(x.date) < dayOf(m.startsAt) + 3 * DAY);

  // Meetings the calendar says happened count, even before their notes are in.
  const touches = [...memory.touches, ...unrecordedMeetings(memory, t)];
  const describe = (m: MeetingRecord): TodayMeeting => {
    const coming = new Set(m.attendeeIds);
    const start = ms(m.startsAt);
    const prior = touches.filter(x => (x.kind === 'meeting' || x.kind === 'call') && dayOf(x.date) < dayOf(m.startsAt) && x.personIds.some(id => coming.has(id)));
    const earlier = memory.meetings
      .filter(o => o.id !== m.id && !o.cancelled && end(o) <= t && ms(o.startsAt) < start && o.attendeeIds.some(id => coming.has(id)))
      .sort((a, b) => ms(b.startsAt) - ms(a.startsAt))[0];
    const past = end(m) <= t;
    // A board that's already drafted is ready; it still asks for the last call's notes, if missing.
    const missing = !!earlier && !hasNotes(earlier);
    const status: MeetingStatus = past ? 'add_notes' : made.has(m.id) ? 'ready' : missing ? 'needs_notes' : 'not_prepped';
    return {
      id: m.id, title: m.title, startsAt: m.startsAt, durationMin: m.durationMin,
      people: m.attendeeIds.map(id => people.get(id)?.name).filter((x): x is string => !!x),
      stage: prior.length ? 'followup' : 'first', meetingNo: prior.length + 1, status,
      ...(m.goal ? { goal: m.goal } : {}),
      ...sinceLine(memory, m, t),
      owed: owedWith(memory, m, t),
      ...(!past && missing ? { notesFor: earlier!.id } : {}),
      ...(m.calendar?.joinUrl ? { joinUrl: m.calendar.joinUrl } : {}),
    };
  };

  const buckets: Record<TodaySection['key'], TodayMeeting[]> = { earlier: [], today: [], tomorrow: [], week: [], later: [] };
  for (const m of memory.meetings.filter(x => !x.cancelled).sort((a, b) => ms(a.startsAt) - ms(b.startsAt))) {
    const day = dayOf(m.startsAt);
    if (end(m) <= t) {
      // Recent meetings only come back to ask what happened.
      if (t - end(m) < 3 * DAY && !hasNotes(m)) buckets.earlier.push(describe(m));
      continue;
    }
    const key = day === today ? 'today' : day === today + DAY ? 'tomorrow' : day < today + 7 * DAY ? 'week' : 'later';
    if (key !== 'later' || buckets.later.length < 5) buckets[key].push(describe(m));
  }
  const LABEL: Record<TodaySection['key'], string> = { earlier: 'Waiting for your notes', today: 'Today', tomorrow: 'Tomorrow', week: 'Later this week', later: 'Coming up' };
  const order: TodaySection['key'][] = ['earlier', 'today', 'tomorrow', 'week', 'later'];
  return {
    sections: order.filter(k => buckets[k].length).map(k => ({ key: k, label: LABEL[k], meetings: buckets[k] })),
    owed: owedSoon(memory, t),
    upcoming: buckets.today.length + buckets.tomorrow.length + buckets.week.length + buckets.later.length,
  };
}

// The biggest change in a number since you told one of these people about it.
function sinceLine(memory: Memory, m: MeetingRecord, t: number): { since?: string } {
  const people = new Map(memory.people.map(p => [p.id, p]));
  let best: { pct: number; text: string } | null = null;
  for (const d of memory.disclosures) {
    if (!m.attendeeIds.includes(d.personId)) continue;
    const metric = memory.metrics.find(x => x.id === d.metricId);
    const told = memory.disclosures.filter(x => x.metricId === d.metricId && x.personId === d.personId).sort((a, b) => ms(b.date) - ms(a.date))[0];
    if (!metric || told !== d) continue;
    const latest = metric.points.filter(p => ms(p.date) <= t).sort((a, b) => ms(b.date) - ms(a.date))[0];
    if (!latest || ms(latest.date) <= ms(d.date)) continue;
    const pct = pctChange(d.value, latest.value);
    if (pct === null || Math.abs(pct) < 2) continue;
    const fmt = (v: number) => fmtValue(v, metric.prefix, metric.suffix);
    const text = `${metric.label} ${fmt(latest.value)}, ${latest.value > d.value ? 'up' : 'down'} from the ${fmt(d.value)} you told ${firstName(people.get(d.personId)?.name ?? 'them')}`;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { pct, text };
  }
  return best ? { since: best.text } : {};
}

function owedWith(memory: Memory, m: MeetingRecord, t: number): TodayMeeting['owed'] {
  const people = new Map(memory.people.map(p => [p.id, p]));
  return memory.commitments
    .filter(c => !c.doneAt && c.personId && m.attendeeIds.includes(c.personId))
    .map(c => {
      const who = firstName(people.get(c.personId!)?.name ?? 'them');
      const overdue = isDate(c.due) && dayOf(c.due) < dayStart(t);
      const lower = c.text.charAt(0).toLowerCase() + c.text.slice(1);
      return { text: c.owner === 'self' ? `You owe ${who}: ${lower}` : `${who} owes you: ${lower}`, overdue, due: c.due };
    })
    .sort((a, b) => +b.overdue - +a.overdue)
    .slice(0, 2)
    .map(({ text, overdue }) => ({ text, overdue }));
}

function owedSoon(memory: Memory, t: number): OwedItem[] {
  const people = new Map(memory.people.map(p => [p.id, p]));
  const soon = dayStart(t) + 7 * DAY;
  return memory.commitments
    .filter(c => !c.doneAt && c.personId && (c.owner === 'them' || !c.due || dayOf(c.due) < soon))
    .map(c => {
      const who = firstName(people.get(c.personId!)?.name ?? 'them');
      return {
        text: c.owner === 'self' ? `You → ${who}: ${c.text}` : `${who} → you: ${c.text}`,
        ...(c.due ? { due: c.due } : {}),
        overdue: isDate(c.due) && dayOf(c.due) < dayStart(t),
        theirs: c.owner === 'them',
      };
    })
    .sort((a, b) => +b.overdue - +a.overdue || +a.theirs - +b.theirs || (a.due ? ms(a.due) : Infinity) - (b.due ? ms(b.due) : Infinity))
    .slice(0, 6);
}
