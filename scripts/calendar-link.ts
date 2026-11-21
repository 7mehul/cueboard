import { lookup } from 'node:dns/promises';
import { lookup as lookupCb } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';

// Reading a calendar from its private link. The link is a secret (anyone holding it reads the
// calendar), so it's never logged, and it's kept sealed in the browser's cookie like the Google
// grant. The server fetches whatever link it's given, so it refuses anything that isn't a public
// https address: on a server in the cloud a link to 169.254.169.254 or localhost would otherwise read
// the machine's own internal services. The check runs again at connect time, on the address
// actually connected to, so a name that resolves differently the second time gets nowhere.

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
const PRIVATE = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['100.64.0.0', 10], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) PRIVATE.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) PRIVATE.addSubnet(net, bits, 'ipv6');

// An IPv4 address written as IPv6 ("::ffff:127.0.0.1", or "::ffff:7f00:1" as URLs write it).
function embeddedV4(ip: string): string | null {
  let s: string;
  try { s = new URL(`http://[${ip}]`).hostname.slice(1, -1); } catch { return null; }
  const m = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
  if (!m) return null;
  const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function privateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return PRIVATE.check(ip, 'ipv4');
  if (kind !== 6) return true; // not an address at all: refuse
  const v4 = embeddedV4(ip);
  return v4 ? PRIVATE.check(v4, 'ipv4') : PRIVATE.check(ip, 'ipv6');
}

// Name lookup for the connection itself: every address the name resolves to has to be public.
export function safeLookup(host: string, opts: LookupOptions, cb: (err: Error | null, address?: string | LookupAddress[], family?: number) => void) {
  lookupCb(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some(a => privateAddress(a.address))) return cb(new LinkError('bad_link', 'That link points at a private address.'));
    if (opts.all) cb(null, addrs); else cb(null, addrs[0].address, addrs[0].family);
  });
}

// fetch, on a connection whose address safeLookup approved. Redirects come back unfollowed.
const guardedFetch = ((input: URL | string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => new Promise<Response>((ok, no) => {
  const req = request(new URL(String(input)), { method: 'GET', headers: init?.headers, lookup: safeLookup as never, signal: init?.signal }, res => {
    const status = res.statusCode ?? 502;
    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const empty = (status >= 300 && status < 400) || status === 204 || status === 304;
    if (empty) res.resume();
    ok(new Response(empty ? null : (Readable.toWeb(res) as ReadableStream), { status, headers }));
  });
  req.on('error', no);
  req.end();
})) as unknown as typeof fetch;

async function publicHost(u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  let addrs: { address: string }[];
  try { addrs = await lookup(host, { all: true }); } catch { throw new LinkError('unreachable', 'Couldn’t find that calendar’s address.'); }
  if (!addrs.length || addrs.some(a => privateAddress(a.address))) throw new LinkError('bad_link', 'That link points at a private address.');
}

// The calendar's text. Redirects are followed by hand, a few at most, each one checked again.
export async function fetchFeed(raw: string, opts: { fetcher?: typeof fetch } = {}): Promise<string> {
  const get = opts.fetcher ?? guardedFetch;
  let u = feedUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    await publicHost(u);
    let r: Response;
    try {
      r = await get(u, { redirect: 'manual', headers: { accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'user-agent': 'Cueboard calendar reader' }, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      if (e instanceof LinkError) throw e;
      throw new LinkError('unreachable', 'Couldn’t reach that calendar. Check the link and try again.');
    }
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
