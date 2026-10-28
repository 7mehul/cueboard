import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { JsonRequest, LLM, TextRequest, Usage } from '../llm.ts';
import { LLMError, schemaInstructions, validate } from '../llm.ts';

// Claude through the official SDK, for Node (scripts, a server, the eval). Credentials come from
// the environment the way the SDK resolves them (ANTHROPIC_API_KEY, or a signed-in profile).
// Structured output keeps answers schema-valid; refusal fallback is on by default so a declined
// request is retried server-side on the model Anthropic recommends for that case.
// If the API won't compile a step's schema, that step asks for plain JSON instead, with the
// schema in the prompt, and the answer is validated here just the same.

export function claude(opts: { model?: string; client?: Anthropic } = {}): LLM {
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? process.env.CUE_MODEL ?? 'claude-opus-5-5';
  let fallbacks = true;
  const loose = new Set<string>();
  const system = (req: JsonRequest<unknown>) => [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }];

  type Mode = <T>(req: JsonRequest<T>, withFallbacks: boolean) => Promise<{ value: T; usage: Usage }>;

  const strict: Mode = async (req, withFallbacks) => {
    const base = {
      model, max_tokens: req.maxTokens ?? 16000, system: system(req),
      messages: [{ role: 'user' as const, content: req.prompt }],
      output_config: { effort: req.effort ?? 'high', format: betaZodOutputFormat(req.schema) },
    };
    const res = withFallbacks
      ? await client.beta.messages.parse({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.beta.messages.parse(base);
    stopped(res.stop_reason, res.stop_details?.category);
    if (res.parsed_output == null) throw new LLMError('invalid', 'The answer didn’t match the schema');
    return { value: res.parsed_output, usage: usageOf(res.usage) };
  };

  const plain: Mode = async (req, withFallbacks) => {
    const base = {
      model, max_tokens: req.maxTokens ?? 16000, system: system(req),
      messages: [{ role: 'user' as const, content: `${req.prompt}\n\n${schemaInstructions(req.schema)}` }],
      output_config: { effort: req.effort ?? 'high' },
    };
    const res = withFallbacks
      ? await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.beta.messages.create(base);
    stopped(res.stop_reason, res.stop_details?.category);
    const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('');
    return { value: validate(req.schema, parseJson(text)), usage: usageOf(res.usage) };
  };

  async function attempt<T>(mode: Mode, req: JsonRequest<T>): Promise<{ value: T; usage: Usage }> {
    try {
      return await mode(req, fallbacks);
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      // The schema is too large or complex to compile into a grammar: ask for plain JSON instead.
      if (mode === strict && /grammar|schema/i.test(e.message)) { loose.add(req.step); return attempt(plain, req); }
      // Maybe this account or model doesn't take server-side fallback; drop it once that's shown to help.
      if (fallbacks) { const r = await mode(req, false); fallbacks = false; return r; }
      throw e;
    }
  }

  async function chat(req: TextRequest, withFallbacks: boolean) {
    const base = {
      model, max_tokens: req.maxTokens ?? 16000,
      ...(req.system ? { system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }] } : {}),
      messages: req.messages,
      output_config: { effort: req.effort ?? 'medium' },
    };
    const res = withFallbacks
      ? await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.beta.messages.create(base);
    stopped(res.stop_reason, res.stop_details?.category);
    return { text: res.content.map(b => (b.type === 'text' ? b.text : '')).join(''), usage: usageOf(res.usage) };
  }

  return {
    name: `claude:${model}`,
    async json<T>(req: JsonRequest<T>) {
      try {
        return await attempt(loose.has(req.step) ? plain : strict, req);
      } catch (e) {
        throw e instanceof LLMError ? e : toLLMError(e);
      }
    },
    async text(req: TextRequest) {
      try {
        try { return await chat(req, fallbacks); }
        catch (e) {
          if (!(fallbacks && e instanceof Anthropic.BadRequestError)) throw e;
          const r = await chat(req, false); fallbacks = false; return r;
        }
      } catch (e) {
        throw e instanceof LLMError ? e : toLLMError(e);
      }
    },
  };
}

function stopped(reason: string | null, category?: string | null) {
  if (reason === 'refusal') throw new LLMError('refusal', `Declined (${category ?? 'no category'})`);
  if (reason === 'max_tokens') throw new LLMError('invalid', 'The answer was cut off');
}

function usageOf(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): Usage {
  return { inputTokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), outputTokens: u.output_tokens };
}

// The JSON object in a plain-text answer, with or without a code fence around it.
export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new LLMError('invalid', 'The answer had no JSON in it');
  try { return JSON.parse(t.slice(start, end + 1)); } catch { throw new LLMError('invalid', 'The answer’s JSON didn’t parse'); }
}

function toLLMError(e: unknown): LLMError {
  if (e instanceof Anthropic.RateLimitError) return new LLMError('rate_limited', e.message);
  if (e instanceof Anthropic.AuthenticationError) return new LLMError('unavailable', 'No valid Claude credentials');
  if (e instanceof Anthropic.APIConnectionError) return new LLMError('unavailable', e.message);
  if (e instanceof Anthropic.APIError) return new LLMError('other', `${e.status}: ${e.message}`);
  return new LLMError('other', (e as Error)?.message ?? String(e));
}
