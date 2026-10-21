import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { JsonRequest, LLM } from '../llm.ts';
import { LLMError } from '../llm.ts';

// Claude through the official SDK, for Node (scripts, a server, the eval). Credentials come from
// the environment the way the SDK resolves them (ANTHROPIC_API_KEY, or a signed-in profile).
// Structured output keeps answers schema-valid; refusal fallback is on by default so a declined
// request is retried server-side on the model Anthropic recommends for that case.

export function claude(opts: { model?: string; client?: Anthropic } = {}): LLM {
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? process.env.CUE_MODEL ?? 'claude-opus-5-5';
  let fallbacks = true;

  async function call<T>(req: JsonRequest<T>, withFallbacks: boolean) {
    const base = {
      model,
      max_tokens: req.maxTokens ?? 16000,
      system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user' as const, content: req.prompt }],
      output_config: { effort: req.effort ?? 'high', format: betaZodOutputFormat(req.schema) },
    };
    return withFallbacks
      ? client.beta.messages.parse({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : client.beta.messages.parse(base);
  }

  return {
    name: `claude:${model}`,
    async json<T>(req: JsonRequest<T>) {
      let res;
      try {
        res = await call(req, fallbacks);
      } catch (e) {
        // If this account or model doesn't accept server-side fallback, carry on without it.
        if (fallbacks && e instanceof Anthropic.BadRequestError) {
          fallbacks = false;
          try { res = await call(req, false); } catch (e2) { throw toLLMError(e2); }
        } else throw toLLMError(e);
      }
      if (res.stop_reason === 'refusal') throw new LLMError('refusal', `Declined (${res.stop_details?.category ?? 'no category'})`);
      if (res.stop_reason === 'max_tokens') throw new LLMError('invalid', 'The answer was cut off');
      if (res.parsed_output == null) throw new LLMError('invalid', 'The answer didn’t match the schema');
      return {
        value: res.parsed_output as T,
        usage: { inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0), outputTokens: res.usage.output_tokens },
      };
    },
  };
}

function toLLMError(e: unknown): LLMError {
  if (e instanceof Anthropic.RateLimitError) return new LLMError('rate_limited', e.message);
  if (e instanceof Anthropic.AuthenticationError) return new LLMError('unavailable', 'No valid Claude credentials');
  if (e instanceof Anthropic.APIConnectionError) return new LLMError('unavailable', e.message);
  if (e instanceof Anthropic.APIError) return new LLMError('other', `${e.status}: ${e.message}`);
  return new LLMError('other', (e as Error)?.message ?? String(e));
}
