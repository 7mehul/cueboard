import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The server as attackers would meet it: real processes on spare ports, raw requests where a
// browser or fetch would tidy the request up first. Each case was a crash or a leak once.

const servers: ChildProcess[] = [];
// Each server builds the app into a folder of its own, so a watcher rebuilding dist/ can't collide,
// and keeps its key in a folder of its own, not the repo's data/.
const DIST = mkdtempSync(join(tmpdir(), 'cueboard-test-')), DATA = mkdtempSync(join(tmpdir(), 'cueboard-data-'));
after(() => { for (const s of servers) s.kill(); for (const d of [DIST, DATA]) rmSync(d, { recursive: true, force: true }); });

// A port the system says is free.
const freePort = () => new Promise<number>(ok => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });

// Whatever this terminal has set doesn't leak into the servers under test.
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CUE_|PORT$)/.test(k)));

async function start(port: number, args: string[], env: Record<string, string> = {}) {
  const p = spawn(process.execPath, ['scripts/serve.ts', String(port), '--fake-model', '--no-watch', ...args], { env: { ...clean, CUE_DIST: DIST, CUE_DATA_DIR: DATA, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(p);
  await new Promise<void>((ok, no) => {
    const t = setTimeout(() => no(new Error('server didn’t start')), 30_000);
    p.stdout!.on('data', (d: Buffer) => { if (/serving/.test(String(d))) { clearTimeout(t); ok(); } });
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

const LOCAL = await freePort(), LOCKED = await freePort();
const PASSWORD = randomBytes(15).toString('base64url');

test('local server: nothing on disk but the app, and bad requests are answered, not fatal', async () => {
  await start(LOCAL, []);
  for (const path of ['/.//etc/passwd', '/x/..//etc/hosts', '/%2e%2e//etc/hosts', '/.\\/etc/hosts', '/package.json', '/../package.json', '/data/local.key', '/.env']) {
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

test('a server other machines can reach won’t start without a good password', async () => {
  const exits = (env: Record<string, string>) => new Promise<string>(ok => {
    const p = spawn(process.execPath, ['scripts/serve.ts', '0', '--fake-model', '--no-watch'], { env: { ...clean, CUE_DIST: DIST, CUE_DATA_DIR: DATA, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr!.on('data', d => { err += d; });
    p.on('exit', code => ok(`${code} ${err}`));
    setTimeout(() => p.kill(), 15_000);
  });
  assert.match(await exits({ CUE_HOST: '0.0.0.0' }), /^1 .*set CUE_PASSWORD/s);
  assert.match(await exits({ CUE_HOST: '0.0.0.0', CUE_PASSWORD: '   ' }), /^1 .*set CUE_PASSWORD/s, 'a blank password is no password');
  assert.match(await exits({ CUE_HOST: '0.0.0.0', CUE_PASSWORD: 'hunter2' }), /^1 .*at least 12/s);
});

test('with a password: nothing without it, guesses are limited by the address the proxy saw, and signing out works', async () => {
  await start(LOCKED, ['--fake-calendar'], { CUE_PASSWORD: PASSWORD });
  const call = (path: string, init: RequestInit = {}) => fetch(`http://localhost:${LOCKED}${path}`, { ...init, redirect: 'manual', headers: { 'x-cueboard': '1', 'content-type': 'application/json', ...(init.headers as Record<string, string>) } });
  // Signed out: the sign-in page, never the app; the API refuses; anything else goes to the sign-in.
  const front = await (await fetch(`http://localhost:${LOCKED}/`)).text();
  assert.match(front, /type="password"/);
  assert.doesNotMatch(front, /board\.js|Load the demo week/);
  assert.equal((await call('/api/llm')).status, 401);
  assert.equal((await call('/api/granola/notes?after=2026-01-01')).status, 401);
  assert.equal((await call('/cueboard.html')).status, 302);
  assert.equal((await fetch(`http://localhost:${LOCKED}/healthz`)).status, 200, 'health checks need no password');

  const signIn = (password: string, xff: string) => call('/api/signin', { method: 'POST', headers: { 'x-forwarded-for': xff }, body: JSON.stringify({ password }) });
  const tries: number[] = [];
  for (let i = 0; i < 12; i++) tries.push((await signIn('not-the-password', `10.9.${i}.1, 203.0.113.7`)).status);
  assert.deepEqual(tries.slice(0, 10), Array(10).fill(401));
  assert.ok(tries.slice(10).every(c => c === 429), `made-up addresses before the proxy's don't help: ${tries.join(' ')}`);
  assert.equal((await call('/api/signin', { method: 'POST', headers: { 'x-cueboard': '0', 'x-forwarded-for': '203.0.113.8' }, body: JSON.stringify({ password: PASSWORD }) })).status, 403, 'only from the page');

  const ok = await signIn(PASSWORD, '203.0.113.8');
  assert.equal(ok.status, 200);
  const session = ok.headers.get('set-cookie')!.split(';')[0];
  assert.match(ok.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/);
  const as = { headers: { cookie: session } };
  assert.equal((await call('/api/llm', as)).status, 200);
  assert.deepEqual(await (await call('/api/session', as)).json(), { locked: true });
  assert.match(await (await call('/', as)).text(), /<html/);
  for (const path of ['/.//etc/passwd', '/%2e%2e//etc/hosts', '/data/local.key']) assert.match(await get(LOCKED, path, `Cookie: ${session}\r\n`), /^HTTP\/1\.1 404/, path);
  // Reached by a domain name, as behind a proxy: fine, with the password.
  assert.match(await raw(LOCKED, `GET /api/llm HTTP/1.1\r\nHost: cueboard.example.com\r\nx-cueboard: 1\r\nCookie: ${session}\r\nConnection: close\r\n\r\n`), /^HTTP\/1\.1 200/);
  const line = await get(LOCKED, `/oauth/google/callback?state=%C3%A9${'a'.repeat(23)}&code=x`, `Cookie: ${session}; cue_oauth=${'a'.repeat(24)}\r\n`);
  assert.match(line, /^HTTP\/1\.1 302/);
  const out = await call('/api/session', { method: 'DELETE', ...as });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie')!, /^cue_session=;.*Max-Age=0/);
});

test('without a password, any name but this machine’s gets told how to open it up', async () => {
  const line = await raw(LOCAL, `GET / HTTP/1.1\r\nHost: cueboard.example.com\r\nConnection: close\r\n\r\n`);
  assert.match(line, /^HTTP\/1\.1 403/);
  assert.deepEqual(await (await fetch(`http://localhost:${LOCAL}/api/session`, { headers: { 'x-cueboard': '1' } })).json(), { locked: false });
  assert.equal((await fetch(`http://localhost:${LOCAL}/api/signin`, { method: 'POST', headers: { 'x-cueboard': '1' }, body: '{}' })).status, 404);
});
