import type { LLM } from '../src/intel/llm.ts';
import { LLMError } from '../src/intel/llm.ts';
import { scripted } from '../src/intel/providers/scripted.ts';
import { STORY, bindKnown } from './docs.ts';

// A stand-in model for trying the app without credentials (node scripts/serve.ts --fake-model).
// It only knows the story documents in scenarios/docs.ts: paste one of those and it answers as a
// good model would; anything else, and the meeting steps, fall back to the rules.

// The ids memory gave the story's people and promises, read back from the prompt's KNOWN lists.
function knownIn(prompt: string) {
  const line = (re: RegExp) => prompt.split('\n').find(l => /^- \[/.test(l) && re.test(l))?.match(/^- \[([^\]]+)\]/)?.[1];
  return { maya: line(/Maya Chen/), ben: line(/Ben Okoro/), larkspur: line(/^- \[co-[^\]]*\] Larkspur/), cohort: line(/cohort/i), 'intro-ben': line(/Introduce.*Ben/i) };
}

export function fakeModel(): LLM {
  return scripted({
    extract: req => {
      const s = STORY.find(x => req.prompt.includes(x.doc.text.trim()));
      if (!s) throw new LLMError('unavailable', 'The fake model only knows the sample documents');
      return bindKnown(s.ideal, knownIn(req.prompt));
    },
    understand: () => { throw new LLMError('unavailable', 'The fake model leaves the meeting to the rules'); },
  }, 'fake');
}
