// Google Calendar, read-only: the sign-in exchange, keeping the grant, and reading events into
// the shape src/memory/calendar.ts takes. The grant lives in the user's browser as a cookie only
// this server can read (sealed with its secret), so the server keeps no one's calendar access.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { CalendarEvent, CalendarPerson } from '../src/memory/calendar.ts';

export const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const EVENTS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export type GoogleCode = 'reconnect' | 'expired' | 'other';
export class GoogleError extends Error {
  code: GoogleCode;
  constructor(code: GoogleCode, message: string) { super(message); this.code = code; }
}

// AES-256-GCM: the cookie can't be read or altered by anyone without the server's secret.
export function sealer(secret: string) {
  const key = createHash('sha256').update('cueboard/google/' + secret).digest();
  return {
    seal(v: unknown): string {
      const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(JSON.stringify(v), 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
    },
    open<T>(s: string | null | undefined): T | null {
      if (!s) return null;
      try {
        const b = Buffer.from(s, 'base64url');
        if (b.length < 29) return null;
        const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
        d.setAuthTag(b.subarray(12, 28));
        return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')) as T;
      } catch { return null; }
    },
  };
}

export function authUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  // prompt=consent every time, so Google always returns a refresh token.
  const q = new URLSearchParams({ client_id: o.clientId, redirect_uri: o.redirectUri, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: o.state });
  return `${AUTH}?${q}`;
}

async function token(params: Record<string, string>) {
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(15_000) });
  const b = await r.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string } | null;
  if (!r.ok || !b?.access_token) {
    // A grant that was revoked or ran out (weekly, while the Google app is in testing).
    if (b?.error === 'invalid_grant') throw new GoogleError('reconnect', 'Google needs you to connect your calendar again.');
    throw new GoogleError('other', `Google answered ${r.status}${b?.error ? ` (${b.error})` : ''}.`);
  }
  return b;
}

export async function exchangeCode(o: { clientId: string; clientSecret: string; redirectUri: string; code: string }) {
  const b = await token({ code: o.code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: 'authorization_code' });
  return { accessToken: b.access_token!, refreshToken: b.refresh_token, expiresIn: b.expires_in ?? 3600, scope: b.scope ?? '' };
}

export async function refreshAccess(o: { clientId: string; clientSecret: string; refreshToken: string }) {
  const b = await token({ refresh_token: o.refreshToken, client_id: o.clientId, client_secret: o.clientSecret, grant_type: 'refresh_token' });
  return { accessToken: b.access_token!, expiresIn: b.expires_in ?? 3600 };
}

export async function revoke(t: string) {
  await fetch(`${REVOKE}?token=${encodeURIComponent(t)}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => null);
}

type RawPerson = { email?: string; displayName?: string; self?: boolean; organizer?: boolean; resource?: boolean; responseStatus?: string };
type RawEvent = {
  id?: string; status?: string; summary?: string; description?: string; location?: string; htmlLink?: string; hangoutLink?: string; eventType?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: RawPerson[]; organizer?: RawPerson;
};
const FIELDS = 'summary,nextPageToken,items(id,status,summary,description,location,htmlLink,hangoutLink,eventType,start,end,conferenceData/entryPoints(entryPointType,uri),attendees(email,displayName,self,organizer,resource,responseStatus),organizer(email,displayName,self))';
const RESPONSES = new Set(['accepted', 'declined', 'tentative', 'needsAction']);

export function toEvent(e: RawEvent): CalendarEvent | null {
  const start = e.start?.dateTime ?? e.start?.date, end = e.end?.dateTime ?? e.end?.date;
  if (!e.id || !start || !end) return null;
  const person = (p: RawPerson): CalendarPerson | null => p.email && !p.resource ? {
    email: p.email.toLowerCase(), ...(p.displayName ? { name: p.displayName } : {}), ...(p.self ? { self: true } : {}), ...(p.organizer ? { organizer: true } : {}),
    ...(p.responseStatus && RESPONSES.has(p.responseStatus) ? { response: p.responseStatus as CalendarPerson['response'] } : {}),
  } : null;
  // An event you made with no guests list has only its organizer: you.
  const attendees = (e.attendees?.length ? e.attendees : e.organizer ? [e.organizer] : []).map(person).filter((p): p is CalendarPerson => !!p);
  const video = e.conferenceData?.entryPoints?.find(x => x.entryPointType === 'video')?.uri ?? e.hangoutLink;
  const link = video ?? (e.location && /^https?:\/\//.test(e.location.trim()) ? e.location.trim() : undefined);
  return {
    id: e.id, title: (e.summary ?? '').slice(0, 200) || 'Meeting', start, end, ...(e.start?.date && !e.start.dateTime ? { allDay: true } : {}),
    ...(e.status === 'cancelled' || e.status === 'tentative' || e.status === 'confirmed' ? { status: e.status } : {}),
    ...(e.eventType ? { kind: e.eventType } : {}),
    ...(e.description ? { description: e.description.slice(0, 8000) } : {}),
    ...(e.location ? { location: e.location.slice(0, 300) } : {}),
    ...(link ? { joinUrl: link } : {}), ...(e.htmlLink ? { url: e.htmlLink } : {}),
    attendees,
  };
}

// Events on the primary calendar between two times, repeating ones as separate meetings.
export async function listEvents(accessToken: string, from: string, to: string): Promise<{ email?: string; events: CalendarEvent[] }> {
  const events: CalendarEvent[] = [];
  let pageToken = '', email: string | undefined;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', fields: FIELDS, ...(pageToken ? { pageToken } : {}) });
    const r = await fetch(`${EVENTS}?${q}`, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 401) throw new GoogleError('expired', 'The access token ran out.');
    if (r.status === 403) throw new GoogleError('reconnect', 'Cueboard isn’t allowed to read this calendar. Connect it again and leave the calendar box ticked.');
    const b = await r.json().catch(() => null) as { summary?: string; nextPageToken?: string; items?: RawEvent[] } | null;
    if (!r.ok || !b) throw new GoogleError('other', `Google Calendar answered ${r.status}.`);
    if (!email && b.summary && /@/.test(b.summary)) email = b.summary.toLowerCase();
    for (const raw of b.items ?? []) { const e = toEvent(raw); if (e) events.push(e); }
    if (!b.nextPageToken) break;
    pageToken = b.nextPageToken;
  }
  if (!email) email = events.flatMap(e => e.attendees).find(a => a.self)?.email;
  return { ...(email ? { email } : {}), events };
}
