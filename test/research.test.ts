import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoMemory, demoResearch, demoWorld } from '../scenarios/demo.ts';
import { syncCalendar } from '../src/memory/calendar.ts';
import { applyResearch, researchFind, researchMeeting, researchPlan, researchPrompt, researchSave } from '../src/memory/research.ts';
import { packetFor } from '../src/memory/packet.ts';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import { toCanvas } from '../src/export.ts';
import { scripted } from '../src/intel/providers/scripted.ts';
import type { Memory } from '../src/memory/types.ts';
import type { Research } from '../src/intel/schemas.ts';

process.env.TZ = 'America/New_York';
const NOW = new Date('2026-10-29T13:10:00-04:00'), now = NOW.toISOString();
const world = demoWorld(NOW);
const synced = (): Memory => syncCalendar(demoMemory(NOW), world.events, { now, from: new Date(NOW.getTime() - 14 * 864e5).toISOString(), to: new Date(NOW.getTime() + 14 * 864e5).toISOString() }).memory;
const meeting = (m: Memory, title: RegExp) => m.meetings.find(x => title.test(x.title))!;
const llm = () => scripted({ research: req => demoResearch(req.prompt, NOW) });

test('who gets looked up: confirmed people from outside, with a full name, and their company', () => {
  const m = synced();
  const plan = researchPlan(m, meeting(m, /Northwind/).id, now)!;
  assert.deepEqual(plan.people.map(p => [p.ref, p.name, p.companyRef]), [['p1', 'Priya Raman', 'c1']]);
  assert.deepEqual(plan.companies.map(c => [c.ref, c.name, c.domain]), [['c1', 'Northwind Logistics', 'northwind.example']]);
  const prompt = researchPrompt(m, plan, now);
  assert.match(prompt, /- \[p1\] Priya Raman, priya\.raman@northwind\.example, at Northwind Logistics/);
  assert.match(prompt, /KNOWN \(don’t repeat\)\n- Runs field operations at Northwind Logistics/, 'what memory knows, so it isn’t found again');
  assert.equal(researchPlan(m, meeting(m, /Coffee with Lena/).id, now), null, 'a meeting that’s over isn’t researched');
});

test('only what holds up is kept: a page the search returned, a fitting topic, news with a recent date', async () => {
  const m = synced();
  const id = meeting(m, /Northwind/).id;
  const r = (await researchMeeting(m, id, now, llm()))!;
  assert.equal(r.added, 4);
  assert.deepEqual(r.dropped.map(d => [d.text, d.why]), [['Said to be raising a Series B', 'its page wasn’t in the search results']]);
  const web = r.memory.facts.filter(f => f.id.startsWith('f-web-'));
  assert.deepEqual(web.map(f => [f.subject.kind, f.topic, f.text]), [
    ['person', 'background', 'Ran dispatch at a regional 3PL for six years'],
    ['person', 'interest', 'Writes about giving reps back admin time'],
    ['company', 'company', 'Midwest freight carrier with 14 depots'],
    ['company', 'news', 'Opened a Reno hub, its first in the West'],
  ]);
  const src = r.memory.sources.find(s => s.id === web[3].sourceIds[0])!;
  assert.deepEqual([src.kind, src.url, src.ownerId], ['web', 'https://freightnews.example/northwind-reno', undefined], 'public, with its page');
  assert.equal(web[2].sourceIds.length, 1, 'a trailing slash on either side still matches the page');

  // Looked up once a month: asking again finds nobody to look up.
  assert.equal(researchPlan(r.memory, id, now), null);
  assert.equal(await researchMeeting(r.memory, id, now, llm()), null);
});

test('the rest of the rules hold too', () => {
  const m = synced();
  const plan = researchPlan(m, meeting(m, /Northwind/).id, now)!;
  const found = [{ url: 'https://northwind.example/a' }];
  type F = Research['findings'][number];
  const a = (over: Partial<F>): F => ({ about: 'p1', topic: 'background', text: 'Something true', url: 'https://northwind.example/a', published: '', ...over });
  const r = applyResearch(m, plan, { findings: [
    a({ about: 'p9' }),
    a({ topic: 'news' }),
    a({ about: 'c1', topic: 'news', published: '2025-01-02' }),
    a({ topic: 'company' }),
    a({ text: 'Runs field operations at Northwind Logistics' }),
    a({ text: 'Kept' }),
  ] }, found, now);
  assert.deepEqual(r.dropped.map(d => d.why), [
    'not about anyone in the meeting', 'a news finding isn’t about a person', 'news without a recent date', 'a company finding isn’t about a person', 'already known',
  ]);
  assert.equal(r.added, 1);
});

test('the first Northwind board says who Priya is and what’s new, each line with its page', async () => {
  const m = (await researchMeeting(synced(), meeting(synced(), /Northwind/).id, now, llm()))!.memory;
  const p = packetFor(m, meeting(m, /Northwind/).id, now)!;
  const b = buildBoard(p);
  assert.deepEqual(checkBoard(b, p), []);
  const lines = b.blocks.flatMap(x => x.lines.map(l => ({ t: l.text, s: l.sourceIds })));
  for (const t of ['Ran dispatch at a regional 3PL for six years', 'Opened a Reno hub, its first in the West']) assert.ok(lines.some(l => l.t === t), t);
  const cites = toCanvas(b, p).elements.flatMap(e => ('lines' in e ? e.lines : []).flatMap(l => l.cite ?? []));
  assert.ok(cites.some(c => c.label === 'freightnews.example/northwind-reno' && c.url === 'https://freightnews.example/northwind-reno'));
  assert.ok(!lines.some(l => /Series B/.test(l.t)), 'never the claim the search didn’t back');
});

test('a search that fails is logged and tried again tomorrow, not on every refresh', async () => {
  const m = synced();
  const id = meeting(m, /Northwind/).id;
  const broken = scripted({ research: () => { throw new Error('search is down'); } });
  const r = (await researchMeeting(m, id, now, broken))!;
  assert.equal(r.added, 0);
  assert.equal(researchPlan(r.memory, id, now), null, 'not again today');
  assert.ok(researchPlan(r.memory, id, new Date(NOW.getTime() + 25 * 3600e3).toISOString()), 'again tomorrow');
});

test('a page matches however the model copied it, but a path is case-sensitive; the source keeps the search’s address', () => {
  const m = synced();
  const plan = researchPlan(m, meeting(m, /Northwind/).id, now)!;
  const f = (url: string, text: string) => ({ about: 'c1', topic: 'company' as const, text, url, published: '' });
  const r = applyResearch(m, plan, { findings: [
    f('http://www.Northwind.example/about?utm_source=x#team', 'Midwest freight carrier with 14 depots'),
    f('https://bit.ly/3xyzab', 'A claim from a different short link'),
  ] }, [{ url: 'https://northwind.example/about' }, { url: 'https://bit.ly/3XyZaB' }], now);
  assert.deepEqual(r.dropped.map(d => d.why), ['its page wasn’t in the search results']);
  const src = r.memory.sources.find(s => s.id === r.memory.facts.find(x => x.text.startsWith('Midwest'))!.sourceIds[0])!;
  assert.equal(src.url, 'https://northwind.example/about');
});

test('what a slow search finds is saved into memory as it is when the search ends, not as it was', async () => {
  const m = synced();
  const id = meeting(m, /Northwind/).id;
  const found = (await researchFind(m, id, now, llm()))!;
  // Meanwhile, an invite was imported.
  const later: Memory = { ...m, meetings: [...m.meetings, { id: 'mtg-new', title: 'Coffee with Sam', startsAt: '2026-11-02T16:00:00.000Z', durationMin: 30, attendeeIds: [], sourceId: 's-new' }] };
  const saved = researchSave(later, found, now).memory;
  assert.ok(saved.meetings.some(x => x.id === 'mtg-new'), 'the import is kept');
  assert.ok(saved.facts.some(f => /Reno hub/.test(f.text)), 'and so is the research');
});
