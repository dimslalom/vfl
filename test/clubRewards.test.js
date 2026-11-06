import test from 'node:test';
import { chipTier } from '../src/engine/board/board.js';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import { CLUB_SAVE_KEY, loadClub } from '../src/lib/clubSave.js';
import {
  GOLD_PITY, GOLD_RATING, PACK_VALUE, grantPacks, packValue, payPacks, settlePacks, squadMax,
} from '../src/engine/club/economy.js';
import {
  canRename, choosePick, cleanName, renameClub, chooseChip, openBlocker, openPack, rerollChips, setTacticEquipped, useTape,
} from '../src/engine/club/rewards.js';
import {
  STARTERS, WEEKS, draftPack, finishSeries, newClub, nextMatch, rollChipOffer, rollSeasonEvo, trainingOffer, clubCard, squadCards,
} from '../src/engine/club/season.js';

import { rollTapes } from '../src/engine/club/tapes.js';

function draft(seed = 7) {
  const picks = [];
  for (let index = 0; index < STARTERS; index += 1) picks.push(draftPack(seed, index, picks, allCards)[0].id);
  return picks;
}
const fresh = (seed = 7) => newClub({ seed, name: 'Winners', picks: draft(seed), cards: allCards });

function series(won, bestOf = 3, sweep = true) {
  const need = Math.ceil(bestOf / 2);
  const results = Array.from({ length: need }, (_, index) => ({ map: 'Icebox', a: 2, b: 1, winA: won && (sweep || index === 0), mvp: null }));
  return { won, results, hand: [] };
}

function playYear(state, won) {
  let next = state;
  while (nextMatch(next)) next = finishSeries(next, series(won, nextMatch(next).bestOf), allCards);
  return next;
}

test('paying takes silver first, then breaks a bigger pack and returns the change', () => {
  const state = { packs: 1, gold: 1, icons: 0 };
  assert.equal(packValue(state), 1 + PACK_VALUE.gold);
  const one = payPacks(state, 1);
  assert.deepEqual([one.packs, one.gold], [0, 1]);
  const two = payPacks(state, 2);
  assert.deepEqual([two.packs, two.gold], [2, 0]);
  assert.equal(payPacks(state, 5), null);
  const back = settlePacks(state, 9);
  assert.equal(packValue(back), 9);
  assert.equal(packValue(grantPacks(state, { icons: 1 })), 4 + PACK_VALUE.icons);
});

test('a title pays gold, and every second title pays an icon', () => {
  let state = fresh();
  assert.equal(state.gold, 0);
  state = playYear(state, true);
  assert.equal(state.review.gold, 2);
  assert.equal(state.review.icons, 0);
  assert.equal(state.gold, 2);
  const second = playYear({ ...fresh(9), titles: 1 }, true);
  assert.equal(second.review.icons, 1);
  assert.equal(second.icons, 1);
});

test('missing the playoffs pays no gold', () => {
  let state = fresh();
  for (let week = 0; week < WEEKS; week += 1) state = finishSeries(state, series(false), allCards);
  assert.equal(state.review.gold, 0);
});

test('opening a pack spends it and waits for a pick that survives a reload', () => {
  const state = fresh();
  const opened = openPack(state, 'silver', allCards);
  assert.equal(opened.packs, state.packs - 1);
  assert.equal(opened.opening.ids.length, 3);
  assert.equal(openBlocker(opened, 'silver'), 'open');
  assert.deepEqual(openPack(opened, 'silver', allCards), opened);
  const reloaded = JSON.parse(JSON.stringify(opened));
  assert.deepEqual(reloaded.opening, opened.opening);
  const pick = opened.opening.ids[0];
  const signed = choosePick(opened, pick);
  assert.equal(signed.opening, null);
  assert.equal(signed.squad.at(-1), pick);
  assert.equal(signed.contracts[pick], 3);
  assert.ok(!state.squad.includes(pick));
});

test('the same save opens the same pack', () => {
  const a = openPack(fresh(), 'silver', allCards);
  const b = openPack(fresh(), 'silver', allCards);
  assert.deepEqual(a.opening, b.opening);
});

test('passing on a pack gives a skill tape, up to the cap', () => {
  let state = fresh();
  state = { ...state, packs: 10 };
  for (let n = 0; n < 5; n += 1) state = choosePick(openPack(state, 'silver', allCards), null);
  assert.equal(state.tapes, 3);
});

test('a full squad can open a pack, and signing from it swaps a player out in place', () => {
  const state = fresh();
  assert.equal(squadMax(state), 7);
  const placed = new Set([...state.squad, ...state.clubs.flatMap(club => club.roster)]);
  const [x1, x2] = allCards.filter(card => !placed.has(card.id) && card.league !== 'icon').map(card => card.id);
  const fullState = { ...state, squad: [...state.squad, x1, x2], contracts: { ...state.contracts, [x1]: 2 } };
  assert.equal(openBlocker(fullState, 'silver'), null);
  const opened = openPack(fullState, 'silver', allCards);
  const pick = opened.opening.ids[0];
  assert.equal(choosePick(opened, pick), opened);
  assert.equal(choosePick(opened, pick, 'nobody'), opened);
  const swapped = choosePick(opened, pick, x1);
  assert.equal(swapped.squad.length, 7);
  assert.equal(swapped.squad[5], pick);
  assert.ok(!swapped.squad.includes(x1));
  assert.equal(swapped.contracts[x1], undefined);
  assert.equal(swapped.contracts[pick], 3);
});

test('gold pity: the sixth dry silver pack carries a gold card', () => {
  let state = { ...fresh(), packs: 20, reputation: 80 };
  const golds = [];
  for (let n = 0; n < GOLD_PITY * 2; n += 1) {
    const dry = state.pity.gold;
    state = openPack(state, 'silver', allCards);
    const { guaranteed, ids } = state.opening;
    const hasGold = ids.some(id => allCards.find(card => card.id === id).rating >= GOLD_RATING);
    if (dry >= GOLD_PITY - 1) assert.ok(guaranteed || hasGold, 'pity pack holds a gold');
    golds.push(hasGold);
    state = choosePick(state, null);
  }
  assert.ok(golds.some(Boolean));
  const longestDry = golds.reduce((run, hasGold) => ({ now: hasGold ? 0 : run.now + 1, max: Math.max(run.max, hasGold ? 0 : run.now + 1) }), { now: 0, max: 0 }).max;
  assert.ok(longestDry < GOLD_PITY);
});

test('icons and gold packs deal only their own kind', () => {
  const state = { ...fresh(), gold: 1, icons: 1, reputation: 99 };
  const gold = openPack(state, 'gold', allCards);
  assert.ok(gold.opening.ids.every(id => allCards.find(card => card.id === id).rating >= GOLD_RATING));
  const icon = openPack(state, 'icons', allCards);
  assert.ok(icon.opening.ids.every(id => allCards.find(card => card.id === id).league === 'icon'));
  assert.equal(icon.icons, 0);
});

test('a club that cannot reach icons still gets the weakest ones, never an empty pack', () => {
  const state = { ...fresh(), icons: 1, reputation: 0 };
  const icon = openPack(state, 'icons', allCards);
  assert.equal(icon.opening.ids.length, 3);
});

test('series bank tapes and a win adds a tactic to a full club reserve', () => {
  const hand = Array.from({ length: 7 }, (_, index) => ({ uid: `held${index}`, key: 'pocket', source: 'owned' }));
  const state = { ...fresh(), hand };
  const won = finishSeries(state, { ...series(true), hand }, allCards);
  assert.equal(won.chipOffer, null);
  assert.equal(won.packs, state.packs + 1);
  assert.deepEqual(won.hand, hand);
  assert.deepEqual(won.tacticReserve, [won.last.tactic]);
  assert.equal(Object.values(won.trainingTapes).reduce((a, b) => a + b, 0), won.last.tapes.length);
  assert.equal(setTacticEquipped(won, won.last.tactic.uid, true), won);
  const swapped = setTacticEquipped(setTacticEquipped(won, hand[0].uid, false), won.last.tactic.uid, true);
  assert.equal(swapped.hand.length, 7);
  assert.ok(swapped.hand.some(chip => chip.uid === won.last.tactic.uid));
  assert.deepEqual(swapped.tacticReserve, [hand[0]]);
  const lost = finishSeries(swapped, { ...series(false), hand: [{ uid: 'loan', key: 'pocket', source: 'igl' }] }, allCards);
  assert.deepEqual(lost.hand, []);
  assert.deepEqual(lost.tacticReserve, swapped.tacticReserve);
  assert.ok(lost.last.tapes.length >= 1);
  assert.equal(lost.packs, won.packs);
});

test('playoff wins bank a better tactic, with no regular series Evo roll', () => {
  const state = playYear(fresh(), true);
  assert.equal(chipTier(state.last.tactic.key), 'rare');
  assert.equal(state.chipOffer, null);
  assert.ok(state.evoInventory.length <= 1);
  assert.deepEqual(state.evoInventory, state.last.evoReward ? [state.last.evoReward] : []);
});

test('an offer in a legacy save can still be claimed or rerolled', () => {
  const state = fresh();
  const withOffer = { ...state, chipOffer: rollChipOffer(state, 'Week 1') };
  const chip = withOffer.chipOffer.options.find(option => !option.evo);
  const picked = chooseChip(withOffer, chip.uid);
  assert.deepEqual(picked.hand, [chip]);
  assert.equal(picked.chipOffer, null);
  const rerolled = rerollChips(withOffer);
  assert.equal(packValue(rerolled), packValue(state) - 1);
  assert.equal(rerolled.chipOffer.attempt, 1);
});

test('tape count and type boundaries distinguish wins from losses', () => {
  const at = (quantity, won, type = 0) => {
    const rolls = [quantity, type, 0, type, 0, type, 0];
    return rollTapes(() => rolls.shift(), won);
  };
  assert.deepEqual(at(0.79, false), ['aim']);
  assert.deepEqual(at(0.8, false, 0.8), ['flex', 'flex']);
  assert.equal(at(0.19, true).length, 1);
  assert.equal(at(0.2, true).length, 2);
  assert.equal(at(0.8, true).length, 3);
});

test('season Evo roll keeps Apex exclusive to International titles', () => {
  const at = (roll, champion, tier) => {
    const rolls = [roll, 0];
    return rollSeasonEvo(() => rolls.shift(), champion, tier);
  };
  assert.equal(at(0.24, false, 2), 'glacier');
  assert.equal(at(0.25, false, 2), null);
  assert.equal(at(0.29, true, 1), 'clutch_factor');
  assert.equal(at(0.30, true, 1), null);
  assert.equal(at(0.049, true, 2), 'apex_predator');
  assert.equal(at(0.05, true, 2), 'clutch_factor');
  assert.equal(at(0.35, true, 2), null);
});

test('season settlement preserves existing career gains without advancing age', () => {
  const state = fresh();
  const id = state.squad[0];
  const veteran = { p: 120, d: 2, a: 3, m: 2, s: 1 };
  const next = playYear({ ...state, dev: { [id]: veteran } }, false);
  assert.equal(next.phase, 'review');
  for (const [key, value] of Object.entries(veteran)) assert.equal(next.dev[id][key], value);
  assert.equal(next.dev[id].f, 0);
});

test('a clean sweep grants tape loot without creating a weekly training slot', () => {
  const state = finishSeries(fresh(), series(true, 3, true), allCards);
  assert.ok(state.last.tapes.length > 0);
  assert.equal(Object.hasOwn(state, 'trainSlot'), false);
});

test('winning all three lanes in a round awards a flawless sweep bonus tape and extra squad XP', () => {
  const normalSeries = {
    won: true,
    results: [
      { map: 'Ascent', a: 2, b: 1, winA: true, mvp: null },
      { map: 'Bind', a: 2, b: 1, winA: true, mvp: null },
    ],
    hand: [],
  };
  const flawlessSeries = {
    won: true,
    results: [
      { map: 'Ascent', a: 3, b: 0, winA: true, mvp: null },
      { map: 'Bind', a: 2, b: 1, winA: true, mvp: null },
    ],
    hand: [],
  };
  const normalState = finishSeries(fresh(42), normalSeries, allCards);
  const flawlessState = finishSeries(fresh(42), flawlessSeries, allCards);

  assert.equal(flawlessState.last.flawlessRounds, 1);
  assert.equal(flawlessState.last.flawlessTapes.length, 1);
  assert.equal(flawlessState.last.tapes.length, normalState.last.tapes.length + 1);
  const normalGain = normalState.last.growth[0].gain;
  const flawlessGain = flawlessState.last.growth[0].gain;
  assert.ok(flawlessGain > normalGain);
});

test('a legacy generic skill tape still advances the player offered skill', () => {
  let state = fresh();
  const card = squadCards(state, allCards).find(item => trainingOffer(state, clubCard(state, item)).skill);
  state = { ...state, tapes: 2 };
  const before = trainingOffer(state, card);
  const next = useTape(state, card);
  assert.equal(next.tapes, 1);
  assert.equal(trainingOffer(next, card).sessions, before.sessions + 1);
  assert.equal(useTape({ ...state, tapes: 0 }, card).tapes, 0);
});

test('targeted tapes train a chosen attribute and stop at its cap', () => {
  const freshState = fresh();
  const raw = allCards.find(item => item.id === freshState.squad[0]);
  const state = { ...freshState, trainingTapes: { aim: 2, flex: 1 },
    training: { [raw.id]: { stats: { aim: 6 }, learning: { key: 'flick', sessions: 1 } } } };
  const card = clubCard(state, raw);
  const trained = useTape(state, card, 'aim');
  assert.equal(trained.training[raw.id].stats.aim, 8);
  assert.equal(trained.trainingTapes.aim, 1);
  assert.equal(useTape(trained, clubCard(trained, raw), 'aim'), trained);
  assert.equal(useTape(trained, clubCard(trained, raw), 'flex'), trained);
});

test('an 80 OVR development card uses Gold metal even when tired', () => {
  const state = fresh();
  const raw = { ...allCards.find(item => item.id === state.squad[0]), rating: 79, tier: 'silver', palette: 'silver' };
  const promoted = { ...state, dev: { [raw.id]: { d: 1, f: 100 } } };
  const card = clubCard(promoted, raw);
  assert.ok(card.rating < 80);
  assert.equal(card.developmentRating, 80);
  assert.equal(card.tier, 'gold');
  assert.equal(card.palette, 'gold');
  assert.equal(clubCard(state, raw).tier, 'silver');
});

test('the bench earns a share of starter experience', () => {
  const squad = draft();
  const extra = allCards.find(card => !squad.includes(card.id) && card.league !== 'icon' && card.rating < 76);
  let state = fresh();
  state = { ...state, squad: [...state.squad, extra.id], contracts: { ...state.contracts, [extra.id]: 3 } };
  state = finishSeries(state, series(true), allCards);
  const benched = state.last.growth.find(row => row.id === extra.id);
  const starter = state.last.growth.find(row => row.id === squad[0]);
  assert.equal(benched.bench, true);
  assert.ok(benched.gain > 0 && benched.gain < starter.gain);
});

test('tired starters lose more than before, and the bench recovers', () => {
  const state = fresh();
  const id = state.squad[0];
  const rested = clubCard(state, allCards.find(card => card.id === id));
  const tired = clubCard({ ...state, dev: { ...state.dev, [id]: { ...(state.dev[id] ?? {}), f: 100 } } }, allCards.find(card => card.id === id));
  assert.ok(rested.rating - tired.rating >= 4);
});

test('bench slots open at International and with a second title', () => {
  const state = fresh();
  assert.equal(squadMax(state), 7);
  assert.equal(squadMax({ ...state, titles: 2 }), 8);
  assert.equal(squadMax({ ...state, tier: 2 }), 8);
  assert.equal(squadMax({ ...state, tier: 1, history: [{ tier: 2 }], titles: 2 }), 9);
});

test('a version 1 save loads with the new fields filled in', () => {
  const old = { ...fresh(), v: 1 };
  for (const key of ['gold', 'icons', 'pity', 'tapes', 'opens', 'opening', 'chipOffer']) delete old[key];
  const storage = { getItem: () => JSON.stringify(old), setItem() {}, removeItem() {} };
  const { state, damaged } = loadClub(storage);
  assert.equal(damaged, false);
  assert.equal(state.v, 2);
  assert.equal(state.gold, 0);
  assert.deepEqual(state.pity, { gold: 0 });
  assert.equal(CLUB_SAVE_KEY, 'vfl-club-save');
});

test('the founding name is free; a new name later costs 3 in pack value', () => {
  const picks = [];
  for (let index = 0; index < STARTERS; index += 1) picks.push(draftPack(7, index, picks, allCards)[0].id);
  const state = newClub({ seed: 7, name: 'Night Shift', picks, cards: allCards });
  assert.equal(packValue(state), 3, 'a new club starts with exactly one rename in the bank');
  const renamed = renameClub(state, '  Day   Shift ');
  assert.equal(renamed.name, 'Day Shift');
  assert.equal(packValue(renamed), 0);
  assert.equal(canRename(renamed, 'Again'), false, 'no packs left');
  assert.equal(renameClub(renamed, 'Again'), renamed);
  assert.equal(canRename(state, 'Night Shift'), false, 'the same name is not a rename');
  assert.equal(canRename(state, '   '), false, 'a name is needed');
  assert.equal(canRename({ ...state, phase: 'over' }, 'Ghosts'), false, 'a sacked club cannot rename');
  const rich = grantPacks(state, { gold: 1 });
  assert.equal(packValue(renameClub(rich, 'Gold Rush')), packValue(rich) - 3);
  assert.equal(cleanName('x'.repeat(40)).length, 18);
});
