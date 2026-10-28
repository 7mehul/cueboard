import type { DocKind } from './types.ts';

// One paste, several documents. People paste the invite, the email thread and their notes into
// one box; this splits them apart and says what each one is and when it's from, so each can be
// read on its own. It's a first guess the person can correct, so it stays simple and visible:
// it splits only where a document clearly starts, and anything it can't place is notes.

export interface PasteChunk { kind: DocKind; date: string; title: string; text: string }

// Pastes made one after another are joined with this line, so they stay apart.
export const PASTE_BREAK = '\n\n———\n\n';

const SEPARATOR = /^\s*(?:-{3,}|—{3,}|\*{3,}|_{3,}|={3,})\s*$/;
const HEADER = /^(?:from|to|cc|bcc|subject|date|sent)\s*:/i;
const ICS = /BEGIN:V(?:CALENDAR|EVENT)/;
const MEETING_LINK = /meet\.google\.com|zoom\.us\/j|teams\.microsoft\.com|webex\.com|join with google meet|microsoft teams meeting|join zoom meeting/i;
const TIME_RANGE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i;
const GUESTS = /^(?:guests|attendees|invitees|participants|who)\s*:/im;
const SPEAKER = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+)?[A-Z][\w .'’-]{1,40}:\s+\S/;
const METRIC = /^[^:\n]{2,40}:\s*[$€£]?\s*-?\d/;

export function splitPaste(text: string, today: string): PasteChunk[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  const push = () => { if (cur.join('\n').trim()) blocks.push(cur); cur = []; };
  for (const [i, line] of lines.entries()) {
    if (SEPARATOR.test(line)) { push(); continue; }
    // A new email header or calendar file starts a new document, unless it's the block's start.
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const startsEmail = /^from\s*:/i.test(line) && prevBlank && cur.some(l => l.trim());
    const startsIcs = /^BEGIN:VCALENDAR/.test(line) && cur.some(l => l.trim());
    if (startsEmail || startsIcs) push();
    cur.push(line);
  }
  push();
  return blocks.map(b => {
    const t = b.join('\n').trim();
    const kind = kindOf(t);
    return { kind, date: dateOf(t, kind, today), title: titleOf(t, kind), text: t };
  });
}

export function kindOf(t: string): DocKind {
  if (ICS.test(t)) return 'invite';
  const all = t.split('\n').filter(l => l.trim());
  const head = all.slice(0, 12).join('\n');
  const invite = [MEETING_LINK.test(t), TIME_RANGE.test(head), GUESTS.test(t), /\binvit(?:ation|ed|e)\b/i.test(head), /^(?:when|where)\s*:/im.test(head)].filter(Boolean).length;
  if (invite >= 2) return 'invite';
  const headers = all.slice(0, 8).filter(l => HEADER.test(l)).length;
  if (headers >= 2 || /^on .{6,90} wrote:\s*$/im.test(t)) return 'email';
  if (all.length >= 6 && all.filter(l => SPEAKER.test(l)).length / all.length > 0.5) return 'transcript';
  if (all.length >= 2 && all.filter(l => METRIC.test(l)).length / all.length >= 0.5) return 'other';
  if (/\b(?:experience|education|followers|connections)\b/i.test(t) && !/\b(?:i|we|told|asked|said)\b/i.test(head)) return 'profile';
  return 'notes';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// The first date written in a piece of text, as YYYY-MM-DD. Without a year, it's the most recent
// such date on or before today: notes and emails are about the past.
export function firstDate(t: string, today: string): string | null {
  const ty = +today.slice(0, 4);
  const pick = (y: number | null, m: number, d: number) => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    if (y) return iso(y, m, d);
    const guess = iso(ty, m, d);
    return guess <= today ? guess : iso(ty - 1, m, d);
  };
  const isoM = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t);
  // Month names as whole words, so "Maya" isn't May and "decided" isn't December.
  const named = [...t.matchAll(/\b(?:(\d{1,2})\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?(?:\s+(\d{1,2})(?:st|nd|rd|th)?\b)?(?:,?\s+(20\d{2}))?/gi)].find(x => x[1] || x[3]);
  const slash = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(t);
  const found: { at: number; date: string | null }[] = [];
  if (isoM) found.push({ at: isoM.index, date: iso(+isoM[1], +isoM[2] - 1, +isoM[3]) });
  if (named) found.push({ at: named.index!, date: pick(named[4] ? +named[4] : null, MONTHS.indexOf(named[2].toLowerCase().slice(0, 3)), +(named[3] ?? named[1])) });
  if (slash) found.push({ at: slash.index, date: pick(+slash[3], +slash[1] - 1, +slash[2]) });
  return found.filter(f => f.date).sort((a, b) => a.at - b.at)[0]?.date ?? null;
}

function dateOf(t: string, kind: DocKind, today: string): string {
  // An invite's own date is when it arrived; the meeting's time is read from it later.
  if (kind === 'invite') return today;
  const lines = t.split('\n');
  if (kind === 'email') {
    const h = lines.slice(0, 10).find(l => /^(?:date|sent)\s*:/i.test(l));
    const d = h && firstDate(h, today);
    if (d) return d;
  }
  return firstDate(lines.slice(0, 5).join('\n'), today) ?? today;
}

function titleOf(t: string, kind: DocKind): string {
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  const clip = (s: string) => (s.length > 64 ? s.slice(0, 63) + '…' : s);
  if (kind === 'email') {
    const from = lines.find(l => /^from\s*:/i.test(l))?.replace(/^from\s*:\s*/i, '').replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();
    const subject = lines.find(l => /^subject\s*:/i.test(l))?.replace(/^subject\s*:\s*/i, '').trim();
    return clip(from ? `Email from ${from}` : subject ? `Email: ${subject}` : 'Email');
  }
  if (kind === 'invite') {
    const name = lines.find(l => !/^(?:BEGIN|END|VERSION|PRODID|METHOD|DTSTAMP|UID):/.test(l));
    const summary = /^SUMMARY:(.+)$/m.exec(t)?.[1];
    return clip(`Invite: ${(summary ?? name ?? 'meeting').trim()}`);
  }
  if (kind === 'transcript') return 'Call transcript';
  return clip(lines[0] ?? 'Pasted text');
}
