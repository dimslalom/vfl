import test from 'node:test';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import { allPlacements, isLegalPlacement, resolveBoard } from '../src/engine/board/board.js';
import {
  BETWEEN_MS, DuelError, INTRO_MS, PLACE_MS, RECONNECT_MS, REVEAL_MS, ROTATE_MS,
  advanceDuel, applyDuelCommand, createDuel, duelSnapshot, flipResult, joinDuel, laneMaps, seriesMaps, setPresence,
} from '../src/engine/duel.js';

const squadA = allCards.slice(0, 5);
const squadB = allCards.slice(5, 10);
const legal = allPlacements().find(slots => isLegalPlacement(slots, squadA) && isLegalPlacement(slots, squadB));

function started(bestOf = 3) {
  const state = createDuel({ code: 'ABCDEF', hostId: 'a', club: { name: 'Alpha' }, squad: squadA, bestOf, seed: 42, cards: allCards, now: 0 });
  joinDuel(state, { id: 'b', club: { name: 'Bravo' }, squad: squadB, cards: allCards, now: 1 });
  setPresence(state, 'a', true, 2);
  setPresence(state, 'b', true, 3);
  return state;
}

function playMap(state, now = 10) {
  const round = state.round;
  applyDuelCommand(state, 'a', { type: 'place', payload: { round, slots: legal } }, now);
  applyDuelCommand(state, 'b', { type: 'place', payload: { round, slots: legal } }, now);
  applyDuelCommand(state, 'a', { type: 'rotate', payload: { round, slots: legal } }, now);
  applyDuelCommand(state, 'b', { type: 'rotate', payload: { round, slots: legal } }, now);
  if (state.phase === 'between') {
    applyDuelCommand(state, 'a', { type: 'ready', payload: { round: state.round } }, now);
    applyDuelCommand(state, 'b', { type: 'ready', payload: { round: state.round } }, now);
  }
}

test('both clubs connected starts the first map', () => {
  const state = started();
  assert.equal(state.phase, 'place');
  assert.equal(state.board.deadlineAt, 3 + INTRO_MS + PLACE_MS);
});

test('only Bo3 and Bo5', () => {
  assert.throws(() => createDuel({ code: 'X', hostId: 'a', club: {}, squad: squadA, bestOf: 4, seed: 1, cards: allCards, now: 0 }), DuelError);
  assert.equal(started(5).mapNames.length, 5);
});

test('the server result matches resolveBoard, and seat two reads it mirrored', () => {
  const state = started();
  playMap(state);
  const maps = laneMaps(seriesMaps(42, 3)[0]);
  const direct = resolveBoard({ maps, you: { roster: state.seats[0].roster, slots: legal, tactics: [] }, them: { roster: state.seats[1].roster, slots: legal, tactics: [] } });
  const a = duelSnapshot(state, 'a', 10);
  const b = duelSnapshot(state, 'b', 10);
  assert.equal(a.last.result.winner, direct.winner);
  assert.equal(b.last.result.winner, direct.winner === 'you' ? 'them' : 'you');
  assert.equal(b.last.result.youTotal, direct.themTotal);
  assert.equal(a.last.won, !b.last.won);
  assert.deepEqual(flipResult(flipResult(direct)), direct);
});

test('a placement stays hidden until both are locked', () => {
  const state = started();
  applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: legal } }, 10);
  assert.equal(duelSnapshot(state, 'b', 10).board.theirPlan, null);
  assert.equal(duelSnapshot(state, 'b', 10).board.themPlaced, true);
  applyDuelCommand(state, 'b', { type: 'place', payload: { round: 0, slots: legal } }, 11);
  assert.deepEqual(duelSnapshot(state, 'b', 11).board.theirPlan.slots, legal);
  assert.equal(state.board.deadlineAt, 11 + REVEAL_MS + ROTATE_MS);
});

test('illegal boards, rotates and chips are refused', () => {
  const state = started();
  assert.throws(() => applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: [0, 0, 0, 0, 0] } }, 10), /legal/);
  assert.throws(() => applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: legal, tactics: [{ lane: 0, card: { key: 'nope' } }] } }, 10), /chip/);
  assert.throws(() => applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: legal, tactics: [{ lane: 0, card: { key: 'pocket' } }, { lane: 0, card: { key: 'hit' } }] } }, 10), /lane/);
  applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: legal } }, 10);
  applyDuelCommand(state, 'b', { type: 'place', payload: { round: 0, slots: legal } }, 10);
  // Every card moved at once is far past one IGL rotate.
  const shuffled = allPlacements().find(slots => slots.every((slot, i) => slot !== legal[i]) && isLegalPlacement(slots, squadA));
  assert.throws(() => applyDuelCommand(state, 'a', { type: 'rotate', payload: { round: 0, slots: shuffled } }, 10), /rotate/);
  assert.throws(() => applyDuelCommand(state, 'x', { type: 'rotate', payload: { round: 0, slots: legal } }, 10), /Not in this match/);
});

test('a missed deadline is filled: placed by the AI, rotate kept', () => {
  const state = started();
  applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: legal } }, 10);
  advanceDuel(state, state.board.deadlineAt);
  assert.equal(state.phase, 'rotate');
  assert.ok(isLegalPlacement(state.board.placed[1].slots, state.seats[1].roster));
  assert.deepEqual(state.board.placed[1].tactics, []);
  applyDuelCommand(state, 'a', { type: 'rotate', payload: { round: 0, slots: legal } }, 20);
  const placedB = state.board.placed[1].slots;
  advanceDuel(state, state.board.deadlineAt);
  assert.equal(state.rounds.length, 1);
  assert.deepEqual(state.rounds[0].rotated[1], placedB);
});

test('a club gone past the reconnect window is played by the AI', () => {
  const state = started();
  setPresence(state, 'b', false, 100);
  advanceDuel(state, 100 + RECONNECT_MS);
  assert.equal(state.seats[1].ai, true);
  assert.ok(state.board.placed[1]);
  applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: legal } }, 100 + RECONNECT_MS + 1);
  advanceDuel(state, 100 + RECONNECT_MS + 1);
  applyDuelCommand(state, 'a', { type: 'rotate', payload: { round: 0, slots: legal } }, 100 + RECONNECT_MS + 2);
  advanceDuel(state, 100 + RECONNECT_MS + 2);
  assert.equal(state.rounds.length, 1);
  setPresence(state, 'b', true, 100 + RECONNECT_MS + 3);
  assert.equal(state.seats[1].ai, false);
});

test('Bo3 ends at two maps won, Bo5 at three', () => {
  for (const bestOf of [3, 5]) {
    const state = started(bestOf);
    let now = 10;
    while (state.phase !== 'done') { playMap(state, now); now += 1; }
    assert.equal(Math.max(...state.score), bestOf === 3 ? 2 : 3);
    assert.equal(duelSnapshot(state, 'a', now).winner, state.winner === 0 ? 'you' : 'them');
    // A client several maps behind can still play each one back from its own side.
    const history = duelSnapshot(state, 'b', now).history;
    assert.equal(history.length, state.rounds.length);
    history.forEach((map, i) => assert.equal(map.won, state.rounds[i].winner === 1));
  }
});

test('a forfeit hands the series over', () => {
  const state = started();
  applyDuelCommand(state, 'a', { type: 'forfeit' }, 10);
  assert.equal(state.phase, 'done');
  assert.equal(duelSnapshot(state, 'b', 10).winner, 'you');
});

test('a sent squad is rebuilt from card data, trained numbers clamped', () => {
  const forged = squadA.map(card => ({ ...card, stats: { aim: 999 }, rating: 500, learned: ['flex', 'fake'], specialties: ['dominion'] }));
  const state = createDuel({ code: 'X', hostId: 'a', club: { name: 'A' }, squad: forged, bestOf: 3, seed: 1, cards: allCards, now: 0 });
  const card = state.seats[0].roster[0];
  assert.equal(card.stats.aim, 150);
  assert.equal(card.rating, 130);
  assert.deepEqual(card.learned, ['flex']);
  assert.deepEqual(card.specialties, squadA[0].specialties);
  assert.throws(() => createDuel({ code: 'X', hostId: 'a', club: {}, squad: [...squadA.slice(0, 4), squadA[0]], bestOf: 3, seed: 1, cards: allCards, now: 0 }), /repeated/);
});

test('between maps: both ready deals at once, otherwise the timer does', () => {
  const state = started();
  applyDuelCommand(state, 'a', { type: 'place', payload: { round: 0, slots: legal } }, 10);
  applyDuelCommand(state, 'b', { type: 'place', payload: { round: 0, slots: legal } }, 10);
  applyDuelCommand(state, 'a', { type: 'rotate', payload: { round: 0, slots: legal } }, 10);
  applyDuelCommand(state, 'b', { type: 'rotate', payload: { round: 0, slots: legal } }, 10);
  assert.equal(state.phase, 'between');
  assert.equal(state.round, 1);
  applyDuelCommand(state, 'a', { type: 'ready', payload: { round: 1 } }, 20);
  assert.equal(duelSnapshot(state, 'b', 20).between.themReady, true);
  assert.equal(state.phase, 'between');
  advanceDuel(state, 10 + BETWEEN_MS);
  assert.equal(state.phase, 'place');
  // The place clock starts at the deal, not at the last map's verdict.
  assert.equal(state.board.deadlineAt, 10 + BETWEEN_MS + PLACE_MS);
});
