import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs } from '../src/memory/ics.ts';
import { syncCalendar } from '../src/memory/calendar.ts';
import { emptyMemory } from '../src/memory/types.ts';

// A feed shaped like Google's "secret address in iCal format": the owner's address as the
// calendar's name, its zone defined, guests with their answers, a repeating meeting with one
// week moved and one skipped, and the things that aren't meetings.
const FEED = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
X-WR-CALNAME:alex@cueboard.example
X-WR-TIMEZONE:America/New_York
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20261124T140000
DTEND;TZID=America/New_York:20261124T144500
UID:renewal@google.com
SUMMARY:Brightline renewal check-in
DESCRIPTION:Jordan wants to talk through seat counts before the renewal
 \\, and IT's SSO questions.\\n\\nJoin with Google Meet: https://meet.google.com
 /abc-defg-hij
ORGANIZER;CN=Alex Rivera:mailto:alex@cueboard.example
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Jordan
  Ellis:mailto:jordan@brightlinehealth.example
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=alex@c
 ueboard.example:mailto:alex@cueboard.example
ATTENDEE;CUTYPE=ROOM;PARTSTAT=ACCEPTED;CN=Board room:mailto:c_123@resource.
 calendar.google.com
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20261103T100000
DTEND;TZID=America/New_York:20261103T103000
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=America/New_York:20261117T100000
UID:weekly@google.com
SUMMARY:Fieldstone weekly
ORGANIZER;CN=Omar Haddad:mailto:omar@fieldstone.example
ATTENDEE;PARTSTAT=ACCEPTED;CN=Omar Haddad:mailto:omar@fieldstone.example
ATTENDEE;PARTSTAT=ACCEPTED:mailto:alex@cueboard.example
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20261124T150000
DTEND;TZID=America/New_York:20261124T153000
RECURRENCE-ID;TZID=America/New_York:20261124T100000
UID:weekly@google.com
SUMMARY:Fieldstone weekly (moved)
ORGANIZER;CN=Omar Haddad:mailto:omar@fieldstone.example
ATTENDEE;PARTSTAT=ACCEPTED;CN=Omar Haddad:mailto:omar@fieldstone.example
ATTENDEE;PARTSTAT=ACCEPTED:mailto:alex@cueboard.example
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261126
DTEND;VALUE=DATE:20261127
UID:holiday@google.com
SUMMARY:Thanksgiving
END:VEVENT
BEGIN:VEVENT
DTSTART:20261125T170000Z
DTEND:20261125T180000Z
UID:declined@google.com
SUMMARY:Vendor pitch
ATTENDEE;PARTSTAT=ACCEPTED;CN=Vee Seller:mailto:vee@vendor.example
ATTENDEE;PARTSTAT=DECLINED:mailto:alex@cueboard.example
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Pacific Standard Time:20261125T090000
DTEND;TZID=Pacific Standard Time:20261125T093000
UID:outlook-style
SUMMARY:Intro: Priya (Northwind)
LOCATION:https://zoom.us/j/123456789
ATTENDEE;PARTSTAT=NEEDS-ACTION;CN=Priya Raman:mailto:priya.raman@northwind.example
ATTENDEE;PARTSTAT=ACCEPTED:mailto:alex@cueboard.example
END:VEVENT
END:VCALENDAR`;

const WINDOW = { from: '2026-11-10T00:00:00Z', to: '2026-12-08T00:00:00Z' };

test('a calendar feed reads like the calendar: zones, guests, repeats, moved and skipped weeks', () => {
  const cal = parseIcs(FEED, WINDOW);
  assert.equal(cal.email, 'alex@cueboard.example', 'Google names the feed after its owner');
  const by = (title: string) => cal.events.filter(e => e.title === title);

  const renewal = by('Brightline renewal check-in')[0];
  assert.equal(renewal.start, '2026-11-24T19:00:00.000Z', '2pm in New York');
  assert.equal(renewal.joinUrl, 'https://meet.google.com/abc-defg-hij');
  assert.match(renewal.description!, /seat counts/);
  assert.deepEqual(renewal.attendees.map(a => [a.email, a.name ?? '', !!a.self, !!a.organizer]), [
    ['jordan@brightlinehealth.example', 'Jordan Ellis', false, false],
    ['alex@cueboard.example', '', false, true],
  ], 'rooms left out, an address used as a name ignored; who "you" are is the sync’s call, not the file’s');

  const weekly = cal.events.filter(e => e.title.startsWith('Fieldstone weekly'));
  assert.deepEqual(weekly.map(e => [e.start, e.title]), [
    ['2026-11-10T15:00:00.000Z', 'Fieldstone weekly'],
    ['2026-11-24T20:00:00.000Z', 'Fieldstone weekly (moved)'],
    ['2026-12-01T15:00:00.000Z', 'Fieldstone weekly'],
  ], 'Nov 17 skipped, Nov 24 moved to 3pm, the rest at 10am Eastern');
  assert.equal(new Set(weekly.map(e => e.id)).size, 3, 'each occurrence its own id');
  assert.deepEqual(weekly.map(e => e.id), ['weekly_20261110T150000Z', 'weekly_20261124T150000Z', 'weekly_20261201T150000Z'], 'the ids Google’s own API gives these occurrences');
  assert.equal(renewal.id, 'renewal');

  assert.equal(by('Thanksgiving')[0].allDay, true);
  assert.equal(by('Thanksgiving')[0].start, '2026-11-26');
  assert.equal(by('Intro: Priya (Northwind)')[0].start, '2026-11-25T17:00:00.000Z', 'a Windows zone name with no definition still lands right');
  assert.equal(by('Intro: Priya (Northwind)')[0].joinUrl, 'https://zoom.us/j/123456789');
  assert.ok(!cal.events.some(e => e.start < '2026-11-09'), 'nothing before the window');
});

test('fed to the calendar sync, only real meetings with outside people become meetings', () => {
  const cal = parseIcs(FEED, WINDOW);
  const s = syncCalendar(emptyMemory('me'), cal.events, { now: '2026-11-20T12:00:00Z', ...WINDOW, selfEmail: cal.email });
  const titles = s.memory.meetings.filter(m => !m.cancelled).map(m => m.title).sort();
  assert.deepEqual(titles, ['Brightline renewal check-in', 'Fieldstone weekly', 'Fieldstone weekly', 'Fieldstone weekly (moved)', 'Intro: Priya (Northwind)'],
    'no holiday, no meeting you declined');
  assert.deepEqual(s.memory.people.map(p => p.name).sort(), ['Jordan Ellis', 'Omar Haddad', 'Priya Raman']);
  // Synced again a week on, nothing doubles.
  const again = syncCalendar(s.memory, parseIcs(FEED, WINDOW).events, { now: '2026-11-20T12:00:00Z', ...WINDOW, selfEmail: cal.email });
  assert.deepEqual(again.added, []);
  assert.equal(again.memory.meetings.length, s.memory.meetings.length);
});

test('without a name on the feed, the owner is the one guest on nearly every meeting', () => {
  const cal = parseIcs(FEED.replace('X-WR-CALNAME:alex@cueboard.example\n', ''), WINDOW);
  assert.equal(cal.email, 'alex@cueboard.example');
});

test('an invite file on its own is a calendar of one', () => {
  const invite = `BEGIN:VCALENDAR
METHOD:REQUEST
BEGIN:VEVENT
UID:one-off
DTSTART:20261201T160000Z
DTEND:20261201T163000Z
SUMMARY:Coffee with Sam
ORGANIZER;CN=Sam Patel:mailto:sam@patel.example
ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:alex@cueboard.example
END:VEVENT
END:VCALENDAR`;
  const cal = parseIcs(invite, WINDOW);
  assert.deepEqual(cal.events.map(e => [e.title, e.attendees.map(a => a.email)]), [['Coffee with Sam', ['alex@cueboard.example', 'sam@patel.example']]]);
  assert.throws(() => parseIcs('Hi Alex, see you Tuesday', WINDOW), /isn’t a calendar file/);
});

// ---------- reading a calendar link on the server ----------
import { LinkError, feedUrl, fetchFeed, privateAddress, safeLookup } from '../scripts/calendar-link.ts';

const PUBLIC_IP = 'https://93.184.215.14/calendar/ical/basic.ics'; // an address literal, so no DNS lookup
const reply = (status: number, body = '', headers: Record<string, string> = {}) => new Response(status >= 300 && status < 400 ? null : body, { status, headers });

test('a calendar link must be a public https address', () => {
  assert.equal(feedUrl('webcal://p01-caldav.icloud.com/published/2/abc').href, 'https://p01-caldav.icloud.com/published/2/abc');
  for (const bad of ['http://calendar.google.com/x.ics', 'https://localhost/x.ics', 'https://127.0.0.1/x.ics', 'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/x.ics', 'https://[::1]/x.ics', 'https://[fd00::1]/x.ics', 'https://user:pw@example.com/x.ics', 'https://metadata.internal/x', 'not a link']) {
    assert.throws(() => feedUrl(bad), LinkError, bad);
  }
  assert.ok(privateAddress('192.168.1.10') && privateAddress('::ffff:10.1.2.3') && privateAddress('100.64.0.1'));
  // An IPv4 address written as IPv6, the way URLs rewrite it: still private.
  for (const bad of ['https://[::ffff:127.0.0.1]/c.ics', 'https://[::ffff:a9fe:a9fe]/latest/meta-data', 'https://[::ffff:7f00:1]:8080/admin', 'https://[0:0:0:0:0:ffff:a00:1]/x']) {
    assert.throws(() => feedUrl(bad), LinkError, bad);
  }
  assert.ok(privateAddress('::ffff:7f00:1') && privateAddress('fe80::1') && privateAddress('not-an-ip'));
  assert.ok(!privateAddress('93.184.215.14') && !privateAddress('2606:4700::1111'));
});

test('reading a link: redirects are checked again, dead links say so, only calendars come back', async () => {
  const cal = 'BEGIN:VCALENDAR\nEND:VCALENDAR\n';
  assert.equal(await fetchFeed(PUBLIC_IP, { fetcher: (async () => reply(200, cal)) as typeof fetch }), cal);
  let hops = 0;
  const viaRedirect = (async () => (hops++ ? reply(200, cal) : reply(302, '', { location: 'https://93.184.215.15/moved.ics' }))) as typeof fetch;
  assert.equal(await fetchFeed(PUBLIC_IP, { fetcher: viaRedirect }), cal);
  const toMetadata = (async () => reply(302, '', { location: 'https://169.254.169.254/latest/meta-data' })) as typeof fetch;
  await assert.rejects(fetchFeed(PUBLIC_IP, { fetcher: toMetadata }), /private address/);
  await assert.rejects(fetchFeed(PUBLIC_IP, { fetcher: (async () => reply(404)) as typeof fetch }), (e: LinkError) => e.code === 'gone');
  await assert.rejects(fetchFeed(PUBLIC_IP, { fetcher: (async () => reply(200, '<html>Sign in</html>')) as typeof fetch }), /isn’t a calendar/);
});

test('the address a connection actually uses is checked too, so a name can’t switch to a private one', async () => {
  const err = await new Promise<Error | null>(ok => safeLookup('localhost', {}, e => ok(e)));
  assert.ok(err instanceof LinkError && /private address/.test(err.message));
});

// ---------- what the memory audit found ----------
import { cleanDescription } from '../src/memory/calendar.ts';
import type { Memory } from '../src/memory/types.ts';

const cal = (...events: string[]) => `BEGIN:VCALENDAR\nVERSION:2.0\n${events.join('\n')}\nEND:VCALENDAR`;
const ev = (uid: string, start: string, end: string, more = '') => `BEGIN:VEVENT\nUID:${uid}\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${uid}\n${more}END:VEVENT`;
const zoe = (): Memory => ({ ...emptyMemory('me'), user: { role: 'AE', company: 'Acme', email: 'zoe@acme.example' } });

test('a weekly one-to-one doesn’t make the other person the calendar’s owner', () => {
  const weekly = ev('omar-1on1', '20261103T150000Z', '20261103T153000Z', 'RRULE:FREQ=WEEKLY\nATTENDEE:mailto:omar@fieldstone.example\nATTENDEE:mailto:zoe@acme.example\n');
  const c = parseIcs(cal(weekly), WINDOW);
  assert.equal(c.email, undefined, 'a tie is no answer');
  const s = syncCalendar(zoe(), c.events, { now: '2026-11-20T12:00:00Z', ...WINDOW, selfEmail: 'omar@fieldstone.example' });
  assert.deepEqual(s.memory.people.map(p => p.email), ['omar@fieldstone.example'], 'the address the user gave wins over the calendar’s guess');
});

test('a meeting from an invite file stays when a calendar that doesn’t list it syncs', () => {
  const invite = parseIcs(cal(ev('coffee-sam', '20261201T160000Z', '20261201T163000Z', 'ATTENDEE:mailto:sam@patel.example\nATTENDEE:mailto:zoe@acme.example\n')), WINDOW).events;
  let m = syncCalendar(zoe(), invite, { now: '2026-11-20T12:00:00Z', from: '2026-11-20T12:00:00Z', to: '2026-11-20T12:00:00Z', via: 'invite' }).memory;
  m = syncCalendar(m, [], { now: '2026-11-20T12:00:00Z', ...WINDOW }).memory;
  assert.equal(m.meetings[0].cancelled, undefined);
  // And when the calendar does list it, the calendar takes it over.
  m = syncCalendar(m, invite, { now: '2026-11-20T12:00:00Z', ...WINDOW }).memory;
  assert.equal(m.meetings[0].calendar?.via, undefined);
});

test('people added from a paste stay on the meeting, sync after sync', () => {
  const m0: Memory = { ...zoe(), people: [{ id: 'p-maya', name: 'Maya Chen', email: 'maya@larkspur.example', resolved: true }, { id: 'p-ben', name: 'Ben Okoro', resolved: true }],
    meetings: [{ id: 'mtg-paste', title: 'Partner meeting', startsAt: '2026-11-24T16:00:00.000Z', durationMin: 45, attendeeIds: ['p-maya', 'p-ben'], sourceId: 's-x' }] };
  const e = parseIcs(cal(ev('partner', '20261124T160000Z', '20261124T164500Z', 'SUMMARY:Partner meeting\nATTENDEE:mailto:maya@larkspur.example\nATTENDEE:mailto:zoe@acme.example\n').replace('SUMMARY:partner\n', '')), WINDOW).events;
  let m = syncCalendar(m0, e, { now: '2026-11-20T12:00:00Z', ...WINDOW }).memory;
  m = syncCalendar(m, e, { now: '2026-11-20T12:00:00Z', ...WINDOW }).memory;
  assert.deepEqual(m.meetings[0].attendeeIds.sort(), ['p-ben', 'p-maya']);
});

test('long event ids stay apart, and invites keep their real sentences', () => {
  const long = 'AAMkAGI2TGuLAAA' + 'x'.repeat(90);
  const e = parseIcs(cal(ev(long, '20261110T170000Z', '20261110T173000Z', 'RRULE:FREQ=WEEKLY;COUNT=3\nATTENDEE:mailto:priya.raman@northwind.example\nATTENDEE:mailto:zoe@acme.example\nDESCRIPTION:Agenda: pilot scope and the security review. Learn more about their rollout before we commit to a date.\n')), WINDOW).events;
  const m = syncCalendar(zoe(), e, { now: '2026-11-20T12:00:00Z', ...WINDOW }).memory;
  assert.equal(new Set(m.meetings.map(x => x.sourceId)).size, 3, 'each occurrence its own source');
  assert.equal(new Set(m.docs.map(d => d.id)).size, 3);
  assert.equal(cleanDescription('Agenda: pilot scope and timeline.\nJoin with Google Meet\nhttps://meet.google.com/abc-defg-hij\nAlex invited you to this event and wants to cover the renewal terms in detail before Friday.\nLearn more'),
    'Agenda: pilot scope and timeline.\nAlex invited you to this event and wants to cover the renewal terms in detail before Friday.');
});

test('one broken event doesn’t lose the calendar, and each feed’s zones are its own', () => {
  const good = ev('good', '20261125T170000Z', '20261125T173000Z');
  const broken = ev('broken', 'not-a-date', '20261125T173000Z');
  assert.deepEqual(parseIcs(cal(broken, good), WINDOW).events.map(e => e.id), ['good']);
  // A feed that defines New York wrongly doesn't change how the next feed's New York is read.
  const wrongNY = `BEGIN:VTIMEZONE\nTZID:America/New_York\nBEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:+0800\nTZOFFSETTO:+0800\nEND:STANDARD\nEND:VTIMEZONE`;
  parseIcs(cal(wrongNY, 'BEGIN:VEVENT\nUID:a\nDTSTART;TZID=America/New_York:20261125T120000\nDTEND;TZID=America/New_York:20261125T130000\nEND:VEVENT'), WINDOW);
  const b = parseIcs(cal('BEGIN:VEVENT\nUID:b\nDTSTART;TZID=America/New_York:20261125T120000\nDTEND;TZID=America/New_York:20261125T130000\nEND:VEVENT'), WINDOW);
  assert.equal(b.events[0].start, '2026-11-25T17:00:00.000Z');
});

test('repeats: old series are quick, far-moved occurrences are found, floating times use the calendar’s zone', () => {
  const daily = Array.from({ length: 50 }, (_, i) => ev(`daily-${i}`, '20000103T090000Z', '20000103T091500Z', 'RRULE:FREQ=DAILY\n')).join('\n');
  const t0 = Date.now();
  const c = parseIcs(cal(daily), WINDOW);
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
  assert.equal(c.events.length, 50 * 28);
  // The March occurrence of a monthly meeting, moved into this window.
  const monthly = ev('monthly', '20260105T150000Z', '20260105T160000Z', 'RRULE:FREQ=MONTHLY\n') + '\n' +
    'BEGIN:VEVENT\nUID:monthly\nRECURRENCE-ID:20270305T150000Z\nDTSTART:20261127T150000Z\nDTEND:20261127T160000Z\nSUMMARY:Pulled in\nEND:VEVENT';
  assert.ok(parseIcs(cal(monthly), WINDOW).events.some(e => e.title === 'Pulled in' && e.start === '2026-11-27T15:00:00.000Z'));
  const floating = cal('BEGIN:VEVENT\nUID:f\nDTSTART:20261125T090000\nDTEND:20261125T093000\nEND:VEVENT').replace('VERSION:2.0', 'VERSION:2.0\nX-WR-TIMEZONE:America/Los_Angeles');
  assert.equal(parseIcs(floating, WINDOW).events[0].start, '2026-11-25T17:00:00.000Z');
  assert.equal(parseIcs(floating.replace('X-WR-TIMEZONE:America/Los_Angeles\n', ''), WINDOW, { zone: 'Europe/London' }).events[0].start, '2026-11-25T09:00:00.000Z', 'or the reader’s zone');
  // 2:30 on the spring-forward night doesn't exist; it moves forward to 3:30, as clocks do.
  const gap = parseIcs(cal('BEGIN:VEVENT\nUID:g\nDTSTART;TZID=America/New_York:20270314T023000\nDTEND;TZID=America/New_York:20270314T033000\nEND:VEVENT'), { from: '2027-03-13T00:00:00Z', to: '2027-03-16T00:00:00Z' });
  assert.equal(gap.events[0].start, '2027-03-14T07:30:00.000Z');
  // The same UID twice, neither a repeat: two events.
  assert.equal(parseIcs(cal(ev('dup', '20261125T170000Z', '20261125T173000Z'), ev('dup', '20261126T170000Z', '20261126T173000Z')), WINDOW).events.length, 2);
});
