import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERIES_PREP_DEADLINE_MS,
  addCompetitor,
  advanceDeadlines,
  applyCommand,
  createLobbyState,
  migrateLobbyState,
  nextAlarmAt,
  publicSnapshot,
} from '../src/engine/multiplayer.js';
import { MAP_NAMES } from '../src/engine/endless/seriesCards.js';

const cards = makeCards();
let commandSeq = 0;

function run(state, type, actor, payload = {}, now = 1000) {
  return applyCommand(state, actor, {
    type, commandId: `c${commandSeq += 1}`, expectedVersion: state.version, payload,
  }, cards, now);
}

function toSeries(settings = {}) {
  const state = createLobbyState({
    code: 'ABC234', hostId: 'p1', squadName: 'Squad 1', seed: 77,
    settings: { gameLength: 'year', unboxing: 'normal', ...settings }, now: 0,
  });
  addCompetitor(state, { id: 'p2', squadName: 'Squad 2', now: 1 });
  run(state, 'start_game', 'p1');
  while (state.phase === 'draft') {
    run(state, 'choose_card', state.draft.activeCompetitorId, { cardId: state.draft.offers[0] });
  }
  for (const player of state.competitors) {
    run(state, 'choose_igl', player.id, { cardId: player.rosterIds[0] });
  }
  return state;
}

function picksFor(state, id) {
  const prep = state.seriesPrep;
  const side = prep.sides[id];
  const names = prep.dealt.map(map => map.name);
  return {
    mapPicks: names.slice(0, prep.perSide),
    tactics: Object.fromEntries(names.map((name, index) => [name, side.hand[index].uid])),
  };
}

test('new lobbies play series cards, and old stored lobbies stay as they were', () => {
  const fresh = createLobbyState({
    code: 'ABC234', hostId: 'p1', squadName: 'A', seed: 1,
    settings: { gameLength: 'year', unboxing: 'normal' }, now: 0,
  });
  assert.equal(fresh.settings.seriesCards, true);
  const off = createLobbyState({
    code: 'ABC234', hostId: 'p1', squadName: 'A', seed: 1,
    settings: { gameLength: 'year', unboxing: 'normal', seriesCards: false }, now: 0,
  });
  assert.equal(off.settings.seriesCards, false);

  const stored = toSeries({ seriesCards: false });
  delete stored.settings.seriesCards;
  delete stored.seriesPrep;
  stored.competitors.forEach(player => delete player.mapMastery);
  const migrated = migrateLobbyState(stored);
  assert.equal(migrated.settings.seriesCards, false);
  assert.equal(migrated.seriesPrep, null);
  assert.equal(migrated.phase, 'match_ready');
  assert.deepEqual(migrated.competitors[0].mapMastery, {});
});

test('a human series opens prep with a private hand and a deadline alarm', () => {
  const state = toSeries();
  assert.equal(state.phase, 'series_prep');
  const prep = state.seriesPrep;
  assert.equal(prep.dealt.length, prep.bestOf);
  assert.ok(prep.dealt.every(map => MAP_NAMES.includes(map.name) && map.label));
  assert.equal(Object.keys(prep.sides).length >= 1, true);
  const [id] = Object.keys(prep.sides);
  assert.equal(prep.sides[id].hand.length, prep.bestOf + 1);
  assert.equal(nextAlarmAt(state), prep.deadlineAt);
});

test('snapshots hide hands and picks from everyone but their owner', () => {
  const state = toSeries();
  const [id] = Object.keys(state.seriesPrep.sides);
  state.seriesPrep.sides[id].mapPicks = ['Secret'];
  const other = publicSnapshot(state, 1, 'someone-else');
  const own = publicSnapshot(state, 1, id);
  assert.deepEqual(Object.keys(other.seriesPrep.sides[id]), ['ready']);
  assert.ok(own.seriesPrep.sides[id].hand.length > 0);
  assert.deepEqual(own.seriesPrep.sides[id].mapPicks, ['Secret']);
  assert.equal(other.seed, undefined);
  assert.equal(other.rngCounter, undefined);
  assert.ok(!JSON.stringify(other).includes(state.seriesPrep.sides[id].hand[0].uid));
});

test('picks are validated: dealt maps only, one different tactic per map', () => {
  const state = toSeries();
  const [id] = Object.keys(state.seriesPrep.sides);
  const good = picksFor(state, id);
  const [firstMap] = state.seriesPrep.dealt.map(map => map.name);
  const uid = good.tactics[firstMap];
  assert.throws(() => run(state, 'series_submit', id, { ...good, mapPicks: ['Nowhere'] }), { code: 'invalid_picks' });
  assert.throws(() => run(state, 'series_submit', id, {
    ...good, tactics: Object.fromEntries(Object.keys(good.tactics).map(name => [name, uid])),
  }), { code: 'invalid_picks' });
  assert.throws(() => run(state, 'series_submit', 'nobody', good), { code: 'unauthorized' });
});

test('a series resolves once every side locks, and reveals both tactics', () => {
  const state = toSeries();
  while (state.phase === 'series_prep') {
    const pending = Object.keys(state.seriesPrep.sides).find(id => !state.seriesPrep.sides[id].ready);
    run(state, 'series_submit', pending, picksFor(state, pending));
  }
  assert.equal(state.phase, 'match_transition');
  assert.equal(state.seriesPrep, null);
  const round = state.tournament.rounds[state.tournament.roundIdx];
  const played = round.matches.find(match => match.id === state.pendingTransition.matchId);
  assert.ok(played.winner);
  assert.ok(played.maps.every(map => map.tacticA?.key && map.tacticB?.key));
  const mastered = state.competitors.filter(player => Object.keys(player.mapMastery).length);
  assert.ok(mastered.length >= 1);
});

test('a submit is not lost to a version bump from the other squad', () => {
  const state = toSeries();
  const [id] = Object.keys(state.seriesPrep.sides);
  const payload = picksFor(state, id);
  applyCommand(state, id, { type: 'series_submit', commandId: 'late', expectedVersion: state.version - 3, payload }, cards, 1000);
  assert.ok(state.phase !== 'series_prep' || state.seriesPrep.sides[id].ready);
});

test('a timed-out or disconnected squad is auto-picked at the deadline', () => {
  const state = toSeries();
  const deadline = state.seriesPrep.deadlineAt;
  assert.equal(deadline, 1000 + SERIES_PREP_DEADLINE_MS);
  state.competitors.forEach(player => { player.connected = false; });
  assert.equal(advanceDeadlines(state, cards, deadline - 1).changed, false);
  assert.equal(advanceDeadlines(state, cards, deadline).changed, true);
  assert.equal(state.phase, 'match_transition');
  assert.equal(state.seriesPrep, null);
});

test('a lobby replays identically from its seed through prep', () => {
  const play = () => {
    commandSeq = 0;
    const state = toSeries();
    advanceDeadlines(state, cards, state.seriesPrep.deadlineAt);
    return { counter: state.rngCounter, rounds: state.tournament.rounds };
  };
  assert.deepEqual(play(), play());
});

test('a whole year finishes with series cards on', () => {
  const state = toSeries();
  let guard = 0;
  while (state.phase !== 'season_over' && guard < 500) {
    guard += 1;
    const at = state.seriesPrep?.deadlineAt ?? state.pendingTransition?.deadlineAt
      ?? state.consolation?.deadlineAt ?? state.draft?.deadlineAt;
    advanceDeadlines(state, cards, at ?? 0);
  }
  assert.equal(state.phase, 'season_over');
  run(state, 'return_to_lobby', 'p1');
  assert.equal(state.seriesPrep, null);
  assert.deepEqual(state.competitors[0].mapMastery, {});
  assert.equal(state.settings.seriesCards, true);
});

function makeCards() {
  const output = [];
  const nations = ['US', 'CA', 'BR', 'ID'];
  for (let i = 0; i < 100; i++) output.push(card(`free-${i}`, 70 + i % 25, nations[i % nations.length], null));
  for (let org = 0; org < 40; org++) {
    for (let member = 0; member < 5; member++) output.push(card(`org-${org}-${member}`, 99 - org * .5 - member * .01, nations[org % nations.length], `ORG${org}`));
  }
  return output;
}

function card(id, rating, nationality, org) {
  return {
    id, player: id, rating, nationality, org, org_name: org, org_logo: null,
    role: ['Duelist', 'Initiator', 'Controller', 'Sentinel'][id.length % 4],
    igl: id.endsWith('0'), stints: [], stats: { aim: rating, positioning: rating, ability: rating, mentality: rating, synergy: rating },
  };
}
