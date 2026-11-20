import { ms, normalize } from '../text.ts';
import type { Company, Metric, Person, Touch } from '../types.ts';
import type { MeetingRecord, Memory, MemoryDoc } from './types.ts';

// Meetings come from the calendar without anyone pasting: each event with someone from outside
// becomes a meeting in memory, its guests become people (matched by email), their company comes
// from the email's domain, and the invite's own words become a document the model reads when it
// prepares. Nothing here asks the model anything; it's the calendar, copied faithfully.

// An event as Cueboard's server hands it over (scripts/google.ts turns Google's shape into this).
export interface CalendarPerson { email: string; name?: string; self?: boolean; organizer?: boolean; response?: 'accepted' | 'declined' | 'tentative' | 'needsAction' }
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  kind?: string;          // Google's eventType: only 'default' is a meeting; focus time and out-of-office aren't
  description?: string;
  location?: string;
  joinUrl?: string;
  url?: string;           // where the event opens in Google Calendar
  attendees: CalendarPerson[];
}

export interface CalendarSync { memory: Memory; added: string[]; changed: string[]; cancelled: string[] }

// Addresses anyone can sign up for say nothing about which company someone is from.
const PUBLIC = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de', 'fastmail.com', 'hey.com', 'zoho.com', 'yandex.com', 'mail.com', 'qq.com', '163.com']);
const domainOf = (email: string) => email.toLowerCase().split('@')[1] ?? '';
export const companyDomain = (email: string) => { const d = domainOf(email); return d && !PUBLIC.has(d) ? d : null; };
// Rooms and equipment are guests too, in Google's eyes.
const isResource = (email: string) => /@resource\.calendar\.google\.com$|@group\.calendar\.google\.com$/i.test(email);

const slug = (t: string) => normalize(t).replace(/ /g, '-').slice(0, 32) || 'x';
const safeId = (id: string) => id.replace(/[^\w-]/g, '-').slice(0, 60);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "maya.chen@larkspur.example" → "Maya Chen", for guests without a display name.
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0].replace(/\+.*$/, '');
  const parts = local.split(/[._-]+/).filter(p => p && !/^\d+$/.test(p));
  return parts.length ? parts.map(cap).join(' ') : email;
}
// "larkspur.example" → "Larkspur"; "go.acme.co.uk" → "Acme".
export function companyFromDomain(domain: string): string {
  const labels = domain.split('.').filter(l => !['www', 'mail', 'go', 'app', 'co', 'com', 'org', 'net', 'io', 'ac', 'gov'].includes(l));
  const name = (labels.length > 1 ? labels.slice(0, -1) : labels)[0] ?? domain.split('.')[0];
  return cap(name);
}

// Zoom, Meet and Teams fill descriptions with dial-in text. What's left is what someone wrote.
export function cleanDescription(text: string | undefined): string {
  if (!text) return '';
  const plain = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const noise = /https?:\/\/|meeting id|passcode|password:|dial[- ]in|one tap|tap mobile|join (zoom|with|by|the|microsoft|on)|microsoft teams|google meet|meet\.google|zoom\.us|teams\.microsoft|^\+?\d[\d\s,#*()-]{6,}$|^[-_─=*•.]{3,}$|find your local number|meeting options|need help\?|learn more|click here|conference id|pin:|^or call|^or dial|invited you|reply for|more phone numbers|^\s*#+\s*$/i;
  return plain.split('\n').map(l => l.trim()).filter(l => l && !noise.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

const sameTitle = (a: string, b: string) => normalize(a) === normalize(b);

export function syncCalendar(memory: Memory, events: CalendarEvent[], opts: { now: string; from: string; to: string; selfEmail?: string }): CalendarSync {
  const m: Memory = structuredClone(memory);
  const self = (opts.selfEmail || m.user?.email || '').toLowerCase();
  if (self && m.user && !m.user.email) m.user.email = self;
  const ownDomain = companyDomain(self);
  const today = opts.now.slice(0, 10);
  const ids = new Set([...m.people, ...m.companies, ...m.meetings].map(x => x.id));
  const uniq = (base: string) => { let id = base, i = 2; while (ids.has(id)) id = `${base}-${i++}`; ids.add(id); return id; };
  const added: string[] = [], changed: string[] = [], cancelled: string[] = [];
  const seen = new Set<string>();

  const companyFor = (email: string): string | undefined => {
    const d = companyDomain(email);
    if (!d || d === ownDomain) return undefined;
    let co = m.companies.find(c => c.domain === d);
    // A company someone pasted about, without its domain yet: "Larkspur Ventures" for larkspur.example.
    if (!co) { const label = normalize(companyFromDomain(d)); co = m.companies.find(c => !c.domain && normalize(c.name).split(' ')[0] === label); if (co) co.domain = d; }
    if (!co) { co = { id: uniq(`co-${slug(companyFromDomain(d))}`), name: companyFromDomain(d), domain: d } as Company; m.companies.push(co); }
    return co.id;
  };
  const personFor = (a: CalendarPerson): string => {
    const email = a.email.toLowerCase();
    let p = m.people.find(x => x.email?.toLowerCase() === email);
    const name = a.name?.trim() || nameFromEmail(email);
    // Someone known from a paste by name only: the invite tells us their address.
    if (!p) { p = m.people.find(x => !x.email && sameTitle(x.name, name)); if (p) p.email = email; }
    if (!p) {
      // The calendar says who's invited, by address, so who they are is confirmed.
      p = { id: uniq(`p-${slug(name)}`), name, email, resolved: true } as Person;
      m.people.push(p);
    }
    if (!p.companyId) { const c = companyFor(email); if (c) p.companyId = c; }
    return p.id;
  };

  for (const ev of events) {
    if (!ev.id || !ev.start || !ev.end) continue;
    seen.add(ev.id);
    const existing = m.meetings.find(x => x.calendar?.id === ev.id)
      ?? m.meetings.find(x => !x.calendar && sameTitle(x.title, ev.title) && ms(x.startsAt) === ms(ev.start));
    const guests = ev.attendees.filter(a => a.email && !a.self && a.email.toLowerCase() !== self && !isResource(a.email));
    const me = ev.attendees.find(a => a.self || (self && a.email.toLowerCase() === self));
    const outside = guests.some(a => !ownDomain || domainOf(a.email) !== ownDomain);
    const meeting = !ev.allDay && (!ev.kind || ev.kind === 'default') && ev.status !== 'cancelled' && me?.response !== 'declined' && outside;
    if (!meeting) {
      if (existing?.calendar && !existing.cancelled) { existing.cancelled = true; cancelled.push(existing.id); }
      continue;
    }

    const sourceId = `s-gcal-${safeId(ev.id)}`;
    const src = m.sources.find(s => s.id === sourceId);
    if (src) { if (ev.url) src.url = ev.url; }
    else m.sources.push({ id: sourceId, kind: 'calendar', ref: 'Calendar invite', seenAt: today, ownerId: m.userId, ...(ev.url ? { url: ev.url } : {}) });

    const attendeeIds = [...new Set(guests.map(personFor))];
    const durationMin = Math.min(600, Math.max(5, Math.round((ms(ev.end) - ms(ev.start)) / 60_000)));
    const calendar = { id: ev.id, ...(ev.url ? { url: ev.url } : {}), ...(ev.joinUrl ? { joinUrl: ev.joinUrl } : {}) };
    let id: string;
    if (existing) {
      id = existing.id;
      const before = JSON.stringify([existing.title, ms(existing.startsAt), existing.durationMin, [...existing.attendeeIds].sort(), !!existing.cancelled]);
      // People someone added from a paste stay; the calendar adds its guests to them.
      const people = existing.calendar ? attendeeIds : [...new Set([...existing.attendeeIds, ...attendeeIds])];
      Object.assign(existing, { title: ev.title || existing.title, startsAt: ev.start, durationMin, attendeeIds: people, calendar });
      delete existing.cancelled;
      if (JSON.stringify([existing.title, ms(existing.startsAt), existing.durationMin, [...existing.attendeeIds].sort(), false]) !== before) changed.push(id);
    } else {
      id = uniq(`mtg-gcal-${safeId(ev.id)}`.slice(0, 80));
      const rec: MeetingRecord = { id, title: ev.title || 'Meeting', startsAt: ev.start, durationMin, attendeeIds, sourceId, calendar };
      m.meetings.push(rec);
      added.push(id);
    }

    // What the invite says, for the model to read when it prepares: kept only when someone
    // wrote something beyond the dial-in details, and dated the first time it was seen.
    const words = cleanDescription(ev.description);
    const docId = `gcal-${safeId(ev.id)}`;
    const doc = m.docs.find(d => d.id === docId);
    if (words.length >= 20) {
      const names = attendeeIds.map(pid => m.people.find(p => p.id === pid)).filter((p): p is Person => !!p).map(p => `${p.name}${p.email ? ` <${p.email}>` : ''}`);
      const text = `${ev.title}\n${ev.start}\nWith: ${names.join(', ')}\n\n${words}`;
      if (doc) { if (doc.text !== text) { doc.text = text; doc.personIds = attendeeIds; } }
      else m.docs.push({ id: docId, kind: 'invite', title: ev.title, text, date: today, sourceId, personIds: attendeeIds } as MemoryDoc);
    } else if (doc) m.docs = m.docs.filter(d => d !== doc);
  }

  // An event that was in this stretch of the calendar and isn't any more was deleted.
  for (const x of m.meetings) {
    if (!x.calendar || x.cancelled || seen.has(x.calendar.id)) continue;
    const t = ms(x.startsAt);
    if (t >= ms(opts.from) && t < ms(opts.to)) { x.cancelled = true; cancelled.push(x.id); }
  }
  return { memory: m, added, changed, cancelled };
}

// A short fingerprint of everything a meeting's board is made from: the meeting, the people
// coming and their companies, what memory holds about them, and your own numbers. When it
// changes, the board is out of date.
export function meetingInputs(memory: Memory, meetingId: string, now = Date.now()): string | null {
  const mt = memory.meetings.find(x => x.id === meetingId);
  if (!mt) return null;
  const people = new Set(mt.attendeeIds);
  const companies = new Set(memory.people.filter(p => people.has(p.id) && p.companyId).map(p => p.companyId!));
  const keys = [...people, ...companies, mt.sourceId].map(k => `"${k}"`);
  const about = (rec: unknown) => { const s = JSON.stringify(rec); return keys.some(k => s.includes(k)); };
  const parts = [
    JSON.stringify([mt.title, ms(mt.startsAt), mt.durationMin, [...mt.attendeeIds].sort(), mt.goal ?? '', !!mt.cancelled]),
    JSON.stringify(memory.user ?? null),
  ];
  for (const p of memory.people) if (people.has(p.id)) parts.push(JSON.stringify(p));
  for (const c of memory.companies) if (companies.has(c.id)) parts.push(JSON.stringify(c));
  for (const list of [memory.facts, memory.disclosures, memory.touches, memory.commitments, memory.objections] as unknown[][]) {
    for (const r of list) if (about(r)) parts.push(JSON.stringify(r));
  }
  for (const r of memory.metrics as Metric[]) if (!r.owner || about(r)) parts.push(JSON.stringify(r));
  for (const d of memory.docs) if (d.sourceId === mt.sourceId || d.personIds.some(id => people.has(id))) parts.push(`${d.id}:${hash(d.text)}`);
  // Earlier meetings with them: one ending, or being called off, changes what this board says.
  for (const o of memory.meetings) {
    if (o.id === mt.id || ms(o.startsAt) >= ms(mt.startsAt) || !o.attendeeIds.some(id => people.has(id))) continue;
    parts.push(JSON.stringify(['m', o.id, ms(o.startsAt), o.durationMin, !!o.cancelled, ms(o.startsAt) + o.durationMin * 60_000 <= now]));
  }
  return hash(parts.sort().join('\n'));
}

export function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

// A meeting the calendar says happened, with nothing from it in memory, still happened: the next
// board knows it's a follow-up and says plainly that there are no notes, instead of treating the
// people as strangers. Notes taken on the day or the two after count as the meeting's record.
const localDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function unrecordedMeetings(memory: Memory, now: number): Touch[] {
  const dayMs = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).getTime() : localDay(ms(iso)).getTime();
  return memory.meetings
    .filter(m => m.calendar && !m.cancelled && m.attendeeIds.length && ms(m.startsAt) + m.durationMin * 60_000 <= now)
    .filter(m => {
      const d = localDay(ms(m.startsAt)).getTime();
      return !memory.touches.some(t => (t.kind === 'meeting' || t.kind === 'call') && t.personIds.some(id => m.attendeeIds.includes(id))
        && dayMs(t.date) >= d && dayMs(t.date) < d + 3 * 86_400_000);
    })
    .map(m => ({ id: `t-${m.id}`, date: ymd(localDay(ms(m.startsAt))), kind: 'meeting' as const, summary: `${m.title}. No notes from it yet.`, personIds: m.attendeeIds, sourceId: m.sourceId }));
}

export interface BoardState { meetingId: string; inputs?: string; refreshable: boolean }

// Which boards to draft and which to bring up to date, soonest first: every meeting still ahead
// today or tomorrow gets a board without anyone asking, and a board whose meeting or memory has
// changed since it was drafted is refreshed. Meetings already under way are left alone.
export function prepPlan(memory: Memory, boards: BoardState[], now: string): { make: string[]; refresh: string[] } {
  const t = ms(now);
  const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 2);
  const horizon = d.getTime();
  const make: string[] = [], refresh: string[] = [];
  const ahead = memory.meetings.filter(x => !x.cancelled && x.attendeeIds.length && ms(x.startsAt) > t && ms(x.startsAt) < horizon)
    .sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
  for (const x of ahead) {
    const mine = boards.filter(b => b.meetingId === x.id);
    if (!mine.length) { make.push(x.id); continue; }
    const b = mine.find(y => y.refreshable);
    if (b && b.inputs !== meetingInputs(memory, x.id, t)) refresh.push(x.id);
  }
  return { make, refresh };
}
