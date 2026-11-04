import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_SCORE_MAX, DAILY_YEARS, isLastEvent } from '../src/lib/dailyRules.js';
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
