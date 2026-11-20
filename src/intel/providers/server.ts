import type { Found, JsonRequest, LLM } from '../llm.ts';
import { LLMError, validate } from '../llm.ts';

// A model reached through Cueboard's own server (scripts/serve.ts locally). The page sends the
// step's prompt; the server holds the credentials, picks the schema by step name and calls the
// model. Answers are validated again here, so a server can't hand the engine a malformed one.

export function serverModel(url = '/api/llm', name = 'server'): LLM {
  const call = async <T>(req: JsonRequest<T>) => {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cueboard': '1' },
          body: JSON.stringify({ step: req.step, system: req.system, prompt: req.prompt, effort: req.effort, maxTokens: req.maxTokens }),
        });
      } catch (e) {
        throw new LLMError('unavailable', (e as Error)?.message ?? 'The server can’t be reached');
      }
      const body = await res.json().catch(() => null) as { value?: unknown; found?: Found[]; usage?: { inputTokens: number; outputTokens: number }; error?: { code?: string; message?: string } } | null;
      if (!res.ok || !body || body.error) {
        const code = body?.error?.code;
        throw new LLMError(code === 'refusal' || code === 'invalid' || code === 'rate_limited' || code === 'unavailable' ? code : 'other', body?.error?.message ?? `The server answered ${res.status}`);
      }
      return { value: validate(req.schema, body.value), found: Array.isArray(body.found) ? body.found.filter(f => f && typeof f.url === 'string') : [], ...(body.usage ? { usage: body.usage } : {}) };
  };
  return {
    name,
    async json<T>(req: JsonRequest<T>) { const { found: _, ...r } = await call(req); return r; },
    // The server runs the search; the pages it found come back with the answer.
    research: call,
  };
}

// Whether the server has a model to offer, and which.
export async function serverStatus(url = '/api/llm'): Promise<{ available: boolean; chat?: boolean; model?: string }> {
  try {
    const res = await fetch(url, { headers: { 'x-cueboard': '1' } });
    if (!res.ok) return { available: false };
    return await res.json() as { available: boolean; chat?: boolean; model?: string };
  } catch {
    return { available: false };
  }
}
