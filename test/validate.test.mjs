import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubmission, parseGuess, parseName, isProfane, pickDeck } from '../src/validate.js';

const S = 'a'.repeat(32);

test('a submission is a session id plus a cleaned name; any client score is dropped', () => {
  assert.deepEqual(parseSubmission({ session: S, name: '  Pixel  Hawk ', score: 10 }), { ok: true, session: S, name: 'Pixel Hawk' });
  assert.equal(parseSubmission({ session: 'short', name: 'ok' }).error, 'bad_session');
  assert.equal(parseSubmission({ name: 'ok' }).error, 'bad_session');
  assert.equal(parseSubmission(null).error, 'bad_request');
});

test('guesses need a session, a round 0..9 and ai|real', () => {
  assert.deepEqual(parseGuess({ session: S, round: 0, guess: 'ai' }), { ok: true, session: S, round: 0, guess: 'ai' });
  assert.equal(parseGuess({ session: S, round: 10, guess: 'ai' }).error, 'bad_round');
  assert.equal(parseGuess({ session: S, round: 1.5, guess: 'ai' }).error, 'bad_round');
  assert.equal(parseGuess({ session: S, round: 1, guess: 'AI!' }).error, 'bad_guess');
  assert.equal(parseGuess({ session: 'x', round: 1, guess: 'ai' }).error, 'bad_session');
});

test('rejects empty, too long, or markup names', () => {
  for (const name of ['', '   ', 'a'.repeat(17), '<script>', 'x"y', 42]) assert.equal(parseName(name).ok, false, `name ${name}`);
  assert.equal(parseName('a'.repeat(16)).ok, true);
});

test('blocks profanity including leetspeak and spacing tricks', () => {
  for (const name of ['fuck', 'FuCk you', 'f u c k', 'sh1t', 'phuck_sh!t', 'b1tch', 'n1gga', 'ass', 'a s s']) {
    assert.equal(parseName(name).ok, false, name);
  }
});

test('does not block innocent names that contain short bad substrings', () => {
  for (const name of ['Cassie', 'Document', 'Analyst', 'Sussex', 'Grape', 'Peacock', 'Dickens', 'Classic', 'Spicy']) {
    assert.equal(isProfane(name), false, name);
  }
});

test('pickDeck returns distinct indices within range', () => {
  const deck = pickDeck(72, 10);
  assert.equal(deck.length, 10);
  assert.equal(new Set(deck).size, 10);
  assert.ok(deck.every((i) => Number.isInteger(i) && i >= 0 && i < 72));
});

import { pickLevelDeck, parseLevel } from '../src/validate.js';
import { DECK } from '../src/deck.js';

test('level 1 decks always hold 2-3 hard AI images and 10 unique cards', () => {
  for (let k = 0; k < 500; k++) {
    const deck = pickLevelDeck(DECK, 1);
    assert.equal(deck.length, 10);
    assert.equal(new Set(deck).size, 10);
    const hard = deck.filter((i) => DECK[i].h).length;
    assert.ok(hard >= 2 && hard <= 3, `hard=${hard}`);
  }
});

test('level 2 decks are 10 unique hard AI images', () => {
  for (let k = 0; k < 500; k++) {
    const deck = pickLevelDeck(DECK, 2);
    assert.equal(new Set(deck).size, 10);
    assert.ok(deck.every((i) => DECK[i].h === 1 && DECK[i].a === 'ai'));
  }
});

test('hard pool is big enough and AI-only', () => {
  const hard = DECK.filter((c) => c.h);
  assert.ok(hard.length >= 20, `hard pool ${hard.length}`);
  assert.ok(hard.every((c) => c.a === 'ai'));
});

test('parseLevel accepts 1 and 2 only', () => {
  assert.equal(parseLevel({}), 1);
  assert.equal(parseLevel({ level: 2 }), 2);
  for (const level of [0, 3, '2', 1.5, null]) assert.equal(parseLevel({ level }), level === null ? 1 : null);
});
