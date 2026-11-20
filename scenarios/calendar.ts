import type { CalendarEvent } from '../src/memory/calendar.ts';

// A week of the story's founder's calendar, relative to now, for tests and
// `serve.ts --fake-calendar`. Three are meetings worth a board; the rest are what a real
// calendar is full of: an internal sync, focus time, a declined coffee, an all-day offsite.

export const FAKE_SELF = 'alex@cueboard.example';
const at = (base: Date, days: number, h: number, m = 0) => { const d = new Date(base); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.toISOString(); };
const day = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function fakeEvents(now = new Date()): CalendarEvent[] {
  const me = { email: FAKE_SELF, name: 'Alex Rivera', self: true, response: 'accepted' as const };
  const gcal = (id: string) => `https://calendar.google.com/calendar/event?eid=${id}`;
  return [
    {
      id: 'evt_larkspur_partner', title: 'Larkspur partner meeting: Cueboard', start: at(now, 1, 11), end: at(now, 1, 11, 45),
      status: 'confirmed', kind: 'default', url: gcal('larkspur'), joinUrl: 'https://zoom.us/j/8812345678',
      description: 'Partner meeting. Please bring the cohort data and your plan for the round.<br><br>──────────<br>Join Zoom Meeting<br>https://zoom.us/j/8812345678<br><br>Meeting ID: 881 234 5678<br>Passcode: 4411<br>One tap mobile<br>+16465588656,,8812345678#',
      attendees: [me, { email: 'maya@larkspur.example', name: 'Maya Chen', organizer: true, response: 'accepted' }, { email: 'ben@larkspur.example', name: 'Ben Okoro', response: 'needsAction' }],
    },
    {
      id: 'evt_northwind_intro', title: 'Intro: Priya (Northwind) <> Alex', start: at(now, 1, 15), end: at(now, 1, 15, 30),
      status: 'confirmed', kind: 'default', url: gcal('northwind'), joinUrl: 'https://meet.google.com/abc-defg-hij',
      description: 'Priya runs field operations at Northwind Logistics. Sam thought you two should talk about how her sales team prepares for customer visits.\n\nGoogle Meet joining info\nVideo call link: https://meet.google.com/abc-defg-hij',
      attendees: [me, { email: 'priya.raman@northwind.example', response: 'accepted' }],
    },
    {
      id: 'evt_team_sync', title: 'Weekly team sync', start: at(now, 1, 10), end: at(now, 1, 10, 30), status: 'confirmed', kind: 'default',
      attendees: [me, { email: 'jordan@cueboard.example', name: 'Jordan Lee', response: 'accepted' }],
    },
    { id: 'evt_focus', title: 'Focus time', start: at(now, 1, 9), end: at(now, 1, 10), status: 'confirmed', kind: 'focusTime', attendees: [] },
    {
      id: 'evt_sam_coffee', title: 'Coffee with Sam', start: at(now, 2, 12), end: at(now, 2, 13), status: 'confirmed', kind: 'default',
      attendees: [{ ...me, response: 'declined' }, { email: 'sam@patel.example', name: 'Sam Patel', organizer: true, response: 'accepted' }],
    },
    {
      id: 'evt_offsite', title: 'Company offsite', start: day(now, 3), end: day(now, 4), allDay: true, status: 'confirmed', kind: 'default',
      attendees: [me, { email: 'jordan@cueboard.example', name: 'Jordan Lee' }],
    },
    {
      id: 'evt_maya_call', title: 'Call with Maya (Larkspur)', start: at(now, -6, 10), end: at(now, -6, 10, 30), status: 'confirmed', kind: 'default', url: gcal('maya'),
      attendees: [me, { email: 'maya@larkspur.example', name: 'Maya Chen', organizer: true, response: 'accepted' }],
    },
  ];
}
