import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allPlacements, bestPlacement, isLegalPlacement, isLegalRotate, laneFormula, laneScore, resolveBoard, rotate, playBoard,
} from '../src/engine/board/board.js';
import { MAP_LANES, seriesWinner, winsNeeded } from '../src/engine/board/mapLanes.js';
import { MAP_NAMES } from '../src/engine/endless/seriesCards.js';

const stats = value => ({ aim: value, positioning: value, ability: value, mentality: value, synergy: value });
const card = (id, rating, role, org = null, nationality = null) => ({ id, player: id, rating, role, org, nationality, stats: stats(rating) });
const map = { name: 'A', stat: 'aim', label: 'FAST LANES', roles: ['Duelist', 'Initiator'] };
const maps = [map, { ...map, name: 'Mid', stat: 'ability', roles: ['Controller', 'Sentinel'] }, { ...map, name: 'B', stat: 'positioning', roles: ['Duelist', 'Controller'] }];
const squad = [card('a', 90, 'Duelist'), card('b', 85, 'Initiator'), card('c', 80, 'Controller'), card('d', 75, 'Sentinel'), card('e', 70, 'Duelist')];

test('every placement fills all three maps and none takes more than three', () => {
  const placements = allPlacements();
  assert.equal(placements.length, 150);
  assert.ok(placements.every(isLegalPlacement));
  assert.equal(isLegalPlacement([0, 0, 0, 0, 1]), false);
  assert.equal(isLegalPlacement([0, 0, 1, 1, 1]), false);
});

test('a lane adds the stat it asks for, then bonuses, and only a tactic multiplies', () => {
  const pair = [{ ...squad[0], stats: { ...stats(1), aim: 84 } }, { ...squad[1], stats: { ...stats(1), aim: 77 } }];
  const plain = laneScore(pair, map);
  assert.deepEqual(plain.steps.map(step => step.key), ['player', 'player', 'rule']);
  assert.equal(plain.total, 84 + 77 + 20);
  assert.equal(laneFormula(plain.steps), '161  +20 Roles');
  const called = laneScore(pair, map, { key: 'hit' });
  assert.equal(called.steps.at(-1).key, 'tactic');
  assert.equal(called.total, Math.round(181 * called.steps.at(-1).value));
  assert.ok(called.steps.at(-1).value % 0.5 === 0);
});

test('the visible sum groups repeated bonuses', () => {
  const trio = ['x', 'y', 'z'].map(id => card(id, 80, 'Sentinel', 'FNC'));
  assert.equal(laneFormula(laneScore(trio, map).steps), '240  +45 Team');
});

test('real teammates are worth more than countrymen', () => {
  const mates = laneScore([card('x', 80, 'Sentinel', 'FNC', 'SE'), card('y', 80, 'Sentinel', 'FNC', 'SE')], { ...map, roles: ['Duelist', 'Initiator'] });
  const country = laneScore([card('x', 80, 'Sentinel', 'FNC', 'SE'), card('y', 80, 'Sentinel', 'G2', 'SE')], { ...map, roles: ['Duelist', 'Initiator'] });
  assert.ok(mates.total > country.total);
});

test('two maps win it, and a one-all board falls to the higher total', () => {
  const you = { roster: squad, slots: [0, 0, 1, 1, 2], tactic: null };
  const weak = squad.map(player => ({ ...player, rating: 62 }));
  assert.equal(resolveBoard({ maps, you, them: { roster: weak, slots: [0, 0, 1, 1, 2], tactic: null } }).winner, 'you');
});

test('the IGL rotate has to keep the board legal', () => {
  assert.equal(isLegalRotate([0, 0, 1, 1, 2], 4, 0), false);
  assert.equal(isLegalRotate([0, 0, 1, 1, 2], 0, 2), true);
  assert.deepEqual(rotate([0, 0, 1, 1, 2], 0, 2), [2, 0, 1, 1, 2]);
});

test('a board replays identically from its seed', () => {
  const side = { roster: squad, tactic: { key: 'hit' } };
  assert.deepEqual(playBoard({ seed: 9, you: side, them: side, maps }), playBoard({ seed: 9, you: side, them: side, maps }));
  assert.ok(isLegalPlacement(bestPlacement({ roster: squad, maps }).slots));
});

test('every map has three real lanes, and the three-site maps have no mid', () => {
  assert.deepEqual(Object.keys(MAP_LANES).sort(), [...MAP_NAMES].sort());
  for (const lanes of Object.values(MAP_LANES)) {
    assert.equal(lanes.length, 3);
    assert.ok(lanes.every(lane => lane.roles.length === 2));
    assert.ok(lanes.every(lane => ['aim', 'positioning', 'ability', 'mentality', 'synergy'].includes(lane.stat)));
  }
  assert.deepEqual(MAP_LANES.Lotus.map(lane => lane.name), ['A', 'B', 'C']);
  assert.deepEqual(MAP_LANES.Haven.map(lane => lane.name), ['A', 'B', 'C']);
  assert.deepEqual(MAP_LANES.Ascent.map(lane => lane.name), ['A', 'Mid', 'B']);
  assert.equal(MAP_LANES.Bind.some(lane => lane.name === 'Mid'), false);
});

test('a series ends at the majority of its rounds', () => {
  assert.equal(winsNeeded(3), 2);
  assert.equal(winsNeeded(5), 3);
  assert.equal(seriesWinner(3, 1, 1), null);
  assert.equal(seriesWinner(3, 2, 0), 'you');
  assert.equal(seriesWinner(5, 2, 2), null);
  assert.equal(seriesWinner(5, 1, 3), 'them');
});
