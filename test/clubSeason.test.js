import test from 'node:test';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import { useTape as spendTape } from '../src/engine/club/rewards.js';
import { hasSkill } from '../src/engine/board/board.js';
import { CLUB_SAVE_KEY, loadClub, saveClub } from '../src/lib/clubSave.js';
import {
  CONTRACT_MAX, LEAGUE_SIZE, SKILL_SESSIONS, STARTERS, WEEKS, clubCard, clubRoster, closeWindow, contractYears,
  draftPack, finishSeries, isValidClub, moveSquad, newClub, nextMatch, squadCards, standings, trainingOffer,
  windowOffers, windowTotals,
} from '../src/engine/club/season.js';

function draft(seed = 7) {
  const picks = [];
  for (let index = 0; index < STARTERS; index += 1) picks.push(draftPack(seed, index, picks, allCards)[0].id);
  return picks;
}

const fresh = (seed = 7) => newClub({ seed, name: 'Winners', picks: draft(seed), cards: allCards });

function series(won, bestOf = 3) {
  const need = Math.ceil(bestOf / 2);
  const results = Array.from({ length: need }, () => ({ map: 'Icebox', a: won ? 2 : 1, b: won ? 1 : 2, winA: won, mvp: null }));
  return { won, results, hand: [] };
}

// Mid-table: wins the first three weeks, so no promotion and no last place.
function playYearHold(state) {
  let next = state;
  let week = 0;
  while (nextMatch(next)) {
    const inLeague = next.phase === 'league';
    next = finishSeries(next, series(inLeague && week < 3, nextMatch(next).bestOf), allCards);
    week += 1;
  }
  return next;
}

function playYear(state, won) {
  let next = state;
  while (nextMatch(next)) next = finishSeries(next, series(won, nextMatch(next).bestOf), allCards);
  return next;
}

test('a league is a full round robin with your match every week', () => {
  const state = fresh();
  assert.equal(state.clubs.length, LEAGUE_SIZE - 1);
  assert.equal(state.fixtures.length, WEEKS);
  const met = state.fixtures.map(week => {
    assert.equal(week.length, LEAGUE_SIZE / 2);
    return week.flat();
  });
  assert.ok(met.every(week => new Set(week).size === LEAGUE_SIZE));
  const pairs = state.fixtures.flat().map(pair => [...pair].sort().join('-'));
  assert.equal(new Set(pairs).size, (LEAGUE_SIZE * (LEAGUE_SIZE - 1)) / 2);
  const opponents = state.fixtures.map(week => week.find(pair => pair.includes('you')).find(id => id !== 'you'));
  assert.equal(new Set(opponents).size, WEEKS);
});

test('the table counts every club and a win moves you up', () => {
  let state = fresh();
  state = finishSeries(state, series(true), allCards);
  const table = standings(state, allCards);
  assert.equal(table.length, LEAGUE_SIZE);
  assert.equal(table.reduce((sum, row) => sum + row.w, 0), LEAGUE_SIZE / 2);
  assert.equal(table.find(row => row.you).w, 1);
  assert.equal(state.week, 1);
  assert.equal(state.packs, 4);
});

test('winning everything takes the title, Bo5 final and promotion', () => {
  let state = fresh();
  for (let week = 0; week < WEEKS; week += 1) state = finishSeries(state, series(true), allCards);
  assert.equal(state.phase, 'playoffs');
  assert.equal(nextMatch(state).stage, 'Semifinal');
  state = finishSeries(state, series(true), allCards);
  assert.equal(nextMatch(state).stage, 'Final');
  assert.equal(nextMatch(state).bestOf, 5);
  state = finishSeries(state, series(true, 5), allCards);
  assert.equal(state.phase, 'review');
  assert.equal(state.titles, 1);
  assert.equal(state.review.movement, 'promote');
});

test('last place in the bottom tier warns once, then ends the run', () => {
  let state = playYear(fresh(), false);
  assert.equal(state.review.movement, 'warned');
  const offers = windowOffers(state, allCards);
  state = closeWindow(state, {}, allCards);
  assert.equal(offers.free.at(-1).cost, 0);
  state = playYear(state, false);
  assert.equal(state.phase, 'over');
  assert.equal(state.review.movement, 'sacked');
});

test('a club short of packs can always field five', () => {
  let state = playYear(fresh(), true);
  state = playYear(closeWindow(state, {}, allCards), true);
  state = { ...state, packs: 0 };
  const offers = windowOffers(state, allCards);
  const trial = offers.free.find(item => item.trial);
  assert.equal(trial.cost, 0);
  const own = Object.fromEntries(offers.mine.map(item => [item.card.id, 'go']));
  const totals = windowTotals(state, offers, { own });
  assert.equal(totals.canClose, true);
  assert.equal(totals.trialists, STARTERS);
  const next = closeWindow(state, { own }, allCards);
  assert.equal(next.squad.length, STARTERS);
  assert.equal(next.year, state.year + 1);
});

test('missing the playoffs still finishes the year', () => {
  let state = fresh();
  for (let week = 0; week < WEEKS; week += 1) state = finishSeries(state, series(week === 0), allCards);
  assert.equal(nextMatch(state), null);
  assert.notEqual(state.phase, 'league');
  assert.ok(state.review);
});

test('contracts count down and a last-year player must be decided', () => {
  let state = playYear(fresh(), true);
  assert.ok(state.squad.every(id => state.contracts[id] === CONTRACT_MAX - 1));
  state = closeWindow(state, {}, allCards);
  assert.equal(state.year, 2);
  state = playYear(state, true);
  assert.ok(state.squad.every(id => state.contracts[id] === 1));
  const offers = windowOffers(state, allCards);
  assert.equal(offers.mine.length, STARTERS);
  assert.equal(windowTotals(state, offers, {}).canClose, false);
  assert.equal(closeWindow(state, {}, allCards).year, state.year);
});

test('letting a player go sends them to the rival that wanted them, and keeping them costs packs', () => {
  let state = playYear(fresh(), true);
  state = playYear(closeWindow(state, {}, allCards), true);
  state = { ...state, packs: 40, gold: 0, icons: 0 };
  const offers = windowOffers(state, allCards);
  const [gone, ...kept] = offers.mine;
  const own = { [gone.card.id]: 'go' };
  for (const item of kept) own[item.card.id] = 'keep';
  const buy = [offers.free[0].card.id];
  const expected = windowTotals(state, offers, { own, buy }).packs;
  const next = closeWindow(state, { own, buy }, allCards);
  assert.equal(next.packs, expected);
  assert.ok(!next.squad.includes(gone.card.id));
  assert.equal(next.moved[gone.card.id].org, gone.suitor.id);
  assert.ok(next.squad.includes(buy[0]));
  assert.equal(next.contracts[buy[0]], CONTRACT_MAX);
  assert.equal(next.contracts[kept[0].card.id], CONTRACT_MAX);
});

test('a rival clock ticks down one year at a time and stays in range', () => {
  const state = fresh();
  const id = state.clubs[0].roster[0];
  const seen = [0, 1, 2, 3].map(offset => contractYears({ ...state, year: state.year + offset }, id));
  assert.ok(seen.every(years => years >= 1 && years <= CONTRACT_MAX));
  assert.equal(seen[3], seen[0]);
  assert.equal(new Set(seen).size, CONTRACT_MAX);
});

test('the signing limit locks a rival you cannot reach', () => {
  const state = playYear(fresh(), true);
  const offers = windowOffers(state, allCards);
  assert.ok(offers.rivals.every(item => item.locked === (item.card.rating > offers.limit)));
  const squad = squadCards(state, allCards);
  const average = squad.reduce((sum, card) => sum + card.rating, 0) / squad.length;
  assert.ok(offers.free.every(item => item.card.rating < average));
});

test('a stat tape changes the card and is consumed once', () => {
  const state = { ...fresh(), trainingTapes: { aim: 1 } };
  const raw = allCards.find(card => card.id === state.squad[0]);
  const card = clubCard(state, raw);
  const next = spendTape(state, card, 'aim');
  assert.equal(next.trainingTapes.aim, 0);
  assert.equal(clubCard(next, raw).stats.aim, card.stats.aim + 2);
  assert.equal(spendTape(next, card, 'aim'), next);
});

test('three matching skill tapes unlock the skill on the board', () => {
  let state = fresh();
  const raw = allCards.find(card => card.id === state.squad[0]);
  const { skill } = trainingOffer(state, clubCard(state, raw));
  assert.ok(skill);
  state = { ...state, trainingTapes: { [skill]: SKILL_SESSIONS } };
  for (let i = 0; i < SKILL_SESSIONS; i += 1) {
    const card = clubCard(state, raw);
    assert.equal(hasSkill(card, skill), false);
    state = spendTape(state, card, skill);
  }
  assert.equal(hasSkill(clubCard(state, raw), skill), true);
  assert.equal(trainingOffer(state, clubCard(state, raw)).skill, null);
  assert.equal(state.trainingTapes[skill], 0);
});

test('series give starters growth, and a full bar raises the rating', () => {
  let state = fresh();
  const id = state.squad[0];
  state = finishSeries({ ...state, xp: { [id]: 149 } }, series(true), allCards);
  assert.equal(state.dev[id].d, 1);
  assert.ok(state.last.growth.some(row => row.id === id));
});

test('growth reaches the stats the board scores', () => {
  let state = fresh();
  const raw = allCards.find(card => card.id === state.squad[0]);
  const before = clubCard(state, raw).stats.aim;
  state = { ...state, dev: { ...state.dev, [raw.id]: { d: 3 } } };
  assert.equal(clubCard(state, raw).stats.aim, before + 3);
});

test('rivals stay from one year to the next', () => {
  const first = fresh();
  const next = closeWindow(playYearHold(first), {}, allCards);
  const before = first.clubs.map(club => club.id);
  const kept = next.clubs.filter(club => before.includes(club.id));
  assert.ok(kept.length >= 3);
});

test('reordering sets who starts', () => {
  const state = fresh();
  const next = moveSquad(state, 0, 2);
  assert.equal(next.squad[0], state.squad[2]);
  assert.equal(squadCards(next, allCards).length, STARTERS);
});

test('rival rosters are five real players', () => {
  const state = fresh();
  for (const club of state.clubs) {
    const roster = clubRoster(state, club, allCards);
    assert.equal(roster.length, STARTERS);
    assert.ok(roster.every(card => card.stats));
  }
});

test('a club survives a JSON save', () => {
  const state = finishSeries(fresh(), series(true), allCards);
  const loaded = JSON.parse(JSON.stringify(state));
  assert.deepEqual(standings(loaded, allCards), standings(state, allCards));
  assert.deepEqual(nextMatch(loaded), nextMatch(state));
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('a repeated result or window close changes nothing', () => {
  const year = playYear(fresh(), true);
  assert.equal(finishSeries(year, series(true), allCards), year);
  const next = closeWindow(year, {}, allCards);
  assert.equal(closeWindow(next, {}, allCards), next);
});

test('a save names a damaged club instead of crashing', () => {
  assert.deepEqual(loadClub(memoryStorage()), { state: null, damaged: false });
  assert.equal(loadClub(memoryStorage({ [CLUB_SAVE_KEY]: '{not json' })).damaged, true);
  assert.equal(loadClub(memoryStorage({ [CLUB_SAVE_KEY]: '{"v":99}' })).damaged, true);
  const storage = memoryStorage();
  const state = fresh();
  assert.equal(saveClub(state, storage), true);
  assert.deepEqual(loadClub(storage).state, JSON.parse(JSON.stringify(state)));
});

test('a full device reports a failed save', () => {
  assert.equal(saveClub(fresh(), { setItem: () => { throw new Error('full'); } }), false);
});

test('a club naming a missing player is not valid', () => {
  const state = fresh();
  assert.equal(isValidClub(state, allCards), true);
  assert.equal(isValidClub({ ...state, squad: ['gone', ...state.squad.slice(1)] }, allCards), false);
  assert.equal(isValidClub({ ...state, phase: 'nonsense' }, allCards), false);
  assert.equal(isValidClub(null, allCards), false);
});

test('finished years are kept for the end screen', () => {
  const state = playYear(fresh(), true);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].placement, 1);
});

test('a full 7/7 squad with no expiring contracts can swap a squad player for a free agent', () => {
  let state = playYear(fresh(), true);
  const benchPickIds = allCards.filter(card => !state.squad.includes(card.id)).slice(0, 2).map(card => card.id);
  const fullSquad = [...state.squad, ...benchPickIds];
  const contracts = Object.fromEntries(fullSquad.map(id => [id, 2]));
  state = { ...state, squad: fullSquad, contracts, packs: 10 };
  const offers = windowOffers(state, allCards);
  assert.equal(offers.mine.length, 0);
  const target = offers.free[0];
  const droppedId = fullSquad[1];
  const totals = windowTotals(state, offers, { buy: [target.card.id], drop: [droppedId] });
  assert.equal(totals.squad, 7);
  assert.equal(totals.canClose, true);
  const next = closeWindow(state, { buy: [target.card.id], drop: [droppedId] }, allCards);
  assert.equal(next.squad.length, 7);
  assert.ok(!next.squad.includes(droppedId));
  assert.ok(next.squad.includes(target.card.id));
});
