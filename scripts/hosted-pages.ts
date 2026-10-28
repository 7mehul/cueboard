// The two pages the hosted test version serves besides the app: the invite page, and a usage
// table for whoever runs the test. Plain HTML; the invite page's script is the only script.
import type { TesterRow } from './gate.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const HEAD = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
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
h1,h2{font-family:'Familjen Grotesk',sans-serif;letter-spacing:-.01em;margin:0}
.card{background:var(--glass);border:1px solid var(--rim);border-radius:22px;box-shadow:var(--shade);backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4)}
.muted{color:var(--muted)}
</style>`;

export function joinPage(): string {
  return `${HEAD('Cueboard · test version')}
<style>
main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.card{width:100%;max-width:440px;padding:28px}
.mark{width:34px;height:34px;border-radius:10px;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font:700 17px 'Familjen Grotesk',sans-serif;margin-bottom:18px}
h1{font-size:26px;margin-bottom:6px}
form{display:flex;gap:8px;margin:20px 0 6px}
input{flex:1;min-width:0;font:inherit;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink)}
input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
button{font:inherit;font-weight:600;padding:11px 18px;border-radius:12px;border:0;background:var(--accent);color:var(--accent-ink);cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.err{color:var(--bad);min-height:22px;margin:0;font-size:14px}
ul{margin:18px 0 0;padding:16px 0 0 18px;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
li+li{margin-top:6px}
</style></head><body><main><div class="card">
<div class="mark" aria-hidden="true">C</div>
<h1>Cueboard</h1>
<p class="muted" style="margin:0">A private test version. Enter the invite code you were sent.</p>
<form id="f"><input id="code" name="code" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Invite code" aria-label="Invite code" required>
<button id="go" type="submit">Continue</button></form>
<p class="err" id="err" role="alert"></p>
<ul>
<li>Your boards and memory are saved in this browser only. Use the same browser each time; clearing its site data erases them.</li>
<li>Text you paste is sent to Anthropic’s Claude to be read. Cueboard’s server passes it on and doesn’t keep it.</li>
<li>The test counts what you do (boards made, the floating window opened) but never what’s in them.</li>
</ul>
</div></main>
<script>
const f = document.getElementById('f'), code = document.getElementById('code'), err = document.getElementById('err'), go = document.getElementById('go');
async function join(c) {
  err.textContent = ''; go.disabled = true;
  try {
    const r = await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cueboard': '1' }, body: JSON.stringify({ code: c.trim() }) });
    const b = await r.json().catch(() => null);
    if (r.ok) { location.replace('/'); return; }
    err.textContent = (b && b.error && b.error.message) || 'That didn’t work. Try again.';
  } catch (_) { err.textContent = 'Couldn’t reach Cueboard. Check your connection.'; }
  go.disabled = false; code.focus();
}
f.addEventListener('submit', e => { e.preventDefault(); if (code.value.trim()) join(code.value); });
// An invite link carries the code after #, which never reaches the server's logs. Take it out
// of the address bar before anything else.
function fromLink() {
  const c = decodeURIComponent(location.hash.slice(1));
  if (!c) return false;
  history.replaceState(null, '', location.pathname); code.value = c; join(c);
  return true;
}
addEventListener('hashchange', fromLink);
if (!fromLink()) code.focus();
</script></body></html>`;
}

export function adminPage(rows: TesterRow[], opts: { today: number; perTester: number; total: number; invited: string[] }): string {
  const when = (t: string) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
  const seen = new Set(rows.map(r => r.who));
  const never = opts.invited.filter(n => !seen.has(n));
  const body = rows.map(r => `<tr><th scope="row">${esc(r.who)}</th><td>${when(r.last)}</td><td>${r.days}</td><td>${r.boards}</td><td>${r.opened}</td><td>${r.float}</td><td>${r.saved}</td><td class="sb ${r.secondBoard.replace(' ', '-')}">${r.secondBoard}</td><td>${r.calls}</td><td>${Math.round(r.tokens / 1000).toLocaleString()}k</td></tr>`).join('');
  return `${HEAD('Cueboard · test usage')}
<style>
main{max-width:1100px;margin:0 auto;padding:32px 16px}
h1{font-size:28px}
.sub{margin:4px 0 20px}
.card{padding:6px 0;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}
th,td{padding:10px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left}
thead th{font-size:12.5px;font-weight:600;color:var(--muted);white-space:normal;vertical-align:bottom;min-width:64px}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
.sb.yes{color:#16794A;font-weight:600}.sb.no{color:var(--bad)}
@media (prefers-color-scheme:dark){.sb.yes{color:#5CD39B}}
.empty{padding:20px 16px;margin:0}
.note{font-size:13.5px;margin-top:14px}
</style></head><body><main>
<h1>Test usage</h1>
<p class="sub muted">Model calls today: ${opts.today} of ${opts.total} for everyone, ${opts.perTester} each. Times in UTC.</p>
<div class="card">${rows.length ? `<table><thead><tr><th scope="col">Tester</th><th scope="col">Last seen</th><th scope="col">Days used</th><th scope="col">Boards made</th><th scope="col">Boards opened</th><th scope="col">Float opened</th><th scope="col">Memory saves</th><th scope="col">2nd board ≤14 days</th><th scope="col">Model calls</th><th scope="col">Tokens</th></tr></thead><tbody>${body}</tbody></table>` : '<p class="empty muted">Nobody has used it yet.</p>'}</div>
${never.length ? `<p class="note muted">Invited, not used yet: ${never.map(esc).join(', ')}</p>` : ''}
<p class="note muted">“2nd board ≤14 days”: whether they made another board within 14 days of their first. That’s the test’s question.</p>
</main></body></html>`;
}
