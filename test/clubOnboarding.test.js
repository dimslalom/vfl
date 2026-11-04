import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_KEY, hintFor, inFirstWeek, loadOnboarding, markHintSeen, primerDue, resetHints, saveOnboarding,
} from '../src/lib/clubOnboarding.js';

function memory(initial = {}) {
  const data = { ...initial };
  return { getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, data };
}

const week = (year, played) => ({ year, results: Array.from({ length: played }, () => ({ won: true })) });

test('a first visit has the primer and tips on, nothing seen', () => {
  const prefs = loadOnboarding(memory());
  assert.deepEqual(prefs, { primer: true, hints: true, primerSeen: false, seen: [] });
  assert.equal(primerDue(prefs), true);
});

test('preferences survive a save and a reload, and junk is dropped', () => {
  const storage = memory();
  saveOnboarding({ primer: false, hints: true, primerSeen: true, seen: ['home', 'squad'] }, storage);
  assert.deepEqual(loadOnboarding(storage), { primer: false, hints: true, primerSeen: true, seen: ['home', 'squad'] });
  storage.setItem(ONBOARDING_KEY, JSON.stringify({ seen: ['home', 'nope'], hints: 'yes' }));
  assert.deepEqual(loadOnboarding(storage).seen, ['home']);
  storage.setItem(ONBOARDING_KEY, '{broken');
  assert.equal(loadOnboarding(storage).primer, true);
});

test('a blocked storage never throws', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadOnboarding(blocked).hints, true);
  assert.equal(saveOnboarding({ primer: true }, blocked), false);
});

test('the primer runs once, and never when switched off', () => {
  assert.equal(primerDue({ primer: true, primerSeen: true }), false);
  assert.equal(primerDue({ primer: false, primerSeen: false }), false);
});

test('tips show once per screen, only in the first week', () => {
  const prefs = loadOnboarding(memory());
  assert.equal(inFirstWeek(week(1, 0)), true);
  assert.equal(inFirstWeek(week(1, 1)), true);
  assert.equal(inFirstWeek(week(1, 2)), false);
  assert.equal(inFirstWeek(week(2, 0)), false);
  assert.equal(hintFor(prefs, week(1, 0), 'home'), 'home');
  assert.equal(hintFor(prefs, week(1, 0), 'match'), null);
  assert.equal(hintFor(markHintSeen(prefs, 'home'), week(1, 0), 'home'), null);
  assert.equal(hintFor({ ...prefs, hints: false }, week(1, 0), 'home'), null);
  assert.equal(hintFor(prefs, week(1, 3), 'home'), null);
  assert.equal(hintFor(prefs, null, 'home'), null);
});

test('show tips again brings back the tips and the primer', () => {
  const seen = { primer: true, hints: true, primerSeen: true, seen: ['home', 'vault'] };
  assert.deepEqual(resetHints(seen), { primer: true, hints: true, primerSeen: false, seen: [] });
});
