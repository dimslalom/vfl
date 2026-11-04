import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_SCORE_MAX, DAILY_YEARS, isLastEvent } from '../src/lib/dailyRules.js';
import { lobbyTurn } from '../src/lib/lobbyTurn.js';
import { ROUND_KEYS, ROUND_META } from '../shared/src/engine/perfectRun.js';

test('the Daily score ceiling covers a perfect year', () => {
  const series = ROUND_KEYS.map(key => ROUND_META[key].bestOf);
  const mapsPerEvent = series.reduce((sum, bestOf) => sum + Math.ceil(bestOf / 2), 0);
  const maps = mapsPerEvent * 3;
  const perfect = series.length * 3 * 100 + maps * 20 + maps * 13 + 3 * 150 + 300 + 500;
  assert.equal(DAILY_SCORE_MAX, perfect);
});

test('a Daily ends by itself after its third event; a normal run never does', () => {
  assert.equal(DAILY_YEARS, 1);
  assert.equal(isLastEvent(DAILY_YEARS, 0), false);
  assert.equal(isLastEvent(DAILY_YEARS, 1), false);
  assert.equal(isLastEvent(DAILY_YEARS, 2), true);
  assert.equal(isLastEvent(2, 2), false);
  assert.equal(isLastEvent(2, 5), true);
  assert.equal(isLastEvent(null, 300), false);
});

test('lobbyTurn names whose move it is in every phase', () => {
  const base = {
    hostId: 'a',
    competitors: [{ id: 'a', squadName: 'Alpha' }, { id: 'b', squadName: 'Bravo' }],
  };
  assert.deepEqual(lobbyTurn({ ...base, phase: 'lobby' }, 'b').waitingOn, ['Alpha']);
  assert.equal(lobbyTurn({ ...base, phase: 'lobby' }, 'a').mine, true);
  const draft = { ...base, phase: 'draft', draft: { activeCompetitorId: 'b', deadlineAt: 9 } };
  assert.equal(lobbyTurn(draft, 'b').mine, true);
  assert.equal(lobbyTurn(draft, 'a').deadlineAt, 9);
  const igl = { ...base, phase: 'igl_select', draft: { iglSelections: { a: 'x' }, deadlineAt: 5 } };
  assert.equal(lobbyTurn(igl, 'a').mine, false);
  assert.deepEqual(lobbyTurn(igl, 'a').waitingOn, ['Bravo']);
  const prep = { ...base, phase: 'series_prep', seriesPrep: { deadlineAt: 3, sides: { a: { ready: true }, b: { ready: false } } } };
  assert.equal(lobbyTurn(prep, 'b').mine, true);
  assert.deepEqual(lobbyTurn(prep, 'a').waitingOn, ['Bravo']);
});
