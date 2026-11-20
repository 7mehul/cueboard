import type { JsonRequest, LLM } from '../llm.ts';
import { LLMError, validate } from '../llm.ts';

// A stand-in model for tests: answers come from functions, keyed by step. Answers still go
// through schema validation, so tests exercise the same path a real model's answers take.

export type Script = Record<string, (req: JsonRequest<unknown>) => unknown>;

export function scripted(script: Script, name = 'scripted'): LLM & { calls: { step: string; prompt: string }[] } {
  const calls: { step: string; prompt: string }[] = [];
  return {
    name,
    calls,
    async json<T>(req: JsonRequest<T>) {
      calls.push({ step: req.step, prompt: req.prompt });
      const answer = script[req.step];
      if (!answer) throw new LLMError('unavailable', `No scripted answer for ${req.step}`);
      return { value: validate(req.schema, answer(req as JsonRequest<unknown>)) };
    },
    // A scripted research answer is { value, found }: the reading and the pages "searched".
    ...(script.research ? {
      async research<T>(req: JsonRequest<T>) {
        calls.push({ step: req.step, prompt: req.prompt });
        const r = script.research(req as JsonRequest<unknown>) as { value: unknown; found: { url: string }[] };
        return { value: validate(req.schema, r.value), found: r.found };
      },
    } : {}),
  };
}
