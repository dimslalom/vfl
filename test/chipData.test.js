import test from 'node:test';
import assert from 'node:assert/strict';
import { tacticMult } from '../src/engine/board/board.js';
import { TACTIC_LIST } from '../src/engine/endless/seriesCards.js';
import { CHIP_FLOOR, CHIP_ICONS, CHIP_KEYS, CHIP_TIERS, chipCode, chipInfo, chipLadder, chipPlan } from '../src/chip3d/chipData.js';
import { chipCopy } from '../src/chip3d/chipCopy.js';
import { ICON_PATHS } from '../src/chip3d/chipIcons.js';

const card = (id, role, skill = null) => ({ id, player: id, role, specialties: skill ? [skill] : ['none'], stats: {} });

test('every tactic has a chip with a tier, printable icons and copy', () => {
  assert.equal(CHIP_KEYS.length, TACTIC_LIST.length);
  for (const key of CHIP_KEYS) {
    const info = chipInfo(key);
    assert.ok(CHIP_TIERS[info.tier], `${key} tier`);
    assert.ok(CHIP_ICONS[key]?.length, `${key} icons`);
    for (const name of info.icons) assert.ok(ICON_PATHS[name], `${key} icon ${name}`);
    const copy = chipCopy(key);
    for (const line of ['effect', 'when', 'risk']) assert.ok(copy[line], `${key} ${line}`);
    assert.ok(chipCode(key), `${key} code`);
  }
});

test('a chip ladder only lists steps the board pays above the floor, and climbs', () => {
  for (const key of CHIP_KEYS) {
    const ladder = chipLadder(key);
    assert.ok(ladder.length <= 3, key);
    ladder.forEach((step, i) => {
      assert.ok(step.mult > CHIP_FLOOR && step.mult <= 3, `${key} step ${i}`);
      assert.equal(step.mult * 2, Math.round(step.mult * 2), `${key} pays in half steps`);
      assert.ok(step.icons.length <= 3, `${key} step ${i} fits on one lane`);
      for (const name of step.icons) assert.ok(ICON_PATHS[name], `${key} ladder icon ${name}`);
      if (i) assert.ok(step.mult > ladder[i - 1].mult, `${key} climbs`);
    });
  }
});

test('the ladder matches the board numbers', () => {
  assert.deepEqual(chipLadder('hit').map(step => step.mult), [2, 2.5]);
  assert.deepEqual(chipLadder('noRespect').map(step => step.mult), [2, 3]);
  assert.deepEqual(chipLadder('retake'), [{ icons: ['Sentinel', 'Controller'], mult: 2.5 }]);
  assert.deepEqual(chipLadder('flood').map(step => step.mult), [2, 2.5, 3]);
});

test('chips that cannot fire on the board say so and promise only the floor', () => {
  for (const key of ['defaults', 'lockout']) {
    const info = chipInfo(key);
    assert.ok(info.dead, key);
    assert.equal(info.max, CHIP_FLOOR);
    assert.deepEqual(chipLadder(key), []);
  }
  // Deep Default on the fullest mixed lane the board allows.
  assert.equal(tacticMult({ key: 'defaults' }, [card('a', 'Sentinel'), card('b', 'Duelist'), card('c', 'Controller')]), CHIP_FLOOR);
});

test('a hand saved with the old no-respect spelling still gets its chip', () => {
  const info = chipInfo('no-respect');
  assert.equal(info.key, 'noRespect');
  assert.deepEqual(info.icons, ['flick']);
});

test('the plan reads the real squad and names who shares the lane', () => {
  const five = [card('dlt', 'Duelist'), card('ini', 'Initiator'), card('ctl', 'Controller'), card('sen', 'Sentinel'), card('ini2', 'Initiator')];
  const layers = chipPlan('layers', five);
  assert.equal(layers.mult, 2.5);
  assert.deepEqual(layers.cards.map(c => c.role).sort(), ['Controller', 'Initiator']);
  assert.equal(chipPlan('hit', five).fits, false);
  assert.equal(chipPlan('noRespect', five).mult, CHIP_FLOOR);
  const flicker = [...five.slice(0, 4), card('f', 'Duelist', 'flick')];
  assert.deepEqual(chipPlan('noRespect', flicker).cards.map(c => c.id), ['f']);
});
