import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Limiter, Usage, clientEvent, cookie, newCode, parseInvites, sessionName, sessionToken } from '../scripts/gate.ts';

const SECRET = 'x'.repeat(40);

test('invites are name:code pairs, checked before the server starts', () => {
  const a = newCode(), b = newCode();
  const inv = parseInvites(`maya:${a}, ben:${b}`);
  assert.equal(inv.get(a), 'maya');
  assert.equal(inv.get(b), 'ben');
  assert.equal(parseInvites('').size, 0);
  assert.throws(() => parseInvites('Maya:abcdefghijkl'), /lowercase/);
  assert.throws(() => parseInvites('maya:short'), /10–64/);
  assert.throws(() => parseInvites(`maya:${a},maya:${b}`), /Two invites/);
  assert.throws(() => parseInvites(`maya:${a},ben:${a}`), /same code/);
  assert.match(newCode(), /^[A-Za-z0-9_-]{16}$/);
});

test('a session names its tester until it’s edited, too old, or their invite is taken out', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const names = new Set(['maya', 'ben']);
  const t = sessionToken('maya', SECRET, now);
  assert.equal(sessionName(t, SECRET, names, now), 'maya');
  assert.equal(sessionName(t.replace('maya', 'ben_'), SECRET, names, now), null, 'renamed');
  assert.equal(sessionName(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'), SECRET, names, now), null, 'signature edited');
  assert.equal(sessionName(t, 'y'.repeat(40), names, now), null, 'another secret');
  assert.equal(sessionName(t, SECRET, new Set(['ben']), now), null, 'invite removed');
  assert.equal(sessionName(t, SECRET, names, now + 61 * 864e5), null, 'past 60 days');
  assert.equal(sessionName(null, SECRET, names, now), null);
  assert.equal(sessionName('garbage', SECRET, names, now), null);
  assert.equal(cookie(`a=1; cue_session=${t}; b=2`, 'cue_session'), t);
  assert.equal(cookie(undefined, 'cue_session'), null);
});

test('guessing codes is slowed down', () => {
  const l = new Limiter(3, 60_000);
  assert.deepEqual([1, 2, 3, 4].map(() => l.allow('1.2.3.4', 0)), [true, true, true, false]);
  assert.equal(l.allow('5.6.7.8', 0), true, 'per address');
  assert.equal(l.allow('1.2.3.4', 61_000), true, 'after the window');
});

test('the page can report actions, never content', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  assert.deepEqual(clientEvent('maya', { ev: 'board_made', kind: 'model', n: 3 }, now), { t: now.toISOString(), who: 'maya', ev: 'board_made', kind: 'model', n: 3 });
  assert.equal(clientEvent('maya', { ev: 'title', kind: 'Larkspur partner meeting' }, now), null, 'not an action we count');
  assert.deepEqual(clientEvent('maya', { ev: 'float_opened', kind: 'Larkspur partner meeting', n: 1e9, text: 'secret' }, now), { t: now.toISOString(), who: 'maya', ev: 'float_opened' }, 'free text and odd numbers are dropped');
  assert.equal(clientEvent('maya', null, now), null);
});

test('usage counts model calls per tester per day, survives a restart, and answers the test’s question', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cue-usage-'));
  try {
    const u = new Usage(dir, { quiet: true });
    await u.load();
    const at = (d: string, who: string, ev: string, extra = {}) => u.record({ t: d, who, ev, ...extra });
    at('2026-10-01T10:00:00Z', 'maya', 'board_made');
    at('2026-10-09T10:00:00Z', 'maya', 'board_made');            // second board within 14 days
    at('2026-10-01T10:00:00Z', 'ben', 'board_made');
    at('2026-10-20T10:00:00Z', 'ben', 'board_made');             // second, but after 14 days
    at('2026-10-27T10:00:00Z', 'priya', 'board_made');           // first, and still inside the window
    at('2026-10-28T09:00:00Z', 'maya', 'model', { kind: 'extract', tokens: 4000 });
    at('2026-10-28T09:05:00Z', 'maya', 'model', { kind: 'rank', tokens: 6000 });
    at('2026-10-28T09:06:00Z', 'ben', 'model', { kind: 'assistant', tokens: 1000 });
    at('2026-10-28T09:07:00Z', 'maya', 'float_opened', { kind: 'pip' });
    const now = new Date('2026-10-28T12:00:00Z');
    assert.equal(u.today('maya', 'model', now), 2);
    assert.equal(u.today('maya', 'event', now), 1);
    assert.equal(u.todayAll(now), 3);
    assert.equal(u.today('maya', 'model', new Date('2026-10-29T00:00:01Z')), 0, 'a new day starts at midnight UTC');

    const again = new Usage(dir, { quiet: true });
    await again.load();
    assert.equal(again.events.length, 9, 'read back from usage.jsonl');
    assert.equal((await readFile(join(dir, 'usage.jsonl'), 'utf8')).trim().split('\n').length, 9);
    const rows = Object.fromEntries(again.summary(now).map(r => [r.who, r]));
    assert.equal(rows.maya.secondBoard, 'yes');
    assert.equal(rows.ben.secondBoard, 'no');
    assert.equal(rows.priya.secondBoard, 'not yet');
    assert.equal(rows.maya.boards, 2);
    assert.equal(rows.maya.calls, 2);
    assert.equal(rows.maya.tokens, 10_000);
    assert.equal(rows.maya.float, 1);
    assert.equal(rows.maya.days, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
