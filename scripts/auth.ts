// One password in front of a self-hosted Cueboard. Anywhere other machines can reach it (a server,
// a home box, a container), anyone who found the address could otherwise spend your Anthropic key
// and read your Granola notes. On your own computer, answering only this machine, it's off.
// A browser that signs in gets a signed cookie for 30 days; changing the password signs every
// browser out.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { privateAddress } from './calendar-link.ts';

export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 12;

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');
// What's signed includes the password's fingerprint, so a new password ends the old sessions.
const fingerprint = (password: string) => digest('cueboard/password/' + password).toString('base64url');

export function passwordMatches(given: unknown, password: string): boolean {
  if (typeof given !== 'string' || !given || given.length > 1000 || !password) return false;
  return timingSafeEqual(digest(given), digest(password));
}

export function sessionToken(secret: string, password: string, now = Date.now()): string {
  const ts = String(Math.floor(now / 1000));
  return `${ts}.${sign(`${ts}.${fingerprint(password)}`, secret)}`;
}

export function sessionValid(token: string | null, secret: string, password: string, now = Date.now()): boolean {
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!m || !password) return false;
  const want = Buffer.from(sign(`${m[1]}.${fingerprint(password)}`, secret)), got = Buffer.from(m[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  const age = now / 1000 - Number(m[1]);
  return age >= -300 && age <= SESSION_DAYS * 86400;
}

export function cookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Who is trying the password, for the limiter. Behind a proxy (which connects from this machine or
// a private network) it's the address the proxy saw: the last X-Forwarded-For entry, since anything
// before it came from the client. Reached directly, only the connection's own address is trusted.
export function clientAddress(peer: string | undefined, forwarded: string | string[] | undefined): string {
  const p = peer ?? '?';
  if (!privateAddress(p)) return p;
  const last = String(forwarded ?? '').split(',').map(x => x.trim()).filter(Boolean).at(-1);
  return last || p;
}

// At most `max` tries per key in `windowMs`, so a password can't be guessed by trying.
export class Limiter {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs: number) { this.max = max; this.windowMs = windowMs; }
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    // Kept small: stale keys go first, then the oldest, so a flood of addresses can't grow it.
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some(t => now - t < this.windowMs)) this.hits.delete(k);
      for (const k of this.hits.keys()) { if (this.hits.size <= 4000) break; this.hits.delete(k); }
    }
    return true;
  }
}

// The page a browser sees until it has signed in. Plain HTML; its one script sends the password.
export function signInPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Cueboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap">
<style>
:root{--ink:#13161B;--muted:#596371;--line:#D4D9E0;--accent:#2B50CF;--accent-ink:#fff;--bad:#B4232F;
  --ground:#EEF1F6;--glass:rgba(255,255,255,.72);--rim:rgba(255,255,255,.9);--shade:0 18px 50px rgba(30,40,70,.14);
  --amb-1:rgba(118,146,255,.22);--amb-2:rgba(255,168,128,.18);--amb-3:rgba(110,214,190,.14);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--ink:#E8ECF1;--muted:#9BA5B1;--line:#323942;--accent:#819DFF;--accent-ink:#0B1020;--bad:#F27D89;
  --ground:#111318;--glass:rgba(34,37,44,.66);--rim:rgba(255,255,255,.12);--shade:0 18px 50px rgba(0,0,0,.4);
  --amb-1:rgba(98,118,255,.18);--amb-2:rgba(214,110,170,.10);--amb-3:rgba(60,190,170,.08);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font:15px/1.5 'Hanken Grotesk',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--ink);
  background:radial-gradient(60% 50% at 15% 10%,var(--amb-1),transparent 70%),radial-gradient(50% 45% at 90% 20%,var(--amb-2),transparent 70%),
  radial-gradient(60% 50% at 50% 100%,var(--amb-3),transparent 70%),var(--ground);-webkit-font-smoothing:antialiased}
main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.card{width:100%;max-width:420px;padding:28px;background:var(--glass);border:1px solid var(--rim);border-radius:22px;box-shadow:var(--shade);backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4)}
.mark{width:34px;height:34px;border-radius:10px;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font:700 17px 'Familjen Grotesk',sans-serif;margin-bottom:18px}
h1{font:700 26px 'Familjen Grotesk',sans-serif;letter-spacing:-.01em;margin:0 0 6px}
.muted{color:var(--muted);margin:0}
form{display:flex;gap:8px;margin:20px 0 6px}
input{flex:1;min-width:0;font:inherit;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink)}
input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
button{font:inherit;font-weight:600;padding:11px 18px;border-radius:12px;border:0;background:var(--accent);color:var(--accent-ink);cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.err{color:var(--bad);min-height:22px;margin:0;font-size:14px}
</style></head><body><main><div class="card">
<div class="mark" aria-hidden="true">C</div>
<h1>Cueboard</h1>
<p class="muted">Enter this Cueboard’s password.</p>
<form id="f"><input id="pw" type="password" name="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required>
<button id="go" type="submit">Sign in</button></form>
<p class="err" id="err" role="alert"></p>
</div></main>
<script>
const f = document.getElementById('f'), pw = document.getElementById('pw'), err = document.getElementById('err'), go = document.getElementById('go');
// A password sent over plain http to another machine can be read on the way.
const local = /^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname);
if (location.protocol === 'http:' && !local) err.textContent = 'This connection isn’t encrypted, so the password could be read on the way. Put Cueboard behind HTTPS.';
f.addEventListener('submit', async e => {
  e.preventDefault();
  err.textContent = ''; go.disabled = true;
  try {
    const r = await fetch('/api/signin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cueboard': '1' }, body: JSON.stringify({ password: pw.value }) });
    const b = await r.json().catch(() => null);
    if (r.ok) { location.reload(); return; }
    err.textContent = (b && b.error && b.error.message) || 'That didn’t work. Try again.';
  } catch (_) { err.textContent = 'Couldn’t reach Cueboard. Check your connection.'; }
  go.disabled = false; pw.select();
});
pw.focus();
</script></body></html>`;
}
