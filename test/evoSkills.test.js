import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVO_TUNING, bestPlacement, crowdsCrown, isLegalPlacement, isLegalRotation, laneScore, nextLane, resolveBoard, sideScores,
} from '../src/engine/board/board.js';

const mockCard = (id, rating, role, org = 'org_a', nationality = 'US', learned = []) => ({
  id,
  player: id.toUpperCase(),
  rating,
  role,
  org,
  nationality,
  stats: { aim: rating, positioning: rating, ability: rating, mentality: rating, synergy: rating },
  learned,
});

const mockMap = (stat = 'aim', roles = ['Duelist', 'Initiator']) => ({
  stat,
  roles,
  agents: ['jett', 'sova'],
});

test('Anchor skill grants +24 lane bonus when sharing a lane with exactly 1 teammate', () => {
  const map = mockMap();
  const c1 = mockCard('c1', 75, 'Sentinel', 'org_a', 'US', ['anchor']);
  const c2 = mockCard('c2', 75, 'Initiator', 'org_b', 'CA', []);
  const c3 = mockCard('c3', 75, 'Controller', 'org_c', 'JP', []);

  const twoScore = laneScore([c1, c2], map);
  assert.ok(twoScore.steps.some(s => s.key === 'anchor' && s.value === 24));

  const oneScore = laneScore([c1], map);
  assert.ok(!oneScore.steps.some(s => s.key === 'anchor'));

  const threeScore = laneScore([c1, c2, c3], map);
  assert.ok(!threeScore.steps.some(s => s.key === 'anchor'));
});

test('First Blood skill grants +20 duel bonus on primary lane 0 only', () => {
  const map = mockMap();
  const fbCard = mockCard('fb', 80, 'Duelist', 'org_a', 'US', ['first_blood']);

  const lane0Score = laneScore([fbCard], map, null, { laneIndex: 0 });
  assert.ok(lane0Score.steps.some(s => s.key === 'first_blood' && s.value === 20));

  const lane1Score = laneScore([fbCard], map, null, { laneIndex: 1 });
  assert.ok(!lane1Score.steps.some(s => s.key === 'first_blood'));
});

test('Clutch skill grants +25 power when alone against 2 or more enemies', () => {
  const map = mockMap();
  const clutchCard = mockCard('clutch', 80, 'Initiator', 'org_a', 'US', ['clutch']);
  const partner = mockCard('partner', 70, 'Duelist', 'org_a', 'US', []);

  const clutchScore = laneScore([clutchCard], map, null, { enemyCount: 2 });
  assert.ok(clutchScore.steps.some(s => s.key === 'clutch' && s.value === 25));

  const vs1Score = laneScore([clutchCard], map, null, { enemyCount: 1 });
  assert.ok(!vs1Score.steps.some(s => s.key === 'clutch'));

  const duoScore = laneScore([clutchCard, partner], map, null, { enemyCount: 3 });
  assert.ok(!duoScore.steps.some(s => s.key === 'clutch'));
});

test('Synergy Link skill forms teammate combo (+15) with any card regardless of org', () => {
  const map = mockMap();
  const c1 = mockCard('c1', 80, 'Duelist', 'org_alpha', 'US', ['synergy_link']);
  const c2 = mockCard('c2', 80, 'Sentinel', 'org_beta', 'KR', []);

  const score = laneScore([c1, c2], map);
  assert.ok(score.steps.some(s => s.key === 'synergy_link' && s.value === 15));
});

test('Overdrive skill boosts other lanes by +0.2x multiplier when its lane is won', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  const youRoster = [
    mockCard('y0', 90, 'Duelist', 'org_a', 'US', ['overdrive']),
    mockCard('y1', 50, 'Initiator', 'org_a', 'US', []),
    mockCard('y2', 50, 'Controller', 'org_a', 'US', []),
    mockCard('y3', 50, 'Sentinel', 'org_a', 'US', []),
    mockCard('y4', 50, 'Duelist', 'org_a', 'US', []),
  ];
  const themRoster = [
    mockCard('t0', 50, 'Duelist', 'org_b', 'KR', []),
    mockCard('t1', 50, 'Initiator', 'org_b', 'KR', []),
    mockCard('t2', 50, 'Controller', 'org_b', 'KR', []),
    mockCard('t3', 50, 'Sentinel', 'org_b', 'KR', []),
    mockCard('t4', 50, 'Duelist', 'org_b', 'KR', []),
  ];

  const youSlots = [0, 1, 1, 2, 2];
  const themSlots = [0, 1, 1, 2, 2];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: youSlots },
    them: { roster: themRoster, slots: themSlots },
  });

  assert.equal(board.lanes[0].winner, 'you');
  assert.ok(board.lanes[1].mine.steps.some(s => s.key === 'overdrive' && s.value === 1.2));
  assert.ok(board.lanes[2].mine.steps.some(s => s.key === 'overdrive' && s.value === 1.2));
  assert.ok(!board.lanes[0].mine.steps.some(s => s.key === 'overdrive'));
});

// A card with its own org and nation, so no Team or Nation pair sneaks into a lane.
let soloCount = 0;
const solo = (id, rating, role, learned = [], stats = null) => {
  soloCount += 1;
  return { ...mockCard(id, rating, role, `org_${id}_${soloCount}`, `N${soloCount}`, learned), ...(stats ? { stats } : {}) };
};
const aimMaps = () => [mockMap('aim'), mockMap('aim'), mockMap('aim')];

test('Ironclad adds +4 and no chip works on its lane, either side', () => {
  const map = mockMap();
  const iron = solo('ic', 80, 'Initiator', ['ironclad']);

  assert.ok(laneScore([iron], map).steps.some(s => s.key === 'ironclad' && s.value === EVO_TUNING.ironclad));
  // The enemy's No Respect does nothing here...
  const dis = laneScore([iron], map, null, { disrespect: 'zero' });
  assert.ok(!dis.steps.some(s => s.key === 'disrespect'));
  // ...and neither does your own chip or a chain into the lane.
  const own = laneScore([iron], map, { key: 'hit' }, { chain: 2 });
  assert.ok(own.steps.some(s => s.key === 'cancelled' && s.label === 'Ironclad'));
  assert.ok(!own.steps.some(s => s.key === 'tactic' || s.key === 'chain'));
  assert.equal(own.total, 80 + EVO_TUNING.ironclad);
});

test('Lurk gains +6 facing exactly one enemy and cannot move at the rotate', () => {
  const map = mockMap();
  const lurker = solo('lrk', 80, 'Controller', ['lurk']);
  assert.ok(laneScore([lurker], map, null, { enemyCount: 1 }).steps.some(s => s.key === 'lurk' && s.value === EVO_TUNING.lurk));
  assert.ok(!laneScore([lurker], map, null, { enemyCount: 2 }).steps.some(s => s.key === 'lurk'));

  const roster = [lurker, solo('a', 70, 'Duelist'), solo('b', 70, 'Sentinel'), solo('c', 70, 'Initiator'), solo('d', 70, 'Duelist')];
  const locked = [0, 0, 1, 1, 2];
  assert.equal(isLegalRotation(locked, [1, 0, 1, 1, 2], roster), false);
  assert.equal(isLegalRotation(locked, [0, 1, 1, 1, 2], roster), true);
});

test('Velocity dashes to a lane lost by 4 or less and arrives at 40%, for either side', () => {
  const youRoster = [
    solo('y0', 90, 'Duelist'),
    solo('vel', 80, 'Initiator', ['velocity']),
    solo('y2', 60, 'Controller'),
    solo('y3', 60, 'Sentinel'),
    solo('y4', 60, 'Controller'),
  ];
  const themRoster = [solo('t0', 50, 'Sentinel'), solo('t1', 50, 'Sentinel'), solo('t2', 62, 'Sentinel'), solo('t3', 61, 'Sentinel'), solo('t4', 40, 'Sentinel')];
  const slots = { you: [0, 1, 1, 2, 2], them: [0, 1, 2, 2, 0] };

  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: slots.you }, them: { roster: themRoster, slots: slots.them } });
  const spent = Math.ceil(80 * (1 - EVO_TUNING.velocityKeep));
  assert.deepEqual(board.velocityMoves.map(m => [m.side, m.fromLane, m.toLane, m.fatigue]), [['you', 1, 2, spent]]);
  assert.equal(board.lanes[2].winner, 'you');
  assert.equal(board.lanes[2].mine.total, 60 + 60 + 80 - spent);

  // The same board from the other chair: the enemy's Velocity works too.
  const flipped = resolveBoard({ maps: aimMaps(), you: { roster: themRoster, slots: slots.them }, them: { roster: youRoster, slots: slots.you } });
  assert.deepEqual(flipped.velocityMoves.map(m => [m.side, m.toLane]), [['them', 2]]);
});

test('Velocity stays put when the losing lane is out of reach', () => {
  const youRoster = [solo('y0', 90, 'Duelist'), solo('vel', 80, 'Initiator', ['velocity']), solo('y2', 60, 'Controller'), solo('y3', 50, 'Sentinel'), solo('y4', 50, 'Controller')];
  const themRoster = [solo('t0', 50, 'Sentinel'), solo('t1', 50, 'Sentinel'), solo('t2', 90, 'Sentinel'), solo('t3', 60, 'Sentinel'), solo('t4', 40, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: [0, 1, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 2, 2, 0] } });
  assert.equal(board.velocityMoves.length, 0);
});

test('Combustion burns 5 fuel on its lane and, on a win, cuts the next lane enemy star', () => {
  assert.deepEqual([0, 1, 2].map(nextLane), [1, 2, 1]);
  const youRoster = [solo('sol', 90, 'Duelist', ['combustion']), solo('y1', 70, 'Initiator'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Sentinel'), solo('y4', 70, 'Duelist')];
  const themRoster = [solo('t0', 50, 'Sentinel'), solo('star', 90, 'Sentinel'), solo('t2', 60, 'Sentinel'), solo('t3', 60, 'Sentinel'), solo('t4', 60, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: [0, 1, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 1, 2, 2] } });

  assert.ok(board.lanes[0].mine.steps.some(s => s.key === 'combustion_fuel' && s.value === EVO_TUNING.combustionFuel));
  assert.equal(board.lanes[0].mine.total, 90 - EVO_TUNING.combustionFuel);
  assert.ok(board.lanes[1].theirs.steps.some(s => s.key === 'combustion' && s.value === 10));
  assert.ok(board.effects.some(e => e.key === 'combustion' && e.toLane === 1 && e.card.id === 'star'));
});

test('Phase voids the best enemy facing it and scores half itself', () => {
  const youRoster = [solo('phs', 80, 'Duelist', ['phase']), solo('y1', 70, 'Initiator'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Sentinel'), solo('y4', 70, 'Duelist')];
  const themRoster = [solo('star', 90, 'Sentinel'), solo('t1', 60, 'Sentinel'), solo('t2', 60, 'Sentinel'), solo('t3', 60, 'Sentinel'), solo('t4', 60, 'Sentinel')];
  const [lane0] = sideScores({ roster: themRoster, slots: [0, 0, 1, 1, 2], maps: aimMaps(), enemyRoster: youRoster, enemySlots: [0, 1, 1, 2, 2], enemyCounts: [1, 2, 2] });
  assert.ok(lane0.steps.some(s => s.key === 'player' && s.label === 'STAR' && s.value === 0 && s.voided));
  assert.equal(lane0.total, 60);

  const [mine] = sideScores({ roster: youRoster, slots: [0, 1, 1, 2, 2], maps: aimMaps(), enemyRoster: themRoster, enemySlots: [0, 0, 1, 1, 2], enemyCounts: [2, 2, 1] });
  assert.equal(mine.total, Math.round(80 * EVO_TUNING.phaseKeep));
});

test('Timewarp does nothing inside a board: it works on the series', () => {
  const youRoster = [solo('trp', 80, 'Initiator', ['timewarp']), solo('y1', 70, 'Duelist'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Sentinel'), solo('y4', 70, 'Duelist')];
  const themRoster = [solo('t0', 50, 'Sentinel'), solo('t1', 74, 'Sentinel'), solo('t2', 70, 'Sentinel'), solo('t3', 70, 'Sentinel'), solo('t4', 70, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: [0, 1, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 1, 2, 2] } });
  assert.ok(board.lanes.every(lane => !lane.mine.steps.some(s => s.key === 'timewarp')));
});

test('Surge strikes the next lane: -8 per enemy card there, -2 per own card', () => {
  const youRoster = [solo('srg', 80, 'Duelist', ['surge']), solo('partner', 75, 'Initiator'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Sentinel'), solo('y4', 70, 'Duelist')];
  const themRoster = [solo('t0', 70, 'Sentinel'), solo('t1', 70, 'Sentinel'), solo('t2', 70, 'Sentinel'), solo('t3', 70, 'Sentinel'), solo('t4', 70, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: [0, 0, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 1, 2, 2] } });
  assert.ok(board.lanes[1].theirs.steps.some(s => s.key === 'surge' && s.value === EVO_TUNING.surgeEnemy * 2));
  assert.ok(board.lanes[1].mine.steps.some(s => s.key === 'surge' && s.value === EVO_TUNING.surgeAlly));
});

test('Ascendance: a lost lane sends her to the closest losing lane at 75%', () => {
  const youRoster = [solo('valk', 70, 'Duelist', ['ascendance']), solo('y1', 60, 'Initiator'), solo('y2', 60, 'Controller'), solo('y3', 60, 'Sentinel'), solo('y4', 40, 'Duelist')];
  const themRoster = [solo('t0', 95, 'Sentinel'), solo('t1', 65, 'Sentinel'), solo('t2', 60, 'Sentinel'), solo('t3', 50, 'Sentinel'), solo('t4', 30, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: [0, 1, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 1, 2, 0] } });
  assert.equal(board.lanes[0].mine.total, 0);
  assert.equal(board.lanes[1].mine.total, 120 + Math.round(70 * EVO_TUNING.ascendanceKeep));
  assert.equal(board.lanes[1].winner, 'you');
});

test('Dominion plays alone on her best stat, and her lane counts double', () => {
  const sov = solo('dmn', 85, 'Sentinel', ['dominion'], { aim: 70, positioning: 95, ability: 70, mentality: 70, synergy: 70 });
  const roster = [sov, solo('y1', 70, 'Initiator'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Duelist'), solo('y4', 70, 'Duelist')];
  assert.equal(crowdsCrown([0, 0, 1, 1, 2], roster), true);
  assert.equal(isLegalPlacement([0, 0, 1, 1, 2], roster), false);
  assert.equal(isLegalPlacement([0, 1, 1, 2, 2], roster), true);
  const placed = bestPlacement({ roster, maps: aimMaps() });
  assert.equal(placed.slots.filter(slot => slot === placed.slots[0]).length, 1);

  assert.equal(laneScore([sov], mockMap('aim')).total, 95);
  const themRoster = [solo('t0', 50, 'Sentinel'), solo('t1', 90, 'Sentinel'), solo('t2', 90, 'Sentinel'), solo('t3', 60, 'Sentinel'), solo('t4', 60, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster, slots: [0, 1, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 1, 2, 2] } });
  assert.equal(board.lanes[0].weight, 2);
  assert.equal(board.lanes[0].winner, 'you');
  assert.equal(board.youWon, 2 + (board.lanes[2].winner === 'you' ? 1 : 0));
});

test('Dominion voids the enemy chip on her lane', () => {
  const roster = [solo('dmn', 85, 'Sentinel', ['dominion']), solo('y1', 70, 'Initiator'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Duelist'), solo('y4', 70, 'Duelist')];
  const them = [solo('t0', 70, 'Duelist'), solo('t1', 70, 'Initiator'), solo('t2', 70, 'Sentinel'), solo('t3', 70, 'Sentinel'), solo('t4', 70, 'Sentinel')];
  const scores = sideScores({ roster: them, slots: [0, 0, 1, 1, 2], maps: aimMaps(), tactics: [{ lane: 0, card: { key: 'hit' } }], enemyRoster: roster, enemySlots: [0, 1, 1, 2, 2] });
  assert.ok(scores[0].steps.some(s => s.key === 'cancelled'));
});

test('Black Hole pulls the enemy star in at half its stats', () => {
  const youRoster = [solo('sing', 92, 'Controller', ['black_hole']), solo('y1', 70, 'Initiator'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Sentinel'), solo('y4', 70, 'Duelist')];
  const themRoster = [solo('t0', 50, 'Sentinel'), solo('star', 95, 'Sentinel'), solo('t2', 60, 'Sentinel'), solo('t3', 60, 'Sentinel'), solo('t4', 60, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: [0, 1, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 1, 2, 2] } });
  assert.equal(board.displacements[0].card.id, 'star');
  assert.deepEqual([board.displacements[0].fromLane, board.displacements[0].toLane], [1, 0]);
  assert.ok(board.lanes[0].theirs.steps.some(s => s.label === 'STAR' && s.value === Math.round(95 * EVO_TUNING.blackHoleKeep)));
});

test('Overdrive tilts the other lanes when its lane is lost', () => {
  const youRoster = [solo('ovd', 50, 'Duelist', ['overdrive']), solo('y1', 70, 'Initiator'), solo('y2', 70, 'Controller'), solo('y3', 70, 'Sentinel'), solo('y4', 70, 'Duelist')];
  const themRoster = [solo('t0', 90, 'Sentinel'), solo('t1', 50, 'Sentinel'), solo('t2', 50, 'Sentinel'), solo('t3', 50, 'Sentinel'), solo('t4', 50, 'Sentinel')];
  const board = resolveBoard({ maps: aimMaps(), you: { roster: youRoster, slots: [0, 1, 1, 2, 2] }, them: { roster: themRoster, slots: [0, 1, 1, 2, 2] } });
  assert.equal(board.lanes[0].winner, 'them');
  assert.ok(board.lanes[1].mine.steps.some(s => s.key === 'overdrive' && s.value === EVO_TUNING.overdriveTilt));
});
