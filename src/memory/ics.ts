import ICAL from 'ical.js';
import type { CalendarEvent, CalendarPerson } from './calendar.ts';

// A calendar in iCalendar form, the way every calendar app shares one: a private feed link
// (Google's "secret address", Outlook's published calendar, iCloud) or an invite file. Turned
// into the same events Google's API gives, so the rest of Cueboard can't tell them apart.
// Repeating meetings become one event per occurrence, with moved and cancelled ones applied.

// `complete` is false when the window held more events than are returned; the caller then knows
// a meeting missing from the list may simply not have been read.
export interface IcsCalendar { email?: string; events: CalendarEvent[]; complete: boolean }
const MAX_EVENTS = 3000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PARTSTAT: Record<string, CalendarPerson['response']> = { ACCEPTED: 'accepted', DECLINED: 'declined', TENTATIVE: 'tentative', 'NEEDS-ACTION': 'needsAction' };
const STATUS: Record<string, CalendarEvent['status']> = { CONFIRMED: 'confirmed', TENTATIVE: 'tentative', CANCELLED: 'cancelled' };
const JOIN = /https:\/\/(?:[\w-]+\.)*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|around\.co)\/[^\s<>"')\]]+/i;

// Outlook names its zones the Windows way, and sometimes leaves out their definitions.
const WINDOWS: Record<string, string> = {
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix', 'Pacific Standard Time': 'America/Los_Angeles', 'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax', 'E. South America Standard Time': 'America/Sao_Paulo',
  'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik', 'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kyiv', 'GTB Standard Time': 'Europe/Bucharest',
  'Israel Standard Time': 'Asia/Jerusalem', 'Arabian Standard Time': 'Asia/Dubai', 'India Standard Time': 'Asia/Kolkata',
  'Singapore Standard Time': 'Asia/Singapore', 'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul', 'AUS Eastern Standard Time': 'Australia/Sydney', 'New Zealand Standard Time': 'Pacific/Auckland',
  UTC: 'UTC', 'Coordinated Universal Time': 'UTC',
};

// Wall-clock time in a named zone, as an instant. Two passes settle the offset around a DST change.
function offsetAt(t: number, zone: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
}
// Around a clock change the first guess at the offset can come from the wrong side, so both are
// tried; a time that doesn't exist (2:30 on the spring-forward night) moves forward, as clocks do.
function zoned(t: ICAL.Time, zone: string): number | null {
  try {
    const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
    const a = wall - offsetAt(wall, zone), b = wall - offsetAt(a, zone);
    const exact = [b, a].find(x => x + offsetAt(x, zone) === wall);
    return exact ?? Math.max(a, b);
  } catch { return null; } // not a zone this runtime knows
}

// When an occurrence happens. A zone the feed defined, or UTC, ical.js converts itself; a zone it
// only named is looked up; a time with no zone at all is in the calendar's own zone (its
// X-WR-TIMEZONE, or the one the person reading it is in), and only failing both, this machine's.
let floatingZone: string | undefined;
function instant(t: ICAL.Time): number {
  const tz = t.zone?.tzid;
  if (tz && tz !== 'floating') return t.toJSDate().getTime();
  const named = (t as unknown as { timezone?: string }).timezone;
  const zone = named ? WINDOWS[named] ?? named : floatingZone;
  const at = zone ? zoned(t, zone) : null;
  return at ?? t.toJSDate().getTime();
}
const iso = (t: ICAL.Time) => (t.isDate ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : new Date(instant(t)).toISOString());

const mail = (v: unknown) => { const s = String(v ?? '').replace(/^mailto:/i, '').trim().toLowerCase(); return EMAIL.test(s) ? s : null; };

function people(e: ICAL.Event): CalendarPerson[] {
  const out: CalendarPerson[] = [];
  for (const p of e.attendees) {
    const cutype = String(p.getParameter('cutype') ?? 'INDIVIDUAL').toUpperCase();
    if (cutype === 'ROOM' || cutype === 'RESOURCE' || cutype === 'GROUP') continue; // rooms, and mailing lists aren't people
    const email = mail(p.getFirstValue());
    if (!email || out.some(x => x.email === email)) continue;
    const cn = p.getParameter('cn'), ps = PARTSTAT[String(p.getParameter('partstat') ?? '').toUpperCase()];
    out.push({ email, ...(typeof cn === 'string' && cn.trim() && !EMAIL.test(cn.trim()) ? { name: cn.trim().slice(0, 80) } : {}), ...(ps ? { response: ps } : {}) });
  }
  // The organizer is often not on the guest list in the file.
  const org = e.component.getFirstProperty('organizer');
  const oe = org ? mail(org.getFirstValue()) : null;
  if (oe) {
    const has = out.find(x => x.email === oe);
    if (has) has.organizer = true;
    else { const cn = org!.getParameter('cn'); out.push({ email: oe, organizer: true, ...(typeof cn === 'string' && cn.trim() && !EMAIL.test(cn.trim()) ? { name: cn.trim().slice(0, 80) } : {}) }); }
  }
  return out;
}

function joinUrl(e: ICAL.Event): string | undefined {
  const conf = e.component.getFirstPropertyValue('x-google-conference');
  if (typeof conf === 'string' && /^https:\/\//.test(conf)) return conf;
  for (const text of [e.location, e.description]) { const m = text ? JOIN.exec(text) : null; if (m) return m[0]; }
  return e.location && /^https?:\/\//.test(e.location.trim()) ? e.location.trim() : undefined;
}

function toEvent(id: string, item: ICAL.Event, start: ICAL.Time, end: ICAL.Time): CalendarEvent {
  const status = STATUS[String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase()];
  const url = item.component.getFirstPropertyValue('url');
  const join = joinUrl(item);
  return {
    id, title: (item.summary ?? '').slice(0, 200) || 'Meeting', start: iso(start), end: iso(end),
    ...(start.isDate ? { allDay: true } : {}), ...(status ? { status } : {}),
    ...(item.description ? { description: item.description.slice(0, 8000) } : {}),
    ...(item.location ? { location: item.location.slice(0, 300) } : {}),
    ...(join ? { joinUrl: join } : {}), ...(typeof url === 'string' && /^https:\/\//.test(url) ? { url } : {}),
    attendees: people(item),
  };
}

// Everything that happens between two instants. Repeating meetings are stepped through cheaply up
// to the window and worked out properly only inside it, so a weekly meeting that has run for
// years costs little more than one that started last week.
export function parseIcs(text: string, window: { from: string; to: string }, opts: { zone?: string } = {}): IcsCalendar {
  let root: ICAL.Component;
  try { root = new ICAL.Component(ICAL.parse(text)); } catch { throw new Error('That isn’t a calendar file.'); }
  if (root.name !== 'vcalendar') throw new Error('That isn’t a calendar file.');
  // ical.js keeps zones in one registry for the whole process: this feed's zones are this feed's.
  ICAL.TimezoneService.reset();
  try {
    for (const tz of root.getAllSubcomponents('vtimezone')) { try { ICAL.TimezoneService.register(tz); } catch { /* falls back to its name */ } }
    const calZone = root.getFirstPropertyValue('x-wr-timezone');
    floatingZone = [typeof calZone === 'string' ? calZone : undefined, opts.zone].find(z => !!z && validZone(z));
    return read(root, window);
  } finally { ICAL.TimezoneService.reset(); floatingZone = undefined; }
}
const validZone = (z: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };

function read(root: ICAL.Component, window: { from: string; to: string }): IcsCalendar {
  const from = Date.parse(window.from), to = Date.parse(window.to), DAY = 864e5;
  const inWindow = (s: number, e: number) => e > from && s < to;

  // A moved or cancelled occurrence of a repeating meeting is its own VEVENT, tied by UID.
  const byUid = new Map<string, { masters: ICAL.Event[]; moved: ICAL.Event[] }>();
  for (const v of root.getAllSubcomponents('vevent')) {
    try {
      const e = new ICAL.Event(v);
      if (!e.uid || !v.getFirstProperty('dtstart')) continue;
      // Google's feed adds "@google.com" to the event id its API uses; without it, the ids match
      // (repeats too: "<id>_<start in UTC>"), so switching between the two doesn't duplicate meetings.
      const uid = e.uid.replace(/@google\.com$/i, '');
      const g = byUid.get(uid) ?? { masters: [], moved: [] };
      if (e.isRecurrenceException()) g.moved.push(e); else g.masters.push(e);
      byUid.set(uid, g);
    } catch { /* an event ical.js can't read is left out, not the whole calendar */ }
  }

  const events: CalendarEvent[] = [];
  const seen = new Set<string>();
  const add = (id: string, item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (seen.has(id)) return;
    const s = instant(start), e = instant(end);
    if (!inWindow(s, e)) return;
    seen.add(id);
    events.push(toEvent(id, item, start, end));
  };
  for (const [uid, g] of byUid) {
    try {
      // The same UID twice without a recurrence id: two events, not one replacing the other.
      g.masters.forEach((master, n) => {
        const id = n ? `${uid}-${n + 1}` : uid;
        if (n === 0) for (const m of g.moved) { try { master.relateException(m); } catch { /* ignore a broken override */ } }
        if (!master.isRecurring()) { add(id, master, master.startDate, master.endDate ?? master.startDate); return; }
        const it = master.iterator(fastForward(master, from - 2 * DAY));
        for (let next = it.next(), steps = 0; next && steps < 200_000; next = it.next(), steps++) {
          const rough = next.toUnixTime() * 1000; // close enough to know how far from the window it is
          if (rough > to + 2 * DAY) break;
          if (rough < from - 2 * DAY) continue;
          const d = master.getOccurrenceDetails(next);
          add(`${id}_${stamp(d.recurrenceId)}`, d.item, d.startDate, d.endDate ?? d.startDate);
        }
      });
      // Moved occurrences whose original date is far from the window but which land in it, and
      // occurrences whose series isn't in the file at all.
      for (const m of g.moved) { try { add(`${uid}_${stamp(m.recurrenceId)}`, m, m.startDate, m.endDate ?? m.startDate); } catch { /* skip it */ } }
    } catch { /* one broken series doesn't take the rest of the calendar with it */ }
  }
  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  return { ...whoseIs(root, events), events: events.slice(0, MAX_EVENTS), complete: events.length <= MAX_EVENTS };
}

// A daily or weekly series with no fixed count repeats exactly every period, so it can start from
// a whole number of periods later, just before the window, instead of from its first day. Local
// wall time is kept, so a 9am meeting stays at 9am across clock changes. Anything else (counts,
// monthly, yearly) starts from the beginning; those are few steps anyway.
function fastForward(master: ICAL.Event, before: number): ICAL.Time | undefined {
  const rules = master.component.getAllProperties('rrule').map(p => p.getFirstValue() as ICAL.Recur);
  if (rules.length !== 1 || master.component.getFirstProperty('rdate')) return undefined;
  const r = rules[0];
  if (r.count || (r.freq !== 'DAILY' && r.freq !== 'WEEKLY')) return undefined;
  const days = (r.interval || 1) * (r.freq === 'WEEKLY' ? 7 : 1);
  const start = master.startDate;
  const periods = Math.floor((before - instant(start)) / (days * 864e5)) - 1;
  if (periods <= 0) return undefined;
  const t = start.clone();
  t.adjust(periods * days, 0, 0, 0);
  return t;
}

const stamp = (t: ICAL.Time) => new Date(instant(t)).toISOString().replace(/[-:]|\.\d+/g, '');

// Whose calendar it is: Google names the main calendar after its owner's address. Otherwise it's
// the one person on most of the series that have other guests, and only if no one else ties
// with them. A guess: whoever reads the calendar prefers an address they already know.
function whoseIs(root: ICAL.Component, events: CalendarEvent[]): { email?: string } {
  const name = mail(root.getFirstPropertyValue('x-wr-calname'));
  if (name) return { email: name };
  const series = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.attendees.length < 2) continue;
    const key = e.id.replace(/_\d{8}T\d{6}Z$/, '');
    const s = series.get(key) ?? new Set<string>();
    for (const a of e.attendees) s.add(a.email);
    series.set(key, s);
  }
  const count = new Map<string, number>();
  for (const s of series.values()) for (const a of s) count.set(a, (count.get(a) ?? 0) + 1);
  const [first, second] = [...count].sort((a, b) => b[1] - a[1]);
  if (!first || series.size < 2 || first[1] < series.size * 0.6 || (second && second[1] === first[1])) return {};
  return { email: first[0] };
}
