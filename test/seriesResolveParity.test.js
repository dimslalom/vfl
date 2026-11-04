import test from 'node:test';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import {
  buildEndlessBracket,
} from '../src/engine/endless/field.js';
import {
  ENDLESS_POWER_DIVISOR, chooseNpcMap, mapActivation, mapCardsForYear, mapPicksPerSide, mergeMapPicks,
  npcTactic, resolveEndlessNpcMatches, rivalMapMastery, seriesEdge, tacticActivation, tacticClash,
} from '../src/engine/endless/seriesCards.js';
import {
  currentRound, mulberry32, pickMaps, rngState, samplePack, seedOf, simMap, teamPower, teamSimulationPower,
} from '../shared/src/engine/perfectRun.js';

// A copy of the function as it lived in PerfectRun.jsx before it moved into
// seriesCards.js, updated only for the edge formula. Solo Dailies depend on its
// rng call order, so the moved version has to stay in step with this one.
function legacyResolve(tour, rng, runSeed, year, yearMapByName) {
  const stage = currentRound(tour);
  for (const match of stage.matches) {
    if (match.winner) continue;
    const teamA = tour.teams[match.a];
    const teamB = tour.teams[match.b];
    const dealt = pickMaps(rng, match.bestOf).map(name => yearMapByName.get(name));
    const masteryA = Object.fromEntries(dealt.map(map => [map.name, rivalMapMastery(runSeed, teamA.id, map.name, year)]));
    const masteryB = Object.fromEntries(dealt.map(map => [map.name, rivalMapMastery(runSeed, teamB.id, map.name, year)]));
    const aPicksFirst = seedOf(tour, teamA.id) < seedOf(tour, teamB.id);
    const firstTeam = aPicksFirst ? teamA : teamB;
    const secondTeam = aPicksFirst ? teamB : teamA;
    const firstMastery = aPicksFirst ? masteryA : masteryB;
    const secondMastery = aPicksFirst ? masteryB : masteryA;
    const picks = [];
    for (let turn = 0; turn < mapPicksPerSide(match.bestOf) * 2; turn += 1) {
      const firstTurn = turn % 2 === 0;
      const pick = chooseNpcMap(
        dealt.filter(map => !picks.includes(map)),
        (firstTurn ? firstTeam : secondTeam).roster,
        firstTurn ? firstMastery : secondMastery,
      );
      if (!pick) break;
      picks.push(pick);
    }
    const maps = [...picks, ...dealt.filter(map => !picks.includes(map))];
    const needed = Math.ceil(match.bestOf / 2);
    const played = [];
    let scoreA = 0;
    let scoreB = 0;

    for (const map of maps) {
      if (scoreA >= needed || scoreB >= needed) break;
      const mapA = mapActivation(teamA.roster, map, masteryA[map.name]);
      const mapB = mapActivation(teamB.roster, map, masteryB[map.name]);
      const cardA = npcTactic(rng, teamA.roster, map);
      const cardB = npcTactic(rng, teamB.roster, map);
      const tacticA = tacticActivation(cardA, teamA.roster, mapA);
      const tacticB = tacticActivation(cardB, teamB.roster, mapB);
      const clash = tacticClash(tacticA, tacticB);
      const result = simMap(
        rng,
        teamSimulationPower(teamA) + seriesEdge(mapA, tacticA, clash.player),
        teamSimulationPower(teamB) + seriesEdge(mapB, tacticB, clash.opponent),
        teamA.roster,
        teamB.roster,
        0,
        teamA.iglId ?? null,
        teamB.iglId ?? null,
        { powerDivisor: ENDLESS_POWER_DIVISOR },
      );
      played.push({ map: map.name, a: result.a, b: result.b });
      if (result.winA) scoreA += 1;
      else scoreB += 1;
    }

    match.maps = played;
    match.scoreA = scoreA;
    match.scoreB = scoreB;
    match.winner = scoreA > scoreB ? teamA.id : teamB.id;
  }
}

function freshBracket(seed, tier) {
  const rng = mulberry32(seed);
  const roster = samplePack(rng, allCards, new Set());
  const iglId = roster[0].id;
  const team = {
    id: 'player', tag: 'YOU', name: 'Test', logo: null, roster, iglId,
    power: teamPower(roster, iglId).power, isPlayer: true,
  };
  const ids = new Set(roster.map(card => card.id));
  return { rng, tour: buildEndlessBracket(rng, allCards, ids, team, tier, { kind: 'masters', dev: {} }) };
}

test('moved NPC series resolution draws the same rng and results as the old one', () => {
  for (const seed of [1, 7, 42, 20261102, 0xdeadbeef]) {
    for (const tier of [0, 1, 2]) {
      for (const year of [1, 4]) {
        const byName = new Map(mapCardsForYear(seed, year).map(card => [card.name, card]));
        const before = freshBracket(seed, tier);
        const after = freshBracket(seed, tier);
        legacyResolve(before.tour, before.rng, seed, year, byName);
        resolveEndlessNpcMatches(after.tour, after.rng, seed, year, byName);
        assert.deepEqual(currentRound(after.tour).matches, currentRound(before.tour).matches);
        assert.equal(rngState(after.rng), rngState(before.rng));
      }
    }
  }
});

test('secret map picks merge in seed order and skip a map already taken', () => {
  const dealt = mapCardsForYear(1, 1).slice(0, 5);
  const [a, b, c, d, e] = dealt.map(card => card.name);
  const firstChoice = (remaining) => remaining[0];
  const bo3 = mergeMapPicks(dealt.slice(0, 3), [a], [a, b], 1, firstChoice);
  assert.deepEqual(bo3.map(card => card.name), [a, b, c]);
  const bo5 = mergeMapPicks(dealt, [a, b], [b, c], 2, firstChoice);
  assert.deepEqual(bo5.map(card => card.name), [a, b, c, d, e]);
});

test('a side with no picks falls back without losing a map', () => {
  const dealt = mapCardsForYear(1, 1).slice(0, 3);
  const order = mergeMapPicks(dealt, null, null, 1, remaining => remaining.at(-1));
  assert.equal(new Set(order.map(card => card.name)).size, 3);
});
