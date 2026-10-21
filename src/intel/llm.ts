import * as z from 'zod/v4';

// The one thing the engine needs from a model: a JSON answer that matches a schema.
// Providers (Claude API, Claude inside an artifact, a scripted stand-in for tests) implement
// this; the engine never knows which one it's talking to.

export type Effort = 'low' | 'medium' | 'high';

export interface JsonRequest<T> {
  step: string; // "understand", "rank", "write"; used for tracing and scripted tests
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

export interface Usage { inputTokens: number; outputTokens: number }

export interface LLM {
  name: string;
  json<T>(req: JsonRequest<T>): Promise<{ value: T; usage?: Usage }>;
}

export type LLMErrorCode = 'refusal' | 'invalid' | 'unavailable' | 'rate_limited' | 'other';

export class LLMError extends Error {
  code: LLMErrorCode;
  constructor(code: LLMErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// For providers without native structured output: the schema goes into the prompt as JSON Schema
// and the answer is validated on the way back.
export function schemaInstructions(schema: z.ZodType): string {
  return `Reply with ONLY a JSON object matching this JSON Schema, no other text:\n${JSON.stringify(z.toJSONSchema(schema))}`;
}

export function validate<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new LLMError('invalid', `Answer didn't match the schema: ${r.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data;
}
