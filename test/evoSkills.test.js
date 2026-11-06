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

test('Ironclad skill grants +3 armor and makes lane immune to No Respect and Lockout', () => {
  const map = mockMap();
  const ironCard = mockCard('ic', 80, 'Initiator', 'org_a', 'US', ['ironclad']);

  // Normal score gains +3 Ironclad armor
  const normalScore = laneScore([ironCard], map);
  assert.ok(normalScore.steps.some(s => s.key === 'ironclad' && s.value === 3));

  // Immune to No Respect: disrespect step is ignored
  const disScore = laneScore([ironCard], map, null, { disrespect: 'zero' });
  assert.ok(!disScore.steps.some(s => s.key === 'disrespect'));
  assert.equal(disScore.total, 80 + 3);

  // Immune to Lockout: cancelled step is ignored
  const cancelScore = laneScore([ironCard], map, { key: 'hit' }, { cancelled: true });
  assert.ok(!cancelScore.steps.some(s => s.key === 'cancelled'));
});

test('Lurk skill grants +4 duel power when opposing lane has only 1 card', () => {
  const map = mockMap();
  const lurkCard = mockCard('lrk', 80, 'Controller', 'org_a', 'US', ['lurk']);

  // Facing 1 enemy: triggers Lurk (+4)
  const vs1Score = laneScore([lurkCard], map, null, { enemyCount: 1 });
  assert.ok(vs1Score.steps.some(s => s.key === 'lurk' && s.value === 4));

  // Facing 2 enemies: does not trigger
  const vs2Score = laneScore([lurkCard], map, null, { enemyCount: 2 });
  assert.ok(!vs2Score.steps.some(s => s.key === 'lurk'));
});

test('Velocity skill automatically rotates to flip a losing lane during resolve', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  // Lane 0: You has 90 rating, enemy has 50 (You win Lane 0 easily)
  // Lane 1: You has Velocity (80 rating) + filler (50 rating) = 130, enemy has 50 (Lane 1 is crushing win)
  // Lane 2: You has filler (50 rating), enemy has 70 rating (You are losing Lane 2 by 20 points!)
  // Velocity can move from Lane 1 to Lane 2:
  // - Lane 1 remaining: 50 vs 50 (ties/holds)
  // - Lane 2 with Velocity: 50 + 80 - 4 fatigue = 126 vs 70 -> FLIPS TO WIN!
  const youRoster = [
    mockCard('y0', 90, 'Duelist', 'org_a', 'US', []),
    mockCard('vel', 80, 'Initiator', 'org_a', 'US', ['velocity']),
    mockCard('y2', 60, 'Controller', 'org_a', 'US', []),
    mockCard('y3', 50, 'Sentinel', 'org_a', 'US', []),
    mockCard('y4', 50, 'Duelist', 'org_a', 'US', []),
  ];
  const themRoster = [
    mockCard('t0', 50, 'Duelist', 'org_b', 'KR', []),
    mockCard('t1', 50, 'Initiator', 'org_b', 'KR', []),
    mockCard('t2', 70, 'Controller', 'org_b', 'KR', []),
    mockCard('t3', 50, 'Sentinel', 'org_b', 'KR', []),
    mockCard('t4', 50, 'Duelist', 'org_b', 'KR', []),
  ];

  const youSlots = [0, 1, 1, 2, 2];
  const themSlots = [0, 1, 2, 2, 2];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: youSlots },
    them: { roster: themRoster, slots: themSlots },
  });

  // Verify velocityMoves recorded the shift
  assert.ok(board.velocityMoves.length > 0);
  assert.equal(board.velocityMoves[0].fromLane, 1);
  assert.equal(board.velocityMoves[0].toLane, 2);
  // Lane 2 was flipped to 'you' win with fatigue step!
  assert.equal(board.lanes[2].winner, 'you');
  assert.ok(board.lanes[2].mine.steps.some(s => s.key === 'fatigue' && s.value === 4));
});

test('Solstice skill blinds adjacent enemy star on win for 20% (up to -10)', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  // Lane 0: You has Solstice (90) vs enemy (50) -> You win Lane 0!
  // Lane 1: Enemy has a 90 rating star player
  const youRoster = [
    mockCard('sol', 90, 'Duelist', 'org_a', 'US', ['combustion']),
    mockCard('y1', 70, 'Initiator', 'org_a', 'US', []),
    mockCard('y2', 70, 'Controller', 'org_a', 'US', []),
    mockCard('y3', 70, 'Sentinel', 'org_a', 'US', []),
    mockCard('y4', 70, 'Duelist', 'org_a', 'US', []),
  ];
  const themRoster = [
    mockCard('t0', 50, 'Duelist', 'org_b', 'KR', []),
    mockCard('star', 90, 'Initiator', 'org_b', 'KR', []),
    mockCard('t2', 60, 'Controller', 'org_b', 'KR', []),
    mockCard('t3', 60, 'Sentinel', 'org_b', 'KR', []),
    mockCard('t4', 60, 'Duelist', 'org_b', 'KR', []),
  ];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: [0, 1, 1, 2, 2] },
    them: { roster: themRoster, slots: [0, 1, 1, 2, 2] },
  });

  assert.equal(board.lanes[0].winner, 'you');
  // Adjacent Lane 1 has Solar Eclipse deduction (-10 max on 90 rating star)
  assert.ok(board.lanes[1].theirs.steps.some(s => s.key === 'combustion' && s.value === 10));
});

test('Phase skill siphons +4 when facing enemy with active synergy', () => {
  const map = mockMap();
  const phaseCard = mockCard('phs', 80, 'Duelist', 'org_a', 'US', ['phase']);

  // Enemy has synergy: +4 Phase siphon
  const synScore = laneScore([phaseCard], map, null, { enemyHasSynergy: true });
  assert.ok(synScore.steps.some(s => s.key === 'phase' && s.value === 4));

  // Enemy has no synergy: does not trigger
  const noSynScore = laneScore([phaseCard], map, null, { enemyHasSynergy: false });
  assert.ok(!noSynScore.steps.some(s => s.key === 'phase'));
});

test('Timewarp skill grants +6 Temporal Surge to an allied lane trailing by <= 6', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  // Lane 0: You has Timewarp (80) vs enemy (50) -> You win Lane 0
  // Lane 1: You has 70 vs enemy 74 -> You are losing by 4 (<= 6)!
  const youRoster = [
    mockCard('trp', 80, 'Initiator', 'org_a', 'US', ['timewarp']),
    mockCard('y1', 70, 'Duelist', 'org_a', 'US', []),
    mockCard('y2', 70, 'Controller', 'org_a', 'US', []),
    mockCard('y3', 70, 'Sentinel', 'org_a', 'US', []),
    mockCard('y4', 70, 'Duelist', 'org_a', 'US', []),
  ];
  const themRoster = [
    mockCard('t0', 50, 'Duelist', 'org_b', 'KR', []),
    mockCard('t1', 74, 'Initiator', 'org_b', 'KR', []),
    mockCard('t2', 70, 'Controller', 'org_b', 'KR', []),
    mockCard('t3', 70, 'Sentinel', 'org_b', 'KR', []),
    mockCard('t4', 70, 'Duelist', 'org_b', 'KR', []),
  ];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: [0, 1, 1, 2, 2] },
    them: { roster: themRoster, slots: [0, 1, 1, 2, 2] },
  });

  // Lane 1 received +6 Temporal Surge and flipped to a win (76 vs 74)!
  assert.ok(board.lanes[1].mine.steps.some(s => s.key === 'timewarp' && s.value === 6));
  assert.equal(board.lanes[1].winner, 'you');
});

test('Surge skill shocks adjacent enemy lane for -4 when paired with an ally', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  const youRoster = [
    mockCard('srg', 80, 'Duelist', 'org_a', 'US', ['surge']),
    mockCard('partner', 75, 'Initiator', 'org_a', 'US', []),
    mockCard('y2', 70, 'Controller', 'org_a', 'US', []),
    mockCard('y3', 70, 'Sentinel', 'org_a', 'US', []),
    mockCard('y4', 70, 'Duelist', 'org_a', 'US', []),
  ];
  const themRoster = [
    mockCard('t0', 70, 'Duelist', 'org_b', 'KR', []),
    mockCard('t1', 70, 'Initiator', 'org_b', 'KR', []),
    mockCard('t2', 70, 'Controller', 'org_b', 'KR', []),
    mockCard('t3', 70, 'Sentinel', 'org_b', 'KR', []),
    mockCard('t4', 70, 'Duelist', 'org_b', 'KR', []),
  ];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: [0, 0, 1, 2, 2] },
    them: { roster: themRoster, slots: [0, 1, 1, 2, 2] },
  });

  // Lane 0 has 2 cards with surge -> shocks adjacent Lane 1 for -4
  assert.ok(board.lanes[1].theirs.steps.some(s => s.key === 'surge' && s.value === 4));
});

test('Valkyrie skill grants +8 Divine Blessing to an allied lane trailing by <= 10', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  // Lane 0: You has Valkyrie (93) vs enemy 60 -> You win Lane 0 easily
  // Lane 1: You has 70 vs enemy 76 -> You are trailing by 6 (<= 10)!
  const youRoster = [
    mockCard('valk', 93, 'Duelist', 'org_a', 'US', ['ascendance']),
    mockCard('y1', 70, 'Initiator', 'org_a', 'US', []),
    mockCard('y2', 70, 'Controller', 'org_a', 'US', []),
    mockCard('y3', 70, 'Sentinel', 'org_a', 'US', []),
    mockCard('y4', 70, 'Duelist', 'org_a', 'US', []),
  ];
  const themRoster = [
    mockCard('t0', 60, 'Duelist', 'org_b', 'KR', []),
    mockCard('t1', 76, 'Initiator', 'org_b', 'KR', []),
    mockCard('t2', 70, 'Controller', 'org_b', 'KR', []),
    mockCard('t3', 70, 'Sentinel', 'org_b', 'KR', []),
    mockCard('t4', 70, 'Duelist', 'org_b', 'KR', []),
  ];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: [0, 1, 1, 2, 2] },
    them: { roster: themRoster, slots: [0, 1, 1, 2, 2] },
  });

  // Lane 1 receives +8 Divine Blessing and flips to win (78 vs 76)
  assert.ok(board.lanes[1].mine.steps.some(s => s.key === 'ascendance' && s.value === 8));
  assert.equal(board.lanes[1].winner, 'you');
});

test('Sovereign skill collects 2 points per active enemy synergy up to +8', () => {
  const map = mockMap();
  const dmnCard = mockCard('dmn', 93, 'Sentinel', 'org_a', 'US', ['dominion']);

  // 3 enemy synergies active -> 3 * 2 = +6 Dominion tribute
  const score3 = laneScore([dmnCard], map, null, { enemyTotalSynergies: 3 });
  assert.ok(score3.steps.some(s => s.key === 'dominion' && s.value === 6));

  // 6 enemy synergies active -> capped at +8
  const scoreCapped = laneScore([dmnCard], map, null, { enemyTotalSynergies: 6 });
  assert.ok(scoreCapped.steps.some(s => s.key === 'dominion' && s.value === 8));
});

test('Singularity skill pulls enemy star player from another lane into its lane', () => {
  const maps = [mockMap('aim'), mockMap('aim'), mockMap('aim')];
  // Lane 0: You has Singularity (92)
  // Lane 1: Enemy has their highest star player (95 rating)
  const youRoster = [
    mockCard('sing', 92, 'Controller', 'org_a', 'US', ['black_hole']),
    mockCard('y1', 70, 'Initiator', 'org_a', 'US', []),
    mockCard('y2', 70, 'Controller', 'org_a', 'US', []),
    mockCard('y3', 70, 'Sentinel', 'org_a', 'US', []),
    mockCard('y4', 70, 'Duelist', 'org_a', 'US', []),
  ];
  const themRoster = [
    mockCard('t0', 50, 'Duelist', 'org_b', 'KR', []),
    mockCard('star', 95, 'Initiator', 'org_b', 'KR', []),
    mockCard('t2', 60, 'Controller', 'org_b', 'KR', []),
    mockCard('t3', 60, 'Sentinel', 'org_b', 'KR', []),
    mockCard('t4', 60, 'Duelist', 'org_b', 'KR', []),
  ];

  const board = resolveBoard({
    maps,
    you: { roster: youRoster, slots: [0, 1, 1, 2, 2] },
    them: { roster: themRoster, slots: [0, 1, 1, 2, 2] },
  });

  // Verify Singularity displaced enemy star to Lane 0
  assert.ok(board.displacements.length > 0);
  assert.equal(board.displacements[0].reason, 'black_hole');
  assert.equal(board.displacements[0].fromLane, 1);
  assert.equal(board.displacements[0].toLane, 0);
  assert.equal(board.displacements[0].card.id, 'star');
});
