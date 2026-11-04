import test from 'node:test';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import { CLUB_SAVE_KEY, loadClub } from '../src/lib/clubSave.js';
import {
  GOLD_PITY, PACK_VALUE, grantPacks, packValue, payPacks, settlePacks, squadMax,
} from '../src/engine/club/economy.js';
import {
  buySession, canBuySession, choosePick, chooseChip, openBlocker, openPack, rerollChips, useTape,
} from '../src/engine/club/rewards.js';
import {
  STARTERS, WEEKS, draftPack, finishSeries, newClub, nextMatch, rollChipOffer, train, trainingOffer, clubCard, squadCards,
} from '../src/engine/club/season.js';
import { TACTICS } from '../src/engine/endless/seriesCards.js';

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

test('a full squad cannot open a pack and cannot sign from one', () => {
  const state = fresh();
  assert.equal(squadMax(state), 7);
  const opened = openPack(state, 'silver', allCards);
  const full = { ...opened, squad: [...opened.squad, 'x1', 'x2'] };
  assert.equal(choosePick(full, opened.opening.ids[0]), full);
  assert.equal(openBlocker({ ...state, squad: [...state.squad, 'x1', 'x2'] }, 'silver'), 'full');
});

test('gold pity: the sixth dry silver pack carries a gold card', () => {
  let state = { ...fresh(), packs: 20, reputation: 80 };
  const golds = [];
  for (let n = 0; n < GOLD_PITY * 2; n += 1) {
    const dry = state.pity.gold;
    state = openPack(state, 'silver', allCards);
    const { guaranteed, ids } = state.opening;
    const hasGold = ids.some(id => allCards.find(card => card.id === id).rating > 80);
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
  assert.ok(gold.opening.ids.every(id => allCards.find(card => card.id === id).rating > 80));
  const icon = openPack(state, 'icons', allCards);
  assert.ok(icon.opening.ids.every(id => allCards.find(card => card.id === id).league === 'icon'));
  assert.equal(icon.icons, 0);
});

test('a club that cannot reach icons still gets the weakest ones, never an empty pack', () => {
  const state = { ...fresh(), icons: 1, reputation: 0 };
  const icon = openPack(state, 'icons', allCards);
  assert.equal(icon.opening.ids.length, 3);
});

test('a win offers three different chips and a deeper stage guarantees a better one', () => {
  let state = fresh();
  state = finishSeries(state, series(true), allCards);
  assert.equal(state.chipOffer.options.length, 3);
  assert.equal(new Set(state.chipOffer.options.map(option => option.key)).size, 3);
  for (const stage of ['Semifinal', 'Final']) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const offer = rollChipOffer(state, stage, attempt);
      const best = Math.max(...offer.options.map(option => ['common', 'uncommon', 'rare'].indexOf(TACTICS[option.key].tier)));
      assert.ok(best >= (stage === 'Final' ? 2 : 1));
    }
  }
  const lost = finishSeries(fresh(), series(false), allCards);
  assert.equal(lost.chipOffer, null);
});

test('picking a chip adds it to the hand, and a full hand must drop one', () => {
  let state = finishSeries(fresh(), series(true), allCards);
  const chip = state.chipOffer.options[0];
  const picked = chooseChip(state, chip.uid);
  assert.ok(picked.hand.some(card => card.uid === chip.uid));
  assert.equal(picked.chipOffer, null);
  const held = Array.from({ length: 7 }, (_, index) => ({ uid: `held${index}`, key: 'pocket', source: 'owned' }));
  state = { ...state, hand: held };
  assert.equal(chooseChip(state, chip.uid), state);
  const swapped = chooseChip(state, chip.uid, 'held3');
  assert.equal(swapped.hand.length, 7);
  assert.ok(!swapped.hand.some(card => card.uid === 'held3'));
  assert.equal(chooseChip(state, null).chipOffer, null);
});

test('rerolling a chip offer costs a pack and deals new chips', () => {
  const state = finishSeries(fresh(), series(true), allCards);
  const next = rerollChips(state);
  assert.equal(packValue(next), packValue(state) - 1);
  assert.notDeepEqual(next.chipOffer.options.map(option => option.key), state.chipOffer.options.map(option => option.key));
  const broke = { ...state, packs: 0, gold: 0, icons: 0 };
  assert.equal(rerollChips(broke), broke);
});

test('a clean sweep earns a second session next week, and training spends one at a time', () => {
  let state = finishSeries(fresh(), series(true, 3, true), allCards);
  assert.equal(state.trainSlot, 2);
  const card = squadCards(state, allCards)[0];
  state = train(state, card, 'stat');
  assert.equal(state.trainSlot, 1);
  state = train(state, squadCards(state, allCards)[1], 'stat');
  assert.equal(state.trainSlot, 0);
  const narrow = finishSeries(fresh(), series(true, 3, false), allCards);
  assert.equal(narrow.trainSlot, 1);
});

test('a second session can be bought for a pack, once', () => {
  const state = fresh();
  assert.equal(canBuySession(state), true);
  const bought = buySession(state);
  assert.equal(bought.trainSlot, 2);
  assert.equal(packValue(bought), packValue(state) - 1);
  assert.equal(canBuySession(bought), false);
  assert.equal(buySession(bought), bought);
});

test('a skill tape finishes a session without using the week', () => {
  let state = fresh();
  const card = squadCards(state, allCards).find(item => trainingOffer(state, clubCard(state, item)).skill);
  state = { ...state, tapes: 2 };
  const before = trainingOffer(state, card);
  const next = useTape(state, card);
  assert.equal(next.tapes, 1);
  assert.equal(next.trainSlot, state.trainSlot);
  assert.equal(trainingOffer(next, card).sessions, before.sessions + 1);
  assert.equal(useTape({ ...state, tapes: 0 }, card).tapes, 0);
});

test('the bench earns a share of experience, and prospects learn faster', () => {
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
