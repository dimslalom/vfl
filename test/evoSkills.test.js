import test from 'node:test';
import assert from 'node:assert/strict';
import { laneScore, resolveBoard } from '../src/engine/board/board.js';

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

  // 2 players on lane with anchor: fires +24 Anchor bonus
  const twoScore = laneScore([c1, c2], map);
  assert.ok(twoScore.steps.some(s => s.key === 'anchor' && s.value === 24));

  // 1 player alone: anchor does not fire
  const oneScore = laneScore([c1], map);
  assert.ok(!oneScore.steps.some(s => s.key === 'anchor'));

  // 3 players: anchor requires exactly 1 teammate (2 players total)
  const threeScore = laneScore([c1, c2, c3], map);
  assert.ok(!threeScore.steps.some(s => s.key === 'anchor'));
});

test('First Blood skill grants +20 duel bonus on primary lane 0 only', () => {
  const map = mockMap();
  const fbCard = mockCard('fb', 80, 'Duelist', 'org_a', 'US', ['first_blood']);

  // Lane 0: First Blood triggers
  const lane0Score = laneScore([fbCard], map, null, { laneIndex: 0 });
  assert.ok(lane0Score.steps.some(s => s.key === 'first_blood' && s.value === 20));

  // Lane 1: First Blood does not trigger
  const lane1Score = laneScore([fbCard], map, null, { laneIndex: 1 });
  assert.ok(!lane1Score.steps.some(s => s.key === 'first_blood'));
});

test('Clutch skill grants +25 power when alone against 2 or more enemies', () => {
  const map = mockMap();
  const clutchCard = mockCard('clutch', 80, 'Initiator', 'org_a', 'US', ['clutch']);
  const partner = mockCard('partner', 70, 'Duelist', 'org_a', 'US', []);

  // Alone vs 2 enemies: triggers Clutch (+25)
  const clutchScore = laneScore([clutchCard], map, null, { enemyCount: 2 });
  assert.ok(clutchScore.steps.some(s => s.key === 'clutch' && s.value === 25));

  // Alone vs 1 enemy: does not trigger
  const vs1Score = laneScore([clutchCard], map, null, { enemyCount: 1 });
  assert.ok(!vs1Score.steps.some(s => s.key === 'clutch'));

  // Not alone (2 friendly cards): does not trigger even vs 3 enemies
  const duoScore = laneScore([clutchCard, partner], map, null, { enemyCount: 3 });
  assert.ok(!duoScore.steps.some(s => s.key === 'clutch'));
});

test('Synergy Link skill forms teammate combo (+15) with any card regardless of org', () => {
  const map = mockMap();
  const c1 = mockCard('c1', 80, 'Duelist', 'org_alpha', 'US', ['synergy_link']);
  const c2 = mockCard('c2', 80, 'Sentinel', 'org_beta', 'KR', []);

  // Different orgs, different nationality, but c1 has synergy_link -> Link combo (+15)
  const score = laneScore([c1, c2], map);
  assert.ok(score.steps.some(s => s.key === 'synergy_link' && s.value === 15));
});

test('Overdrive skill boosts other lanes by +0.2x multiplier when its lane is won', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  // Lane 0: Overdrive player with 90 rating vs 50 rating -> Lane 0 wins!
  // Lane 1: 50 rating vs 50 rating (normally tied or close)
  // Lane 2: 50 rating vs 50 rating
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

  // Placements: Lane 0 has 1 card each, Lane 1 has 2 cards each, Lane 2 has 2 cards each
  const youSlots = [0, 1, 1, 2, 2];
  const themSlots = [0, 1, 1, 2, 2];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: youSlots },
    them: { roster: themRoster, slots: themSlots },
  });

  // Lane 0 was won by you with Overdrive
  assert.equal(board.lanes[0].winner, 'you');
  // Lane 1 and Lane 2 for 'you' received the +0.2x Overdrive step (x1.2 multiplier)!
  assert.ok(board.lanes[1].mine.steps.some(s => s.key === 'overdrive' && s.value === 1.2));
  assert.ok(board.lanes[2].mine.steps.some(s => s.key === 'overdrive' && s.value === 1.2));
  // Lane 0 itself did NOT get boosted by its own overdrive
  assert.ok(!board.lanes[0].mine.steps.some(s => s.key === 'overdrive'));
});
