import type { JsonRequest, LLM } from '../llm.ts';
import { LLMError, schemaInstructions, validate } from '../llm.ts';

// Claude inside a published Claude artifact: the page asks the viewer's own Claude account
// through the artifact runtime's `sample` capability, so no API key ever touches the page.
// That runtime has no schema parameter, so the schema goes in the prompt and is checked on return.

interface Sample {
  json(input: { role: 'user'; content: string }[], opts?: { modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean }): Promise<unknown>;
}

export function artifactModel(sample: Sample): LLM {
  return {
    name: 'claude-artifact',
    async json<T>(req: JsonRequest<T>) {
      let raw: unknown;
      try {
        raw = await sample.json([{ role: 'user', content: `${req.system}\n\n${req.prompt}\n\n${schemaInstructions(req.schema)}` }], {
          modelTier: req.effort === 'high' ? 'complex' : 'default',
          cache: false,
        });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        throw new LLMError(code === 'refused' ? 'refusal' : code === 'rate_limited' ? 'rate_limited' : 'unavailable', (e as Error)?.message ?? String(code));
      }
      return { value: validate(req.schema, raw) };
    },
  };
}
