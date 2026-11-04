import test from 'node:test';
import assert from 'node:assert/strict';
import { TACTIC_LIST } from '../src/engine/endless/seriesCards.js';
import { CHIP_ICONS, CHIP_KEYS, CHIP_TIERS, chipInfo, chipLadder } from '../src/chip3d/chipData.js';
import { ICON_PATHS } from '../src/chip3d/chipIcons.js';

test('every tactic has a chip with a tier and printable icons', () => {
  assert.equal(CHIP_KEYS.length, TACTIC_LIST.length);
  for (const key of CHIP_KEYS) {
    const info = chipInfo(key);
    assert.ok(CHIP_TIERS[info.tier], `${key} tier`);
    assert.ok(CHIP_ICONS[key]?.length, `${key} icons`);
    for (const name of info.icons) assert.ok(ICON_PATHS[name], `${key} icon ${name}`);
  }
});

test('a chip ladder stays inside the board payout and only climbs', () => {
  for (const key of CHIP_KEYS) {
    const ladder = chipLadder(key);
    assert.ok(ladder.length >= 1 && ladder.length <= 3, key);
    ladder.forEach((step, i) => {
      assert.ok(step.mult >= 1.5 && step.mult <= 3, `${key} step ${i}`);
      assert.equal(step.mult * 2, Math.round(step.mult * 2), `${key} pays in half steps`);
      for (const name of step.icons) assert.ok(ICON_PATHS[name], `${key} ladder icon ${name}`);
      if (i) assert.ok(step.mult > ladder[i - 1].mult, `${key} climbs`);
    });
  }
});

test('a hand saved with the old no-respect spelling still gets its chip', () => {
  const info = chipInfo('no-respect');
  assert.equal(info.key, 'noRespect');
  assert.deepEqual(info.icons, ['flick']);
});

test('the ladder matches the tactic numbers', () => {
  assert.deepEqual(chipLadder('hit').map(step => step.mult), [1.5, 2, 2.5]);
  assert.deepEqual(chipLadder('noRespect').map(step => step.mult), [2, 3]);
  assert.deepEqual(chipLadder('retake'), [{ icons: ['Sentinel', 'Controller'], mult: 2.5 }]);
});
