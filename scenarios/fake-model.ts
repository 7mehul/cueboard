import type { LLM } from '../src/intel/llm.ts';
import { LLMError } from '../src/intel/llm.ts';
import { scripted } from '../src/intel/providers/scripted.ts';
import { toAnswer } from '../src/intel/schemas.ts';
import { STORY, bindKnown } from './docs.ts';
import { demoAnswer, demoBrief, demoRanking, demoResearch } from './demo.ts';

// A stand-in model for trying the app without credentials (node scripts/serve.ts --fake-model).
// It only knows the story documents in scenarios/docs.ts and the demo week's (scenarios/demo.ts):
// paste one of those and it answers as a good model would, and the demo week's meetings are read
// with a goal and a plan; anything else falls back to the rules.

// The ids memory gave the story's people and promises, read back from the prompt's KNOWN lists.
function knownIn(prompt: string) {
  const line = (re: RegExp) => prompt.split('\n').find(l => /^- \[/.test(l) && re.test(l))?.match(/^- \[([^\]]+)\]/)?.[1];
  return { maya: line(/Maya Chen/), ben: line(/Ben Okoro/), larkspur: line(/^- \[co-[^\]]*\] Larkspur/), cohort: line(/cohort/i), 'intro-ben': line(/Introduce.*Ben/i) };
}

export function fakeModel(): LLM {
  const llm = scripted({
    extract: req => {
      const d = demoAnswer(req.prompt);
      if (d) return toAnswer(d);
      const s = STORY.find(x => req.prompt.includes(x.doc.text.trim()));
      if (!s) throw new LLMError('unavailable', 'The fake model only knows the sample documents');
      return toAnswer(bindKnown(s.ideal, knownIn(req.prompt)));
    },
    // The demo week's meetings are read as a good model would; any other meeting is left to the rules.
    understand: req => demoBrief(req.prompt) ?? (() => { throw new LLMError('unavailable', 'The fake model leaves this meeting to the rules'); })(),
    rank: req => demoRanking(req.prompt) ?? (() => { throw new LLMError('unavailable', 'The fake model leaves this meeting to the rules'); })(),
    research: req => demoResearch(req.prompt) ?? (() => { throw new LLMError('unavailable', 'The fake model can’t search the web'); })(),
  }, 'fake');
  // The board assistant gets a polite stand-in reply, so the panel can be tried end to end.
  return {
    ...llm,
    text: async () => ({ text: JSON.stringify({ reply: 'This is the demo’s stand-in for Claude, so I can’t read your board. To use Claude: run ant auth login in a terminal, then npx cueboard, and Claude answers here.', actions: [] }) }),
  };
}
