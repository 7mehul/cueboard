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
    ['alex@cueboard.example', '', true, true],
  ], 'rooms left out, an address used as a name ignored, the owner marked');

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
import { LinkError, feedUrl, fetchFeed, privateAddress } from '../scripts/calendar-link.ts';

const PUBLIC_IP = 'https://93.184.215.14/calendar/ical/basic.ics'; // an address literal, so no DNS lookup
const reply = (status: number, body = '', headers: Record<string, string> = {}) => new Response(status >= 300 && status < 400 ? null : body, { status, headers });

test('a calendar link must be a public https address', () => {
  assert.equal(feedUrl('webcal://p01-caldav.icloud.com/published/2/abc').href, 'https://p01-caldav.icloud.com/published/2/abc');
  for (const bad of ['http://calendar.google.com/x.ics', 'https://localhost/x.ics', 'https://127.0.0.1/x.ics', 'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/x.ics', 'https://[::1]/x.ics', 'https://[fd00::1]/x.ics', 'https://user:pw@example.com/x.ics', 'https://metadata.internal/x', 'not a link']) {
    assert.throws(() => feedUrl(bad), LinkError, bad);
  }
  assert.ok(privateAddress('192.168.1.10') && privateAddress('::ffff:10.1.2.3') && privateAddress('100.64.0.1'));
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
