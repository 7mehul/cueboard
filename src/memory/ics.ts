import ICAL from 'ical.js';
import type { CalendarEvent, CalendarPerson } from './calendar.ts';

// A calendar in iCalendar form, the way every calendar app shares one: a private feed link
// (Google's "secret address", Outlook's published calendar, iCloud) or an invite file. Turned
// into the same events Google's API gives, so the rest of Cueboard can't tell them apart.
// Repeating meetings become one event per occurrence, with moved and cancelled ones applied.

export interface IcsCalendar { email?: string; events: CalendarEvent[] }

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
function zoned(t: ICAL.Time, zone: string): number | null {
  try {
    const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
    let at = wall - offsetAt(wall, zone);
    const again = wall - offsetAt(at, zone);
    if (again !== at) at = again;
    return at;
  } catch { return null; } // not a zone this runtime knows
}

// When an occurrence happens. A zone the feed defined, or UTC, ical.js converts itself; a zone it
// only named is looked up; a time with no zone at all is taken as this machine's local time.
function instant(t: ICAL.Time): number {
  const tz = t.zone?.tzid;
  if (tz && tz !== 'floating') return t.toJSDate().getTime();
  const named = (t as unknown as { timezone?: string }).timezone;
  const zone = named ? WINDOWS[named] ?? named : undefined;
  const at = zone ? zoned(t, zone) : null;
  return at ?? t.toJSDate().getTime();
}
const iso = (t: ICAL.Time) => (t.isDate ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : new Date(instant(t)).toISOString());

const mail = (v: unknown) => { const s = String(v ?? '').replace(/^mailto:/i, '').trim().toLowerCase(); return EMAIL.test(s) ? s : null; };

function people(e: ICAL.Event): CalendarPerson[] {
  const out: CalendarPerson[] = [];
  for (const p of e.attendees) {
    const cutype = String(p.getParameter('cutype') ?? 'INDIVIDUAL').toUpperCase();
    if (cutype === 'ROOM' || cutype === 'RESOURCE') continue;
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

// Everything that happens between two instants. Only the window is expanded, so a weekly meeting
// that has run for years costs no more than one that started last week.
export function parseIcs(text: string, window: { from: string; to: string }): IcsCalendar {
  let root: ICAL.Component;
  try { root = new ICAL.Component(ICAL.parse(text)); } catch { throw new Error('That isn’t a calendar file.'); }
  if (root.name !== 'vcalendar') throw new Error('That isn’t a calendar file.');
  for (const tz of root.getAllSubcomponents('vtimezone')) { try { ICAL.TimezoneService.register(tz); } catch { /* a zone ical.js can't read falls back to its name */ } }
  const from = Date.parse(window.from), to = Date.parse(window.to);
  const inWindow = (s: number, e: number) => e > from && s < to;

  // A moved or cancelled occurrence of a repeating meeting is its own VEVENT, tied by UID.
  const byUid = new Map<string, { master?: ICAL.Event; moved: ICAL.Event[] }>();
  for (const v of root.getAllSubcomponents('vevent')) {
    const e = new ICAL.Event(v);
    if (!e.uid || !v.getFirstProperty('dtstart')) continue;
    // Google's feed adds "@google.com" to the event id its API uses; without it, the ids match
    // (repeats too: "<id>_<start in UTC>"), so switching between the two doesn't duplicate meetings.
    const uid = e.uid.replace(/@google\.com$/i, '');
    const g = byUid.get(uid) ?? { moved: [] };
    if (e.isRecurrenceException()) g.moved.push(e); else g.master = e;
    byUid.set(uid, g);
  }

  const events: CalendarEvent[] = [];
  for (const [uid, g] of byUid) {
    if (!g.master) { // occurrences whose series isn't in the file stand on their own
      for (const m of g.moved) { const s = m.startDate, e = m.endDate ?? s; if (inWindow(instant(s), instant(e))) events.push(toEvent(`${uid}_${stamp(m.recurrenceId)}`, m, s, e)); }
      continue;
    }
    const master = g.master;
    for (const m of g.moved) master.relateException(m);
    if (!master.isRecurring()) {
      const s = master.startDate, e = master.endDate ?? s;
      if (inWindow(instant(s), instant(e))) events.push(toEvent(uid, master, s, e));
      continue;
    }
    const it = master.iterator();
    for (let next = it.next(), n = 0; next && n < 20000; next = it.next(), n++) {
      const d = master.getOccurrenceDetails(next);
      const s = instant(d.startDate), e = instant(d.endDate ?? d.startDate);
      // A moved occurrence can land in the window from outside it, so look a little past the end.
      if (instant(next) > to + 31 * 864e5) break;
      if (inWindow(s, e)) events.push(toEvent(`${uid}_${stamp(d.recurrenceId)}`, d.item, d.startDate, d.endDate ?? d.startDate));
    }
  }
  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  return { ...whoseIs(root, events), events: events.slice(0, 2000) };
}

const stamp = (t: ICAL.Time) => new Date(instant(t)).toISOString().replace(/[-:]|\.\d+/g, '');

// Whose calendar it is: Google names the main calendar after its owner's address; otherwise the
// one guest on nearly every meeting with others is the owner. Marked so they're never a guest.
function whoseIs(root: ICAL.Component, events: CalendarEvent[]): { email?: string } {
  const name = mail(root.getFirstPropertyValue('x-wr-calname'));
  let email = name ?? undefined;
  if (!email) {
    const shared = events.filter(e => e.attendees.length >= 2);
    const count = new Map<string, number>();
    for (const e of shared) for (const a of e.attendees) count.set(a.email, (count.get(a.email) ?? 0) + 1);
    const [top, n] = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
    if (top && shared.length >= 2 && n! >= shared.length * 0.6) email = top;
  }
  if (email) for (const e of events) for (const a of e.attendees) if (a.email === email) a.self = true;
  return email ? { email } : {};
}
