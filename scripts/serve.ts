// Serve dist/ on this machine only, rebuild the app when its sources change, and run model steps
// for the page with the credentials in this terminal, so no key ever reaches the browser.
// Usage: node scripts/serve.ts [port] [--fake-model]
//   With ANTHROPIC_API_KEY (or a signed-in profile) set, the page gets Claude (CUE_MODEL to pick).
//   --fake-model answers for the sample documents only, for trying the app without credentials.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from '../src/intel/schemas.ts';
import { LLMError } from '../src/intel/llm.ts';
import type { LLM } from '../src/intel/llm.ts';

const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a))) || 5180;
const dist = new URL('../dist/', import.meta.url);
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

let llm: LLM | null = null;
if (args.includes('--fake-model')) llm = (await import('../scenarios/fake-model.ts')).fakeModel();
else if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) {
  llm = (await import('../src/intel/providers/claude.ts')).claude();
}

spawn(process.execPath, [fileURLToPath(new URL('./build-app.ts', import.meta.url)), '--watch'], { stdio: 'inherit' });

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
};
async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) return null; chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString('utf8');
}

// Model steps, for this page only: the request has to come from the page served here, with the
// header a cross-site form or image can't send, so other sites can't spend this key.
async function api(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (req.headers['x-cueboard'] !== '1' || (origin && !origins.has(origin))) { send(res, 403, { error: { code: 'other', message: 'Not allowed' } }); return; }
  if (req.method === 'GET') { send(res, 200, { available: !!llm, ...(llm ? { model: llm.name } : {}) }); return; }
  if (req.method !== 'POST') { send(res, 405, { error: { code: 'other', message: 'Use POST' } }); return; }
  if (!llm) { send(res, 503, { error: { code: 'unavailable', message: 'No model: start the server with ANTHROPIC_API_KEY set' } }); return; }
  const raw = await readBody(req, 2_000_000);
  let body: { step?: string; system?: string; prompt?: string; effort?: 'low' | 'medium' | 'high'; maxTokens?: number } | null = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  const schema = body?.step ? SCHEMAS[body.step as keyof typeof SCHEMAS] : undefined;
  if (!body || !schema || typeof body.system !== 'string' || typeof body.prompt !== 'string') { send(res, 400, { error: { code: 'other', message: 'Unknown step or missing prompt' } }); return; }
  const t0 = Date.now();
  try {
    const r = await llm.json({ step: body.step!, system: body.system, prompt: body.prompt, schema: schema as never, ...(body.effort ? { effort: body.effort } : {}), ...(body.maxTokens ? { maxTokens: body.maxTokens } : {}) });
    console.log(`${body.step} · ${((Date.now() - t0) / 1000).toFixed(1)}s${r.usage ? ` · ${(r.usage.inputTokens + r.usage.outputTokens).toLocaleString()} tokens` : ''}`);
    send(res, 200, { value: r.value, ...(r.usage ? { usage: r.usage } : {}) });
  } catch (e) {
    const err = e instanceof LLMError ? { code: e.code, message: e.message } : { code: 'other', message: (e as Error).message };
    console.log(`${body.step} failed · ${err.code}: ${err.message}`);
    send(res, 502, { error: err });
  }
}

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/api/llm') { await api(req, res); return; }
  const file = path === '/' ? 'cueboard.html' : path.slice(1);
  if (file.includes('..')) { res.writeHead(400).end(); return; }
  try {
    const body = await readFile(new URL(file, dist));
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`serving http://localhost:${port} · model: ${llm ? llm.name : 'none (rules only; set ANTHROPIC_API_KEY for Claude)'}`));
