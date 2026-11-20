import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { randomBytes } from 'node:crypto';

// The server as attackers would meet it: real processes on spare ports, raw requests where a
// browser or fetch would tidy the request up first. Each case was a crash or a leak once.

const servers: ChildProcess[] = [];
after(() => { for (const s of servers) s.kill(); });

async function start(port: number, args: string[], env: Record<string, string> = {}) {
  const p = spawn(process.execPath, ['scripts/serve.ts', String(port), '--fake-model', '--no-watch', ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(p);
  await new Promise<void>((ok, no) => {
    const t = setTimeout(() => no(new Error('server didn’t start')), 30_000);
    p.stdout!.on('data', (d: Buffer) => { if (/serving|hosted test version/.test(String(d))) { clearTimeout(t); ok(); } });
    p.on('exit', code => no(new Error(`server exited ${code}`)));
  });
  return p;
}

// Bytes on a socket, exactly as written; the reply's status line, or '' if the server hung up.
function raw(port: number, text: string, { hangUp = false } = {}): Promise<string> {
  return new Promise(ok => {
    const s = connect(port, '127.0.0.1', () => { s.write(text); if (hangUp) setTimeout(() => s.destroy(), 50); });
    let out = '';
    s.on('data', d => { out += d; });
    s.on('close', () => ok(out.split('\r\n')[0] ?? ''));
    s.on('error', () => ok(''));
    setTimeout(() => s.destroy(), 3000);
  });
}
const get = (port: number, path: string, headers = '') => raw(port, `GET ${path} HTTP/1.1\r\nHost: localhost:${port}\r\n${headers}Connection: close\r\n\r\n`);
const alive = async (port: number) => (await get(port, '/healthz-or-page')).length > 0 && (await fetch(`http://localhost:${port}/`)).status === 200;

const LOCAL = 5391 + Math.floor(Math.random() * 50), HOSTED = LOCAL + 100;
const CODE = 'tester-' + randomBytes(9).toString('base64url');

test('local server: nothing on disk but the app, and bad requests are answered, not fatal', async () => {
  await start(LOCAL, []);
  for (const path of ['/.//etc/passwd', '/x/..//etc/hosts', '/%2e%2e//etc/hosts', '/.\\/etc/hosts', '/package.json', '/../package.json', '/deploy/local.env']) {
    const line = await get(LOCAL, path);
    assert.match(line, /^HTTP\/1\.1 (404|400)/, path);
  }
  assert.match(await raw(LOCAL, 'GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'), /^HTTP\/1\.1 400/);
  // A body cut off halfway: the request dies, the server doesn't.
  await raw(LOCAL, `POST /api/llm HTTP/1.1\r\nHost: localhost:${LOCAL}\r\nx-cueboard: 1\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{"step":"re`, { hangUp: true });
  assert.ok(await alive(LOCAL), 'still serving');
});

test('local server: only this machine’s own name, and only real step names', async () => {
  // A page that rebinds its own domain to 127.0.0.1 arrives with its own Host.
  assert.match(await get(LOCAL, '/api/llm', 'x-cueboard: 1\r\n'), /^HTTP\/1\.1 200/);
  assert.match(await raw(LOCAL, `GET /api/llm HTTP/1.1\r\nHost: rebind.attacker.example:${LOCAL}\r\nx-cueboard: 1\r\nConnection: close\r\n\r\n`), /^HTTP\/1\.1 403/);
  for (const step of ['__proto__', 'constructor', 'toString']) {
    const r = await fetch(`http://localhost:${LOCAL}/api/llm`, { method: 'POST', headers: { 'x-cueboard': '1', 'content-type': 'application/json' }, body: JSON.stringify({ step, system: 's', prompt: 'p' }) });
    assert.equal(r.status, 400, step);
  }
  const r = await fetch(`http://localhost:${LOCAL}/api/llm`, { method: 'POST', headers: { 'x-cueboard': '1', 'content-type': 'application/json' }, body: JSON.stringify({ step: 'understand', system: 's', prompt: 'p', effort: 'max-please' }) });
  assert.equal(r.status, 400, 'unknown effort');
});

test('hosted server: invite tries can’t be spread over made-up addresses, and a crafted OAuth state isn’t fatal', async () => {
  await start(HOSTED, ['--hosted', '--fake-calendar'], { PORT: '', CUE_SECRET: randomBytes(24).toString('hex'), CUE_INVITES: `tester:${CODE}`, CUE_ADMINS: '' });
  const join = (code: string, xff: string) => fetch(`http://localhost:${HOSTED}/api/join`, { method: 'POST', headers: { 'x-cueboard': '1', 'content-type': 'application/json', 'x-forwarded-for': xff }, body: JSON.stringify({ code }) });
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) codes.push((await join('wrong-code-12345', `10.9.${i}.1, 203.0.113.7`)).status);
  assert.ok(codes.slice(10).every(c => c === 429), `the address the proxy saw is what counts: ${codes.join(' ')}`);

  const ok = await join(CODE, '203.0.113.8');
  assert.equal(ok.status, 200);
  const session = ok.headers.get('set-cookie')!.split(';')[0];
  for (const path of ['/.//etc/passwd', '/%2e%2e//etc/hosts']) assert.match(await get(HOSTED, path, `Cookie: ${session}\r\n`), /^HTTP\/1\.1 404/, path);
  const line = await get(HOSTED, `/oauth/google/callback?state=%C3%A9${'a'.repeat(23)}&code=x`, `Cookie: ${session}; cue_oauth=${'a'.repeat(24)}\r\n`);
  assert.match(line, /^HTTP\/1\.1 302/);
  assert.match(await get(HOSTED, '/api/llm', `Cookie: ${session}\r\nx-cueboard: 1\r\n`), /^HTTP\/1\.1 200/, 'still serving');
});
