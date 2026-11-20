import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Reading a calendar from its private link. The link is a secret (anyone holding it reads the
// calendar), so it's never logged, and it's kept sealed in the browser's cookie like the Google
// grant. The server fetches whatever link it's given, so it refuses anything that isn't a public
// https address: on a hosted server a link to 169.254.169.254 or localhost would otherwise read
// the machine's own internal services. (A name that resolves differently between this check and
// the fetch could still slip past; hosted mode is invite-only, which keeps that risk small.)

export class LinkError extends Error {
  code: 'bad_link' | 'gone' | 'unreachable';
  constructor(code: LinkError['code'], message: string) { super(message); this.code = code; }
}

const MAX_BYTES = 10 * 1024 * 1024;

// "webcal://" is how calendar apps label these links; it's https underneath.
export function feedUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://')); } catch { throw new LinkError('bad_link', 'That doesn’t look like a link.'); }
  if (u.protocol !== 'https:') throw new LinkError('bad_link', 'Use the https link your calendar gives you.');
  if (u.username || u.password) throw new LinkError('bad_link', 'Use the link without a username or password in it.');
  if (u.href.length > 2000) throw new LinkError('bad_link', 'That link is too long to be a calendar link.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (isIP(host) && privateAddress(host))) {
    throw new LinkError('bad_link', 'That link points at a private address.');
  }
  return u;
}

// Loopback, private networks, link-local (cloud metadata lives here), carrier NAT and the like.
export function privateAddress(ip: string): boolean {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? (isIP(ip) === 4 ? ip : null);
  if (v4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const s = ip.toLowerCase();
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8:');
}

async function publicHost(u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  let addrs: { address: string }[];
  try { addrs = await lookup(host, { all: true }); } catch { throw new LinkError('unreachable', 'Couldn’t find that calendar’s address.'); }
  if (!addrs.length || addrs.some(a => privateAddress(a.address))) throw new LinkError('bad_link', 'That link points at a private address.');
}

// The calendar's text. Redirects are followed by hand, a few at most, each one checked again.
export async function fetchFeed(raw: string, opts: { fetcher?: typeof fetch } = {}): Promise<string> {
  const get = opts.fetcher ?? fetch;
  let u = feedUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    await publicHost(u);
    let r: Response;
    try {
      r = await get(u, { redirect: 'manual', headers: { accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'user-agent': 'Cueboard calendar reader' }, signal: AbortSignal.timeout(20_000) });
    } catch { throw new LinkError('unreachable', 'Couldn’t reach that calendar. Check the link and try again.'); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = feedUrl(new URL(r.headers.get('location')!, u).href); continue; }
    // A reset secret address, or a calendar no longer published.
    if (r.status === 404 || r.status === 410 || r.status === 401 || r.status === 403) throw new LinkError('gone', 'That calendar link doesn’t work any more. Copy a fresh one from your calendar.');
    if (!r.ok || !r.body) throw new LinkError('unreachable', `The calendar answered ${r.status}. Try again in a moment.`);
    const reader = r.body.getReader(), parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new LinkError('bad_link', 'That calendar is too big to read (over 10 MB).'); }
      parts.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(parts));
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new LinkError('bad_link', 'That link isn’t a calendar. Use the iCal or ICS address.');
    return text;
  }
  throw new LinkError('unreachable', 'That link redirects too many times.');
}
