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

test('a chip ladder climbs and stays inside the board payout', () => {
  for (const key of CHIP_KEYS) {
    const ladder = chipLadder(key);
    assert.ok(ladder.length >= 1 && ladder.length <= 3, key);
    ladder.forEach((step, i) => {
      assert.ok(step.icons.length <= 3, `${key} step ${i} fits on one lane`);
      for (const name of step.icons) assert.ok(ICON_PATHS[name], `${key} ladder icon ${name}`);
      if (step.label) return;
      assert.ok(step.mult >= CHIP_FLOOR && step.mult <= 3, `${key} step ${i}`);
      assert.equal(step.mult * 2, Math.round(step.mult * 2), `${key} pays in half steps`);
      if (i) assert.ok(step.mult > ladder[i - 1].mult, `${key} climbs`);
    });
  }
});

test('the ladder matches the board numbers', () => {
  assert.deepEqual(chipLadder('hit').map(step => step.mult), [2, 2.5]);
  assert.deepEqual(chipLadder('retake'), [{ icons: ['Sentinel', 'Controller'], mult: 2.5 }]);
  assert.deepEqual(chipLadder('flood').map(step => step.mult), [2, 2.5, 3]);
  assert.deepEqual(chipLadder('pocket').map(step => step.mult), [2]);
  assert.deepEqual(chipLadder('defaults').map(step => step.mult), [2.5]);
  assert.deepEqual(chipLadder('calling').map(step => step.mult), [2, 2.5, 3]);
  assert.deepEqual(chipLadder('noRespect').map(step => step.label), ['0', '+×1.5']);
});

test('every chip can do more than the floor on a board lane', () => {
  for (const key of CHIP_KEYS) {
    const info = chipInfo(key);
    assert.ok(info.special || info.max > CHIP_FLOOR, `${key} only ever pays the floor`);
  }
  // Deep Default fits a full mixed lane; Pocket Strat follows the IGL.
  assert.equal(tacticMult({ key: 'defaults' }, [card('a', 'Sentinel'), card('b', 'Duelist'), card('c', 'Controller')]), 2.5);
  assert.equal(tacticMult({ key: 'defaults' }, [card('a', 'Sentinel'), card('b', 'Sentinel'), card('c', 'Controller')]), CHIP_FLOOR);
  assert.equal(tacticMult({ key: 'pocket' }, [card('igl', 'Duelist')], { igl: 'igl' }), 2);
  assert.equal(tacticMult({ key: 'pocket' }, [card('x', 'Duelist')], { igl: 'igl' }), CHIP_FLOOR);
});

test('a hand saved with the old no-respect spelling still gets its chip', () => {
  const info = chipInfo('no-respect');
  assert.equal(info.key, 'noRespect');
  assert.equal(info.special, 'disrespect');
});

test('the plan reads the real squad and names who shares the lane', () => {
  const five = [card('dlt', 'Duelist'), card('ini', 'Initiator'), card('ctl', 'Controller'), card('sen', 'Sentinel'), card('ini2', 'Initiator')];
  const layers = chipPlan('layers', five);
  assert.equal(layers.mult, 2.5);
  assert.deepEqual(layers.cards.map(c => c.role).sort(), ['Controller', 'Initiator']);
  assert.equal(chipPlan('hit', five).fits, false);
  assert.deepEqual(chipPlan('pocket', five).cards.map(c => c.id), ['dlt']);
  assert.equal(chipPlan('calling', five).anyLane, true);
  assert.equal(chipPlan('noRespect', five).flick, false);
  const flicker = [...five.slice(0, 4), card('f', 'Duelist', 'flick')];
  assert.deepEqual(chipPlan('noRespect', flicker).cards.map(c => c.id), ['f']);
});
