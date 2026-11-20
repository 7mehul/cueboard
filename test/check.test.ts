import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import type { Board, Packet } from '../src/types.ts';
import { danaFirst, danaFollowup } from './fixtures.ts';

// A checker that never fails proves nothing. Each test breaks one rule on a good board and
// confirms the checker names it.

function broken(make: () => Packet, mutate: (b: Board, p: Packet) => void) {
  const p = make();
  const b = structuredClone(buildBoard(p));
  assert.deepEqual(checkBoard(b, p), [], 'starts clean');
  mutate(b, p);
  return checkBoard(b, p).map(i => i.code);
}

const block = (b: Board, id: string) => {
  const x = b.blocks.find(x => x.id === id);
  assert.ok(x, `block ${id} exists`);
  return x;
};

const cases: [string, () => Packet, (b: Board, p: Packet) => void][] = [
  ['unsourced_claim', danaFirst, b => { block(b, 'person:p-dana').lines[0].sourceIds = []; }],
  ['unknown_source', danaFirst, b => { block(b, 'person:p-dana').lines[0].sourceIds = ['nope']; }],
  ['private_leak', danaFirst, (b, p) => {
    p.sources.push({ id: 's-theirs', kind: 'email', ref: 'x', seenAt: '2026-09-01', ownerId: 'u-other' });
    block(b, 'person:p-dana').lines[0].sourceIds = ['s-theirs'];
  }],
  ['line_over_limit', danaFirst, b => { block(b, 'person:p-dana').lines[0].text = 'Partner at Halyard Ventures who also leads every seed round they do'; }],
  ['title_over_limit', danaFirst, b => { block(b, 'keynotes').title = 'Key notes for this very important meeting today'; }],
  ['duplicate_line', danaFirst, b => { const l = block(b, 'person:p-dana').lines; l[1] = { ...l[1], text: l[0].text }; }],
  ['memory_flag_wrong', danaFollowup, b => { delete block(b, 'keynotes').lines[0].memory; }],
  ['gap_not_bracketed', danaFirst, b => { const l = block(b, 'keynotes').lines[0]; l.gap = 'confirm'; l.claim = false; }],
  ['unresolved_person_fact', danaFirst, (_b, p) => { p.people[0].resolved = false; }],
  ['low_confidence_shown', danaFirst, (_b, p) => { p.facts.find(f => f.id === 'f-bg1')!.confidence = 0.3; }],
  ['stale_news', danaFirst, (b, p) => {
    p.facts.push({ id: 'f-old', subject: { kind: 'company', id: 'c-halyard' }, topic: 'news', text: 'Old news', sourceIds: ['s-team'], date: '2024-01-01', confidence: 0.9 });
    block(b, 'person:p-dana').lines.push({ text: 'Old news', sourceIds: ['s-team'], factIds: ['f-old'], claim: true });
  }],
  ['fact_reused', danaFirst, b => { const l = block(b, 'person:p-dana').lines; l.push({ ...l[1], text: 'Same fact again' }); }],
  ['conflict_shown', danaFirst, (b, p) => {
    p.facts.push({ id: 'f-role2', subject: { kind: 'person', id: 'p-dana' }, topic: 'role', text: 'Principal at Halyard', sourceIds: ['s-team'], confidence: 0.9, key: 'title', value: 'Principal' });
    block(b, 'person:p-dana').lines.push({ text: 'Principal at Halyard', sourceIds: ['s-team'], factIds: ['f-role2'], claim: true });
  }],
  ['number_wrong', danaFollowup, b => { block(b, 'number:mrr').lines[0].text = '$50k'; }],
  ['delta_wrong', danaFollowup, b => { block(b, 'number:mrr').lines[1].text = 'was $39k · +24%'; }],
  ['delta_wrong', danaFirst, b => { block(b, 'number:mrr').lines[1].text = 'was $30k · +36%'; }],
  ['bad_news_hidden', danaFollowup, (_b, p) => { p.metrics.find(m => m.id === 'mrr')!.points.at(-1)!.value = 39000; }],
  ['direction_wrong', danaFollowup, b => { const l = block(b, 'phase:open').lines.find(l => l.label === 'Open with')!; l.text = l.text.replace(' down ', ' up '); }],
  ['missing_left_off', danaFollowup, b => { const k = block(b, 'keynotes'); k.lines = k.lines.filter(l => l.label !== 'Where we left off'); }],
  ['stage_wrong', danaFirst, b => { b.stage = 'followup'; }],
  ['timeline_in_first', danaFirst, b => {
    b.blocks.push({ id: 'timeline', kind: 'timeline', zone: 'visual', slot: 'timeline', priority: 1, title: 'Timeline', lines: [], events: [] });
  }],
  ['chart_rule', danaFirst, b => { const t = b.blocks.find(x => x.kind === 'trend')!; t.chart!.points = t.chart!.points.slice(0, 2); }],
  ['chart_data_mismatch', danaFirst, b => { b.blocks.find(x => x.kind === 'trend')!.chart!.points[0].value = 99999; }],
  ['over_block_budget', danaFirst, b => {
    for (let i = 0; i < 3; i++) b.blocks.push({ id: `extra${i}`, kind: 'note', zone: 'notes', slot: 'note', priority: 99, title: 'Extra', lines: [{ text: `x${i}`, sourceIds: [], claim: false }] });
  }],
  ['empty_block', danaFirst, b => { block(b, 'questions').lines = []; }],
  ['layout_overlap', danaFirst, b => { const [a, c] = b.canvas.slice(1, 3); c.x = a.x; c.y = a.y; }],
  ['layout_missing', danaFirst, b => { b.canvas.pop(); }],
  ['rail_wrong', danaFirst, b => { b.rail.pop(); }],
  ['gaps_list_wrong', danaFirst, b => { b.gaps.push('[something else]'); }],
  ['plan_shape', danaFirst, b => { b.blocks = b.blocks.filter(x => x.id !== 'phase:open'); b.canvas = b.canvas.filter(c => c.id !== 'phase:open'); b.rail = b.rail.filter(id => id !== 'phase:open'); }],
  ['plan_minutes', danaFirst, b => { block(b, 'phase:close').minutes!.to += 5; }],
  ['missing_ask_line', danaFirst, b => { const k = block(b, 'phase:close'); k.lines = k.lines.filter(l => l.label !== 'Ask'); }],
  ['missing_goal_line', danaFirst, b => { const k = block(b, 'keynotes'); k.lines = k.lines.filter(l => l.label !== 'Goal'); }],
  ['unresolved_not_flagged', danaFirst, (b, p) => {
    p.people[0].resolved = false;
    block(b, 'person:p-dana').lines = [{ text: 'Seems nice', sourceIds: [], claim: false }];
  }],
];

for (const [code, make, mutate] of cases) {
  test(`checker catches ${code}`, () => {
    const codes = broken(make, mutate);
    assert.ok(codes.includes(code), `expected ${code}, got [${codes.join(', ')}]`);
  });
}
