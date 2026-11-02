import allCards from '../../shared/src/data/cards.json';
import { mulberry32, pickN } from '../../shared/src/engine/perfectRun.js';
import { hasRealPortrait } from '../../shared/src/lib/portrait.js';
import { MAP_LANES } from '../engine/board/mapLanes.js';
import { MAP_NAMES, mapCardsForYear, TACTICS } from '../engine/endless/seriesCards.js';

const usable = allCards.filter(card => card.org && hasRealPortrait(card));
const byOrg = new Map();
for (const card of usable) byOrg.set(card.org, [...(byOrg.get(card.org) ?? []), card]);
const teams = [...byOrg.values()]
  .filter(roster => roster.length >= 5)
  .map(roster => [...roster].sort((a, b) => b.rating - a.rating).slice(0, 5));
const average = roster => roster.reduce((sum, card) => sum + card.rating, 0) / roster.length;
const TACTIC_KEYS = Object.keys(TACTICS);

// A prototype squad: one real pair, so the teammate combo can show up, then
// the best role gaps from the rest of the pool. Leftmost is the IGL.
function makeSquad(rng) {
  const pairOrg = teams[Math.floor(rng() * teams.length)];
  const squad = pickN(rng, pairOrg, 2);
  const pool = pickN(rng, usable.filter(card => card.org !== pairOrg[0].org && card.rating >= 72), 60);
  for (const role of ['Duelist', 'Initiator', 'Controller', 'Sentinel']) {
    if (squad.length < 5 && !squad.some(card => card.role === role)) {
      const found = pool.find(card => card.role === role);
      if (found) squad.push(found);
    }
  }
  for (const card of pool) {
    if (squad.length >= 5) break;
    if (!squad.includes(card)) squad.push(card);
  }
  return squad;
}

// One enemy, one squad each, and one map per round. Tactics are dealt once for
// the whole series, so spending your best one early is a real decision.
export function dealSeries(seed, bestOf) {
  const rng = mulberry32(seed);
  const you = makeSquad(rng);
  const ids = new Set(you.map(card => card.id));
  const near = teams
    .filter(roster => !roster.some(card => ids.has(card.id)))
    .sort((a, b) => Math.abs(average(a) - average(you)) - Math.abs(average(b) - average(you)))
    .slice(0, 8);
  const them = near[Math.floor(rng() * near.length)];
  const instance = index => ({ uid: `t${index}`, key: TACTIC_KEYS[Math.floor(rng() * TACTIC_KEYS.length)], source: 'owned' });
  const artFor = new Map(mapCardsForYear(seed, 1).map(card => [card.name, card.image]));
  return {
    seed, bestOf, you, them,
    opponentName: them[0].org_name ?? them[0].org,
    maps: pickN(rng, MAP_NAMES, bestOf).map(name => ({ name, image: artFor.get(name) })),
    tactics: Array.from({ length: bestOf }, (_, index) => instance(index)),
    opponentTactics: Array.from({ length: bestOf }, (_, index) => instance(bestOf + index)),
  };
}

export function roundBoard(series, round, tactics) {
  const map = series.maps[round];
  return {
    seed: series.seed + round + 1,
    mapName: map.name,
    maps: MAP_LANES[map.name].map(lane => ({ ...lane, image: map.image })),
    you: series.you,
    them: series.them,
    tactics,
    opponentTactic: series.opponentTactics[round],
  };
}
