import { ROSTER_SIZE } from '../../shared/src/engine/perfectRun.js';

// The manage screen's worklist, in the order a player should answer it. Pure,
// so the desk, its tab badges and the tests all read one list. A move's `tab`
// is where its work lives; null means it is answered in place at the top.
export function nextMoves({
  endless = true, poachOffer = null, prospect = null, rosterCount = ROSTER_SIZE,
  packs = 0, targets = [], costOf = () => Infinity, mapChanges = [],
}) {
  if (!endless) return [];
  const moves = [];
  if (poachOffer) moves.push({ key: 'poach', tab: null, blocking: true });
  if (prospect) moves.push({ key: 'prospect', tab: null });
  if (rosterCount < ROSTER_SIZE) {
    moves.push({ key: 'short', tab: 'market', missing: ROSTER_SIZE - rosterCount });
  }
  if (packs > 0) moves.push({ key: 'pack', tab: 'market', packs });
  const affordable = targets.find(card => costOf(card) <= packs);
  if (affordable) moves.push({ key: 'signing', tab: 'market', card: affordable, cost: costOf(affordable) });
  if (mapChanges.length) moves.push({ key: 'maps', tab: 'world', count: mapChanges.length });
  return moves;
}

export function tabCounts(moves) {
  const counts = { squad: 0, market: 0, world: 0 };
  for (const move of moves) {
    if (move.tab) counts[move.tab] += 1;
  }
  return counts;
}
