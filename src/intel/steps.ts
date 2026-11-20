import type { Ctx } from '../facts.ts';
import type { NumberInfo } from '../compose.ts';
import type { LLM, Usage } from './llm.ts';
import { BOARD_LINE, MeetingBrief, Ranking } from './schemas.ts';
import { personaLibrary } from './knowledge.ts';
import { candidates, meetingContext } from './context.ts';
import { LIMITS, fits } from '../text.ts';

// The two reasoning steps. Prompts carry the judgment; the schemas keep answers usable.

const UNDERSTAND_SYSTEM = `You are the reasoning step inside Cueboard, which prepares one person for one specific meeting. Read what is known and work out what this meeting is and what would make it go well for them.

Rules:
- Use only the context given. Never invent facts about people, companies or numbers.
- The user's role decides whose side they are on. An investor evaluating a startup is not pitching; a partnerships lead is not selling to an end customer; a product lead in discovery is there to learn, not to sell.
- If the user stated a goal, set basis "stated" and keep it word for word; only if it is longer than a board line, shorten it to fit without changing what they want. Everything else you write (what decides it, the opener, the ask, the plan, the needs) serves that goal, even when the title or the history would suggest a different one.
- Otherwise, if the last meeting agreed a next step, the goal is to complete it (basis "agreed_next_step").
- Otherwise infer the most useful realistic goal for this step of their process (basis "inferred").
- Be specific to this meeting. "Build rapport" or "learn more" are not useful; "find out whether they can lead a $3M round" is.
- goal, decides, opener and ask go on the board as you write them, and are read at a glance in the middle of a meeting. Keep each to ${BOARD_LINE}, in plain words. Don't use shorthand from the user's documents (like "H2" or "OKR-3"); say what it stands for.
- opener: the first thing to say, tied to something specific about them or why now. If the user is there to learn or to evaluate, it opens the conversation; it doesn't pitch.
- ask: the one next step that moves toward the goal, specific enough to say yes to ("a second call with your CFO before month end", not "follow up").
- plan: how this meeting should run to reach the goal, as 3 or 4 parts in order. Start with "open" and end with "close"; put "learn" and "show" between them in the order that suits this meeting (hear their concerns before answering them; pitch before taking questions). Give each part a short name specific to this meeting, minutes that add up to the meeting length, and for learn and show one aim: what must be done before moving on. An aim is an instruction, never a fact about them. Always include the plan.
- needs: what the user must have in front of them, ordered by how much it changes the outcome. 3 to 6 items, each tied to something in the context or to a clear gap.
- unknowns: what is missing from the context but matters for the goal.

Here is what we know about the kinds of people who use Cueboard. Use it to reason about the user's situation; don't force the user into a persona that doesn't fit.

`;

const RANK_SYSTEM = `You are choosing what goes on a one-page board someone will glance at during a meeting. Space is tight: only what changes the outcome earns a place.

Score every candidate for this meeting, given the brief. The brief's goal is the test: what helps reach it scores high, what doesn't scores low, however interesting.
3 = must be in front of the user; 2 = useful; 1 = background; 0 = irrelevant to this meeting (it will be left off).
- Few candidates deserve a 3. Personal trivia, stale news and generic material are usually 0 or 1.
- For people, score how much they matter to the outcome.
- For numbers, prefer the side whose numbers the brief says matter.
- Questions you add must be questions, not statements, must not assume facts that aren't in the context, and must not repeat a candidate.

Return every candidate id exactly once.`;

export async function understand(llm: LLM, ctx: Ctx, infos: NumberInfo[]): Promise<{ brief: MeetingBrief; usage?: Usage }> {
  const r = await llm.json({
    step: 'understand',
    system: UNDERSTAND_SYSTEM + personaLibrary(),
    prompt: `${meetingContext(ctx, infos)}\n\nWork out what this meeting is and what the user needs. Answer as JSON.`,
    schema: MeetingBrief,
    effort: 'high',
  });
  const brief = r.value;
  // What the user said wins over what the model inferred.
  const stated = ctx.p.meeting.goal?.trim();
  // A goal that fits a board line stays word for word; a longer one keeps the model's shortening of it.
  if (stated) brief.goal = { ...brief.goal, text: fits(stated, LIMITS.line) || !brief.goal.text.trim() ? stated : brief.goal.text, basis: 'stated' };
  return { brief, usage: r.usage };
}

export async function rank(llm: LLM, ctx: Ctx, infos: NumberInfo[], brief: MeetingBrief): Promise<{ ranking: Ranking; usage?: Usage }> {
  const cands = candidates(ctx, infos);
  const r = await llm.json({
    step: 'rank',
    system: RANK_SYSTEM,
    prompt: `BRIEF\n${JSON.stringify(brief)}\n\nCANDIDATES\n${cands.map(c => `[${c.id}] ${c.text}`).join('\n')}\n\nScore them and add up to 4 questions. Answer as JSON.`,
    schema: Ranking,
    effort: 'medium',
  });
  // Ids the model made up are ignored; anything it skipped keeps the rules' ordering.
  const known = new Set(cands.map(c => c.id));
  const ranking = { ...r.value, items: r.value.items.filter(i => known.has(i.id)) };
  return { ranking, usage: r.usage };
}
