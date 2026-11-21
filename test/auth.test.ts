import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Limiter, clientAddress, cookie, passwordMatches, sessionToken, sessionValid } from '../scripts/auth.ts';

const SECRET = 'cueboard/session/' + 'k'.repeat(64);
const PASSWORD = 'correct horse battery';

test('the password matches only itself', () => {
  assert.equal(passwordMatches(PASSWORD, PASSWORD), true);
  assert.equal(passwordMatches(PASSWORD + ' ', PASSWORD), false);
  assert.equal(passwordMatches('', PASSWORD), false);
  assert.equal(passwordMatches(undefined, PASSWORD), false);
  assert.equal(passwordMatches({ toString: () => PASSWORD }, PASSWORD), false, 'only a string');
  assert.equal(passwordMatches('x'.repeat(5000), PASSWORD), false);
  assert.equal(passwordMatches('', ''), false, 'no password set lets nobody in this way');
});

test('a session holds until it’s edited, too old, signed by another server, or the password changes', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const t = sessionToken(SECRET, PASSWORD, now);
  assert.equal(sessionValid(t, SECRET, PASSWORD, now), true);
  assert.equal(sessionValid(t, SECRET, PASSWORD, now + 29 * 864e5), true, 'within 30 days');
  assert.equal(sessionValid(t, SECRET, PASSWORD, now + 31 * 864e5), false, 'past 30 days');
  assert.equal(sessionValid(t, SECRET, 'a new password here', now), false, 'a new password signs everyone out');
  assert.equal(sessionValid(t, 'cueboard/session/' + 'j'.repeat(64), PASSWORD, now), false, 'another server’s key');
  assert.equal(sessionValid(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'), SECRET, PASSWORD, now), false, 'signature edited');
  const [ts, sig] = t.split('.');
  assert.equal(sessionValid(`${Number(ts) + 86400 * 365}.${sig}`, SECRET, PASSWORD, now), false, 'date pushed forward');
  assert.equal(sessionValid(null, SECRET, PASSWORD, now), false);
  assert.equal(sessionValid('garbage', SECRET, PASSWORD, now), false);
  assert.equal(sessionValid(t, SECRET, '', now), false, 'no password, no sessions');
  assert.equal(cookie(`a=1; cue_session=${t}; b=2`, 'cue_session'), t);
  assert.equal(cookie(undefined, 'cue_session'), null);
});

test('guessing is slowed down per address, and the address is the one that can’t be made up', () => {
  const l = new Limiter(3, 60_000);
  assert.deepEqual([1, 2, 3, 4].map(() => l.allow('1.2.3.4', 0)), [true, true, true, false]);
  assert.equal(l.allow('5.6.7.8', 0), true, 'per address');
  assert.equal(l.allow('1.2.3.4', 61_000), true, 'after the window');

  // Reached directly: the connection's address, whatever the header says.
  assert.equal(clientAddress('203.0.113.9', '10.0.0.1'), '203.0.113.9');
  assert.equal(clientAddress('2001:4860::1', '198.51.100.1'), '2001:4860::1');
  // Behind a proxy on this machine or a private network: the last entry, which the proxy added.
  assert.equal(clientAddress('127.0.0.1', '10.9.9.9, 203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddress('::ffff:172.18.0.2', '203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddress('127.0.0.1', undefined), '127.0.0.1');
});
