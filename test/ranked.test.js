import test from 'node:test';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import { allPlacements, isLegalPlacement } from '../src/engine/board/board.js';
import { RANKS, START_RATING, rankFor, ratingDelta, settleRanked, utcDay } from '../src/engine/club/rating.js';
import { CPU_AFTER_MS, bands, dueForCpu, findPairs, idleTickets } from '../src/engine/matchmaking.js';
import { advanceDuel, applyDuelCommand, createRankedDuel, duelSnapshot, rankedOutcome, setPresence } from '../src/engine/duel.js';

test('ranks run Iron to Radiant, 100 apart, starting in Silver', () => {
  assert.equal(RANKS[0], 'Iron');
  assert.equal(RANKS.at(-1), 'Radiant');
  assert.equal(rankFor(START_RATING).name, 'Silver');
  assert.equal(rankFor(850).name, 'Iron');
  assert.equal(rankFor(0).name, 'Iron');
  assert.equal(rankFor(1650).name, 'Radiant');
  assert.equal(rankFor(1650).progress, 1);
  assert.equal(rankFor(1050).progress, 0.5);
  assert.equal(rankFor(1050).toNext, 50);
});

test('elo is symmetric and calms down after 20 games', () => {
  assert.equal(ratingDelta(1000, 1000, true), 16);
  assert.equal(ratingDelta(1000, 1000, false), -16);
  assert.equal(ratingDelta(1000, 1000, true, 20), 8);
  assert.equal(ratingDelta(1200, 1000, true) + ratingDelta(1000, 1200, false), 0);
  assert.ok(ratingDelta(1000, 1200, true) > ratingDelta(1200, 1000, true));
});

test('a CPU match moves no rating but counts for form and First Win', () => {
  const day = utcDay(Date.UTC(2026, 10, 7));
  const first = settleRanked(null, { won: true, opponent: null, day });
  assert.equal(first.delta, 0);
  assert.equal(first.row.rating, START_RATING);
  assert.equal(first.row.form, 'W');
  assert.equal(first.firstWin, true);
  const second = settleRanked(first.row, { won: true, opponent: 1000, day });
  assert.equal(second.firstWin, false);
  assert.ok(second.delta > 0);
  let row = second.row;
  for (const won of [false, true, false, true, true]) row = settleRanked(row, { won, opponent: 1000, day }).row;
  // W W, then L W L W W: only the last five stay.
  assert.equal(row.form, 'LWLWW');
  assert.equal(settleRanked(row, { won: true, opponent: null, day: '2026-11-08' }).firstWin, true);
});

const ticket = (id, rating, power, enqueuedAt, userId = id) => ({ id, userId, rating, power, enqueuedAt, polledAt: enqueuedAt });

test('the queue pairs close clubs and widens while you wait', () => {
  assert.deepEqual(bands(0), { rating: 100, power: 0.15 });
  assert.equal(bands(12_000).rating, 200);
  const far = [ticket('a', 1000, 75, 0), ticket('b', 1180, 76, 0)];
  assert.equal(findPairs(far, 1000).length, 0);
  assert.equal(findPairs(far, 10_000).length, 1);
  const near = findPairs([ticket('a', 1000, 75, 0), ticket('b', 1300, 75, 0), ticket('c', 1040, 76, 0)], 1);
  assert.deepEqual(near.map(pair => pair.map(t => t.id)), [['a', 'c']]);
});

test('the queue never pairs a club with itself, and hands the CPU over at 25s', () => {
  const same = [ticket('a', 1000, 75, 0, 'u1'), ticket('b', 1000, 75, 0, 'u1')];
  assert.equal(findPairs(same, 1).length, 0);
  assert.equal(dueForCpu(same, CPU_AFTER_MS - 1).length, 0);
  assert.equal(dueForCpu(same, CPU_AFTER_MS).length, 2);
  assert.equal(idleTickets([{ ...same[0], polledAt: 0 }], 10_000).length, 1);
});

test('a ranked duel against the CPU plays itself on the CPU side', () => {
  const state = createRankedDuel({
    code: 'CPUCPU',
    seed: 7,
    cards: allCards,
    now: 0,
    seats: [
      { id: 'me', userId: 'u1', club: { name: 'Mine' }, squad: allCards.slice(0, 5) },
      { id: 'cpu', cpu: true, club: { name: 'Their club' }, squad: allCards.slice(5, 10) },
    ],
  });
  assert.equal(state.bestOf, 3);
  setPresence(state, 'me', true, 1);
  assert.equal(state.phase, 'place');
  advanceDuel(state, 2);
  assert.ok(state.board.placed[1], 'the CPU places at once');
  assert.equal(duelSnapshot(state, 'me', 2).them.cpu, true);
  const legal = allPlacements().find(slots => isLegalPlacement(slots, state.seats[0].roster));
  let now = 3;
  while (state.phase !== 'done') {
    if (state.phase === 'place') applyDuelCommand(state, 'me', { type: 'place', payload: { round: state.round, slots: legal } }, now);
    else if (state.phase === 'rotate') applyDuelCommand(state, 'me', { type: 'rotate', payload: { round: state.round, slots: legal } }, now);
    else if (state.phase === 'between') applyDuelCommand(state, 'me', { type: 'ready', payload: { round: state.round } }, now);
    advanceDuel(state, now);
    now += 1;
  }
  const outcome = rankedOutcome(state);
  assert.deepEqual(outcome.map(s => s.cpu), [false, true]);
  assert.equal(outcome.filter(s => s.won).length, 1);
  state.rated = [{}, null];
  assert.equal(rankedOutcome(state), null, 'rated once');
});
