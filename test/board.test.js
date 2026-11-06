import test from 'node:test';
import assert from 'node:assert/strict';
import {
   BOARD_SKILLS, allPlacements, chainLane, sideScores, bestPlacement, bestRotate, hasSkill, isLegalPlacement, isLegalRotate, isLegalRotation, laneFormula,
  laneScore, resolveBoard, rotate, rotateMoves, playBoard, seriesWinner, winsNeeded,
} from '../src/engine/board/board.js';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import { getCardSpecialties } from '../shared/src/data/specialties.js';
import { MAP_LANES } from '../src/engine/board/mapLanes.js';
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

// Real specialties come from a curated list, so these tests borrow real cards.
const withSkill = key => allCards.find(item => item.org && hasSkill(item, key));

test('Flick scores the best stat only when alone on a lane', () => {
  const flicker = withSkill('flick');
  const lane = { ...map, stat: 'synergy', roles: ['Nobody', 'Nobody'] };
  assert.equal(laneScore([flicker], lane).total, Math.max(...Object.values(flicker.stats)));
  const pair = laneScore([flicker, { ...squad[3], org: null, nationality: null }], lane);
  assert.equal(pair.steps[0].value, flicker.stats.synergy);
});

test('One Trick pays only on a map that suits their agent', () => {
  const trick = allCards.find(item => hasSkill(item, 'one_trick') && item.agents?.length === 1);
  const roles = ['Nobody', 'Nobody'];
  const home = laneScore([trick], { ...map, stat: 'aim', roles, agents: [trick.agents[0]] });
  const away = laneScore([trick], { ...map, stat: 'aim', roles, agents: ['Nobody'] });
  assert.equal(home.total - away.total, 20);
});

test('Aura takes from the opposing total on its lane, and the sum shows it', () => {
  const aura = withSkill('aura');
  const plain = { ...squad[0], org: null, nationality: null };
  const others = [squad[1], squad[2], squad[3], squad[4]];
  const result = resolveBoard({
    maps,
    you: { roster: [plain, ...others], slots: [0, 0, 1, 1, 2], tactic: null },
    them: { roster: [aura, ...others], slots: [0, 0, 1, 1, 2], tactic: null },
  });
  const lane = result.lanes[0];
  assert.equal(lane.mine.steps.at(-1).key, 'aura');
  assert.equal(lane.mine.steps.at(-1).value, 15);
  assert.match(laneFormula(lane.mine.steps), /-15 Aura/);
});

test('the IGL gets one rotate, a Mastermind two, and Flex players move free', () => {
  const plain = squad;
  assert.equal(rotateMoves(plain), 1);
  assert.equal(isLegalRotation([0, 0, 1, 1, 2], [2, 0, 1, 1, 2], plain), true);
  assert.equal(isLegalRotation([0, 0, 1, 1, 2], [2, 2, 1, 1, 0], plain), false);
  const mind = [withSkill('mastermind'), ...plain.slice(1)];
  assert.equal(rotateMoves(mind), 2);
  assert.equal(isLegalRotation([0, 0, 1, 1, 2], [2, 0, 1, 0, 2], mind), true);
  const flex = [...plain.slice(0, 4), withSkill('flex')];
  assert.equal(isLegalRotation([0, 0, 1, 1, 2], [2, 0, 1, 1, 0], flex), true);
});

test('bestRotate only ever reaches a legal board', () => {
  const you = { roster: squad, slots: [0, 0, 1, 1, 2], tactic: null };
  const them = { roster: squad, slots: [1, 2, 2, 0, 0], tactic: null };
  assert.equal(isLegalRotation(you.slots, bestRotate({ you, them, maps }), squad), true);
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

test('every board skill has a specialty badge with its board rule and includes learned club skills', () => {
  const trained = { ...card('trained', 78, 'Initiator'), learned: ['flex'] };
  const specs = getCardSpecialties(trained);
  assert.deepEqual(specs.map(spec => spec.key), ['flex']);
  for (const [key, rule] of Object.entries(BOARD_SKILLS)) {
    const spec = getCardSpecialties({ ...card(key, 80, 'Duelist'), learned: [key] })[0];
    assert.equal(spec.board, rule.text);
    assert.ok(spec.color);
  }
});

// ── chips with board rules of their own ─────────────────────────────────────

const even = ['a', 'b', 'c', 'd', 'e'].map(id => card(id, 80, ['Duelist', 'Initiator', 'Controller', 'Sentinel', 'Duelist'][id.charCodeAt(0) - 97]));
const evenSlots = [0, 0, 1, 1, 2];
const plainMaps = maps.map(item => ({ ...item, roles: ['Nobody', 'Nobody'] }));

test('Second Call multiplies its lane and chains to the lane on its left', () => {
  const plain = sideScores({ roster: even, slots: evenSlots, maps: plainMaps });
  const called = sideScores({ roster: even, slots: evenSlots, maps: plainMaps, tactic: { lane: 1, card: { key: 'calling' } } });
  assert.equal(called[1].total, plain[1].total * 2);
  assert.equal(called[0].total, Math.round(plain[0].total * 1.5));
  assert.equal(called[0].steps.at(-1).key, 'chain');
  assert.equal(called[2].total, plain[2].total);
  assert.equal(chainLane(0), 1);
  assert.equal(chainLane(2), 1);
});

test('Lock the Map cancels only the enemy chip facing it', () => {
  const you = { roster: even, slots: evenSlots, tactics: [{ lane: 2, card: { key: 'layers' } }, { lane: 1, card: { key: 'defaults' } }] };
  const them = { roster: even, slots: evenSlots, tactics: [{ lane: 2, card: { key: 'lockout' } }] };
  const board = resolveBoard({ maps: plainMaps, you, them });
  assert.equal(board.lanes[2].mine.steps.at(-1).key, 'cancelled');
  assert.ok(board.lanes[1].mine.steps.some(step => step.key === 'tactic'));
  // From another lane it reaches nothing.
  const across = resolveBoard({ maps: plainMaps, you, them: { ...them, tactics: [{ lane: 0, card: { key: 'lockout' } }] } });
  assert.ok(!across.lanes[2].mine.steps.some(step => step.key === 'cancelled'));
});

test('each lane holds its own chip, and a chain skips a lane with your chip', () => {
  const called = sideScores({ roster: even, slots: evenSlots, maps: plainMaps, tactics: [{ lane: 1, card: { key: 'calling' } }] });
  assert.ok(called[0].steps.some(step => step.key === 'chain'));
  const both = sideScores({ roster: even, slots: evenSlots, maps: plainMaps, tactics: [{ lane: 1, card: { key: 'calling' } }, { lane: 0, card: { key: 'pocket' } }] });
  assert.ok(!both[0].steps.some(step => step.key === 'chain'));
  assert.ok(both[0].steps.some(step => step.key === 'tactic'));
});

test('the bot lays each of its chips on a different lane', () => {
  const plan = bestPlacement({ roster: even, maps: plainMaps, tactics: [{ key: 'layers' }, { key: 'defaults' }] });
  assert.equal(plan.tactics.length, 2);
  assert.notEqual(plan.tactics[0].lane, plan.tactics[1].lane);
});

test('No Respect cuts the enemy star on its lane', () => {
  const lane = [card('x', 90, 'Duelist'), card('y', 60, 'Sentinel')];
  const half = laneScore(lane, plainMaps[0], null, { disrespect: 'half' });
  assert.equal(half.total, 60 + 45);
  assert.equal(half.steps.find(step => step.key === 'disrespect').player, 'x');
  assert.equal(laneScore(lane, plainMaps[0], null, { disrespect: 'zero' }).total, 60);
  // On its own lane it adds no multiplier, unless a Flick player is there.
  assert.equal(laneScore(lane, plainMaps[0], { key: 'noRespect' }).total, 150);
  const you = { roster: even, slots: evenSlots, tactic: { lane: 0, card: { key: 'noRespect' } } };
  const board = resolveBoard({ maps: plainMaps, you, them: { roster: even, slots: evenSlots, tactic: null } });
  assert.equal(board.lanes[0].theirs.steps.find(step => step.key === 'disrespect').value, 80);
});
