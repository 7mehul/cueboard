import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRefresh } from '../src/refresh.ts';
import type { El } from '../src/refresh.ts';

const card = (id: string, lines: string[], at: Partial<El> = {}): El => ({ id, type: 'card', x: 0, y: 0, w: 300, h: 100, color: 'mint', tag: 'Key notes', title: 'Run of show', lines: lines.map(text => ({ text })), ...at });
const stat = (id: string, value: string, at: Partial<El> = {}): El => ({ id, type: 'stat', x: 400, y: 0, w: 200, h: 100, label: 'MRR', value, note: '', ...at });

test('cards still as drafted take the new content where they sit; edited ones stay yours', () => {
  const drafted = [card('keynotes', ['Goal: a second meeting']), stat('number-mrr', '$33k'), card('person-maya', ['Partner at Larkspur'], { x: 0, y: 200 })];
  const current = [
    { ...drafted[0], x: 640, y: 40, color: 'sky' },                                 // moved and recoloured, not edited
    stat('number-mrr', '$34k (my latest)'),                                           // edited
    drafted[2],
  ];
  const next = [card('keynotes', ['Goal: term sheet by Friday']), stat('number-mrr', '$38.5k'), card('person-maya', ['Partner at Larkspur'], { x: 0, y: 200 })];
  const r = mergeRefresh(current, drafted, next);
  const by = new Map(r.elements.map(e => [e.id, e]));
  assert.deepEqual(by.get('keynotes')!.lines, [{ text: 'Goal: term sheet by Friday' }], 'new content');
  assert.deepEqual([by.get('keynotes')!.x, by.get('keynotes')!.y, by.get('keynotes')!.color], [640, 40, 'sky'], 'where you put it, in your colour');
  assert.equal(by.get('number-mrr')!.value, '$34k (my latest)', 'your edit wins');
  assert.deepEqual([r.updated, r.kept, r.added, r.removed], [1, 1, 0, 0]);
});

test('your own cards stay, deleted ones stay deleted, and the engine’s leftovers go unless you edited them', () => {
  const drafted = [card('keynotes', ['a']), card('note-zoom', ['Isn’t this a Zoom feature?']), card('note-repeat', ['Don’t pitch market size']), stat('number-mrr', '$33k')];
  const mine = card('e-mine', ['My own reminder'], { x: 900 });
  const current = [drafted[0], card('note-repeat', ['Don’t pitch market size (she knows it)']), stat('number-mrr', '$33k'), mine];  // note-zoom deleted
  const next = [card('keynotes', ['a']), card('note-zoom', ['Isn’t this a Zoom feature?'])];                                        // engine dropped both notes and the stat
  const r = mergeRefresh(current, drafted, next);
  assert.deepEqual(r.elements.map(e => e.id), ['keynotes', 'note-repeat', 'e-mine'], 'deleted stays deleted; the untouched stat goes; edited note and your card stay');
  assert.deepEqual([r.removed, r.kept], [1, 1]);
});

test('new cards are added clear of what’s there', () => {
  const drafted = [card('keynotes', ['a'], { x: 0, y: 0, w: 300, h: 200 })];
  const r = mergeRefresh(drafted, drafted, [drafted[0], card('note-new', ['They asked about SOC 2'], { x: 100, y: 50, w: 300, h: 100 })]);
  const added = r.elements.find(e => e.id === 'note-new')!;
  assert.equal(r.added, 1);
  assert.ok(added.y >= 224, `below the run of show, at ${added.y}`);
  const free = mergeRefresh(drafted, drafted, [drafted[0], card('note-free', ['x'], { x: 400, y: 0 })]).elements.find(e => e.id === 'note-free')!;
  assert.deepEqual([free.x, free.y], [400, 0], 'where the engine put it, when that’s free');
});

test('inside a card: the Goal you filled in stays, “Where we left off” still updates', () => {
  const ros = (lines: object[]): El => ({ id: 'keynotes', type: 'card', x: 0, y: 0, w: 300, h: 100, color: 'mint', tag: 'Key notes', title: 'Run of show', lines });
  const drafted = ros([{ label: 'Where we left off', text: 'Call with Maya. No notes from it yet.' }, { label: 'Goal', text: '[what do you want out of this meeting?]', gap: true }, { label: 'Ask', text: '[the next step to ask for]', gap: true }]);
  const mine = ros([{ label: 'Where we left off', text: 'Call with Maya. No notes from it yet.' }, { label: 'Goal', text: 'Get to a term sheet' }]);   // filled Goal, deleted Ask
  const next = ros([{ label: 'Where we left off', text: 'She wants a cohort table before going to partners' }, { label: 'Goal', text: '[what do you want out of this meeting?]', gap: true }, { label: 'Ask', text: '[the next step to ask for]', gap: true }, { label: 'Open with', text: 'Send the cohort table' }]);
  const r = mergeRefresh([mine], [drafted], [next]);
  assert.deepEqual(r.elements[0].lines, [
    { label: 'Where we left off', text: 'She wants a cohort table before going to partners' },
    { label: 'Goal', text: 'Get to a term sheet' },
    { label: 'Open with', text: 'Send the cohort table' },
  ], 'new left-off, your goal, no Ask (you deleted it), and the new line');
  assert.deepEqual([r.updated, r.kept], [1, 1]);
});

test('lines you add to a card stay; ticked questions stay ticked', () => {
  const person = (lines: object[]): El => ({ id: 'person-maya', type: 'person', x: 0, y: 0, w: 280, h: 100, color: 'sky', name: 'Maya Chen', lines });
  const r = mergeRefresh(
    [person([{ text: '[look up Maya Chen’s role]', gap: true }, { text: 'Met her at SaaStr' }])],
    [person([{ text: '[look up Maya Chen’s role]', gap: true }])],
    [person([{ text: 'Did 3 seed deals in workflow tools this year' }, { text: 'Asked twice about churn in small teams' }])]);
  assert.deepEqual((r.elements[0].lines as { text: string }[]).map(l => l.text), ['Did 3 seed deals in workflow tools this year', 'Asked twice about churn in small teams', 'Met her at SaaStr']);

  const list = (items: object[]): El => ({ id: 'questions', type: 'list', x: 0, y: 0, w: 300, h: 100, title: 'Questions to ask', items });
  const q = mergeRefresh(
    [list([{ text: 'Who else decides?', done: true }, { text: 'What’s the timeline?', done: false }])],
    [list([{ text: 'Who else decides?', done: false }, { text: 'What’s the timeline?', done: false }])],
    [list([{ text: 'Who else decides?', done: false }, { text: 'What’s the timeline?', done: false }, { text: 'Is the cohort table enough?', done: false }])]);
  assert.deepEqual((q.elements[0].items as { text: string; done: boolean }[]).map(i => `${i.done ? '✓' : '·'} ${i.text}`), ['✓ Who else decides?', '· What’s the timeline?', '· Is the cohort table enough?']);
});

test('when a new goal reorders the plan, untouched cards follow their part; a card you moved stays put', () => {
  const part = (id: string, tag: string, x: number): El => ({ id, type: 'card', x, y: 200, w: 280, h: 80, color: 'lilac', tag, title: id, lines: [] });
  const drafted = [part('phase-show', '5–20 min', 304), part('phase-learn', '20–35 min', 608), stat('number-mrr', '$33k'), card('questions', ['a'], { x: 608, y: 300 })];
  drafted[2].x = 304; drafted[2].y = 300;
  const current = structuredClone(drafted);
  current[1].y = 214; current[3].y = 330;      // settled to real heights: not a move
  current[2].x = 900;                           // you dragged the number off to the side
  const next = [part('phase-learn', '5–20 min', 304), part('phase-show', '20–35 min', 608), { ...stat('number-mrr', '$33k'), x: 608, y: 300 }, card('questions', ['a'], { x: 304, y: 300 })];
  const by = new Map(mergeRefresh(current, drafted, next).elements.map(e => [e.id, e]));
  assert.deepEqual([by.get('phase-learn')!.x, by.get('phase-learn')!.tag], [304, '5–20 min']);
  assert.deepEqual([by.get('phase-show')!.x, by.get('phase-show')!.tag], [608, '20–35 min']);
  assert.equal(by.get('questions')!.x, 304, 'the questions follow the part they belong to');
  assert.equal(by.get('number-mrr')!.x, 900, 'where you put it');
});

test('two lines that say the same thing are two lines: deleting, ticking or editing one leaves the other', () => {
  const list = (items: object[], at: Partial<El> = {}): El => ({ id: 'questions', type: 'list', x: 0, y: 0, w: 280, h: 100, title: 'Questions', items, ...at });
  const q = (text: string, done = false) => ({ text, done });
  const drafted = [list([q('Follow up'), q('Follow up')])];
  // One of two identical questions deleted: it stays deleted.
  assert.deepEqual((mergeRefresh([list([q('Follow up')])], drafted, [list([q('Follow up'), q('Follow up')])]).elements[0].items as object[]).length, 1);
  // Both ticked: both stay ticked, and a new question joins them.
  const ticked = mergeRefresh([list([q('Follow up', true), q('Follow up', true)])], drafted, [list([q('Follow up'), q('Follow up'), q('New')])]).elements[0].items as { text: string; done: boolean }[];
  assert.deepEqual(ticked.map(i => `${i.done ? '✓' : '·'}${i.text}`), ['✓Follow up', '✓Follow up', '·New']);
  // An edit that happens to match another line keeps both lines.
  const d2 = [list([q('Ask about price'), q('Ask about SSO')])];
  const edited = mergeRefresh([list([q('Ask about SSO'), q('Ask about SSO')])], d2, d2).elements[0].items as object[];
  assert.equal(edited.length, 2);
});

test('a card following its part to a new column moves down if one of yours is already there', () => {
  const part = (id: string, x: number): El => ({ id, type: 'card', x, y: 200, w: 280, h: 80, color: 'lilac', tag: '', title: id, lines: [] });
  const drafted = [part('phase-a', 304)];
  const mine: El = { id: 'e-mine', type: 'note', x: 608, y: 200, w: 280, h: 120 };
  const r = mergeRefresh([...drafted, mine], drafted, [part('phase-a', 608)]).elements;
  const a = r.find(e => e.id === 'phase-a')!;
  assert.equal(a.x, 608);
  assert.ok(a.y >= mine.y + mine.h, `moved clear, to y=${a.y}`);
});
