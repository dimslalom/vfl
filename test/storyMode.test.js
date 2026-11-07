import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  STARTERS, closeWindow, draftPack, finishSeries, newClub, nextMatch, windowOffers,
} from '../src/engine/club/season.js';
import {
  STORY_PACKS, buildBoardComms, dismissChronicle, hasUnseenStoryPack, newStoryClub, onSeriesFinishedStory,
  onWindowClosedStory, refreshPendingScene, resolveStoryScene, syncStoryOnLoad,
} from '../src/engine/story/storyDirector.js';
import { barkFacts, pickBark } from '../src/engine/story/barks.js';
import { ORIGIN_STORYLETS } from '../src/engine/story/storylines/originCampaign.js';
import {
  applyStoryEffects, buildEraChronicle, castSquadRoles, isStoryClub, pickNextEra, storyActLabel,
} from '../src/engine/story/storyMemory.js';
import { financialCrisisStoryline } from '../src/engine/story/storylines/crisisFinancial.js';
import {
  CLUB_SAVE_KEY, STORY_SAVE_KEY, clearClubSlot, loadActiveSlot, loadClub, loadClubSlot,
  saveActiveSlot, saveClub, saveClubSlot,
} from '../src/lib/clubSave.js';

const cards = JSON.parse(readFileSync(new URL('../shared/src/data/cards.json', import.meta.url), 'utf8'));

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: key => { delete data[key]; },
    data,
  };
}

function starterPicks(seed = 19) {
  const picks = [];
  for (let i = 0; i < STARTERS; i += 1) {
    picks.push(draftPack(seed, i, picks, cards)[0].id);
  }
  return picks;
}

function playMatch(state, won = true) {
  const match = nextMatch(state);
  const need = Math.ceil(match.bestOf / 2);
  const results = Array.from({ length: need }, () => ({
    map: 'Ascent',
    a: won ? 2 : 1,
    b: won ? 1 : 2,
    winA: won,
    mvp: state.squad[0],
  }));
  const next = finishSeries(state, { won, results, hand: [] }, cards);
  return isStoryClub(state) ? onSeriesFinishedStory(state, next, { won, results }, cards) : next;
}

test('club and story save slots stay completely separate', () => {
  const storage = memoryStorage();
  const clubState = newClub({ seed: 11, name: 'Club Side', picks: starterPicks(11), cards });
  const storyState = newStoryClub({ seed: 22, name: 'Story Side', picks: starterPicks(22), cards });

  assert.equal(saveClub(clubState, storage), true);
  assert.equal(saveClubSlot('story', storyState, storage), true);
  assert.ok(storage.data[CLUB_SAVE_KEY]);
  assert.ok(storage.data[STORY_SAVE_KEY]);

  assert.equal(loadClub(storage).state.name, 'Club Side');
  assert.equal(loadClubSlot('club', storage).state.name, 'Club Side');
  assert.equal(loadClubSlot('story', storage).state.name, 'Story Side');
  assert.equal(isStoryClub(loadClubSlot('club', storage).state), false);
  assert.equal(isStoryClub(loadClubSlot('story', storage).state), true);

  assert.equal(loadActiveSlot(storage), 'club');
  saveActiveSlot('story', storage);
  assert.equal(loadActiveSlot(storage), 'story');

  clearClubSlot('story', storage);
  assert.equal(loadClubSlot('story', storage).state, null);
  assert.equal(loadClubSlot('club', storage).state.name, 'Club Side');
});

test('a new story squad starts in Act I with the opening cutscene followed by the Week 1 briefing', () => {
  let state = newStoryClub({ seed: 33, name: 'Underdogs', picks: starterPicks(33), cards });
  assert.equal(isStoryClub(state), true);
  assert.equal(storyActLabel(state), 'Act I');
  assert.equal(state.story.pendingScene?.id, 'cutscene_opening');
  assert.equal(state.story.pendingScene?.kind, 'cutscene');

  // Finishing the opening cutscene queues the Week 1 locker room briefing.
  state = resolveStoryScene(state, 0, cards);
  assert.equal(state.story.pendingScene?.id, 'act1_week1_briefing');
  assert.equal(state.story.pendingScene?.kind, 'dialogue');

  const trustBefore = state.story.trust;
  state = resolveStoryScene(state, 0, cards);
  assert.equal(state.story.pendingScene, null);
  assert.equal(state.story.trust, trustBefore + 10);
});

test('series wins and losses update rivalry memory, banter, and fail forward on bottom finishes', () => {
  let state = newStoryClub({ seed: 44, name: 'Iron Five', picks: starterPicks(44), cards });
  state = resolveStoryScene(state, 0, cards);
  state = resolveStoryScene(state, 0, cards);

  const firstRivalId = nextMatch(state).id;
  state = playMatch(state, true);
  assert.equal(state.story.rivalries[firstRivalId].w, 1);
  assert.equal(state.story.banter, null, 'an ordinary win with no story history stays silent');
  assert.equal(state.story.pendingScene?.id, 'post_sweep_win');
  state = resolveStoryScene(state, 0, cards);

  // Even if a story squad finishes last twice in tier 0, it fails forward to review instead of game over.
  state = { ...state, lastPlaces: 1 };
  while (state.phase !== 'review' && state.phase !== 'over') {
    state = playMatch(state, false);
    if (state.story.pendingScene) state = resolveStoryScene(state, 0, cards);
  }
  assert.equal(state.phase, 'review');
});

test('transfer window poaching records an ex-player nemesis and advances the campaign through Acts II, III, and Dynasty Eras', () => {
  let state = newStoryClub({ seed: 55, name: 'Metro Five', picks: starterPicks(55), cards });
  state = resolveStoryScene(state, 0, cards);
  state = resolveStoryScene(state, 0, cards);

  while (state.phase !== 'review') {
    state = playMatch(state, true);
    if (state.story.pendingScene) state = resolveStoryScene(state, 0, cards);
  }

  // Put one starter on their last contract year so a rival poach decision is required.
  const poachedId = state.squad[0];
  state = {
    ...state,
    contracts: { ...state.contracts, [poachedId]: 1 },
  };
  const offers = windowOffers(state, cards);
  assert.equal(offers.mine.length, 1);
  assert.equal(offers.mine[0].card.id, poachedId);

  const decisions = { own: { [poachedId]: 'go' }, buy: [], drop: [] };
  const closed = closeWindow(state, decisions, cards);
  state = onWindowClosedStory(state, closed, decisions, cards);

  assert.equal(state.year, 2);
  assert.equal(state.story.act, 2);
  assert.equal(storyActLabel(state), 'Act II');
  assert.equal(state.story.exPlayers.length, 1);
  assert.equal(state.story.exPlayers[0].id, poachedId);
  assert.equal(state.story.pendingScene?.id, 'cutscene_act2');
  const afterAct2Cutscene = resolveStoryScene(state, 0, cards);
  assert.notEqual(afterAct2Cutscene.story.pendingScene?.id, 'cutscene_act2');
});

test('Year 3 generates an Era Chronicle and Year 4 transitions into the unending Dynasty Eras', () => {
  let state = newStoryClub({ seed: 77, name: 'Apex Founders', picks: starterPicks(77), cards });
  state = {
    ...state,
    year: 3,
    tier: 2,
    titles: 2,
    story: {
      ...state.story,
      act: 3,
      seen: ['cutscene_opening', 'cutscene_act2', 'cutscene_act3'],
      pendingScene: null,
    },
  };

  while (state.phase !== 'review') {
    state = playMatch(state, true);
    if (state.story.pendingScene) state = resolveStoryScene(state, 0, cards);
  }

  assert.ok(state.story.chronicle);
  assert.equal(state.story.chronicle.title, 'The Cinderella Dynasty');
  assert.equal(state.story.chronicle.axes.length, 4);

  state = dismissChronicle(state);
  assert.equal(state.story.chronicle, null);
  assert.equal(state.story.chronicles.length, 1);

  const offers = windowOffers(state, cards);
  const own = Object.fromEntries(offers.mine.map(item => [item.card.id, 'keep']));
  const closed = closeWindow({ ...state, packs: 20 }, { own, buy: [], drop: [] }, cards);
  state = onWindowClosedStory(state, closed, { own, buy: [], drop: [] }, cards);

  assert.equal(state.year, 4);
  assert.equal(state.story.act, 4);
  assert.ok(['dynasty', 'rebuild', 'nemesis', 'redemption'].includes(state.story.era));
  assert.equal( pickNextEra({ ...state, review: { movement: 'relegate', placement: 6 } }), 'redemption');
});

test('live story packs adapt to an existing story squad and complete once', () => {
  let state = newStoryClub({ seed: 91, name: 'Night Watch', picks: starterPicks(91), cards });
  state = {
    ...state,
    year: 2,
    week: 1,
    phase: 'league',
    story: {
      ...state.story,
      act: 2,
      seen: ['cutscene_opening', 'cutscene_act2'],
      pendingScene: null,
    },
  };

  assert.equal(STORY_PACKS.length >= 3, true);
  assert.equal(financialCrisisStoryline.canTrigger(state, state.story), true);
  assert.equal(hasUnseenStoryPack(state), true);

  state = syncStoryOnLoad(state, cards);
  assert.equal(state.story.pendingScene?.id, 'crisis_financial_2026');

  // Every reel frame and choice points at a rendered scene that ships in public/assets/story.
  const scene = state.story.pendingScene;
  const arts = [...scene.reel.map(f => f.art), ...scene.choices.map(c => c.art)];
  assert.equal(arts.length, 6);
  for (const art of arts) assert.ok(existsSync(new URL(`../public/assets/story/${art}.webp`, import.meta.url)), art);

  const { talisman } = castSquadRoles(state, cards);
  // Picking option 0 accepts the rival buyout for the talisman, grants packs, and keeps 5 starters.
  const packsBefore = state.packs;
  state = resolveStoryScene(state, 0, cards);
  assert.equal(state.story.pendingScene, null);
  assert.equal(state.story.completedPacks.includes('crisis_financial_2026'), true);
  assert.equal(financialCrisisStoryline.canTrigger(state, state.story), false);
  assert.ok(state.packs > packsBefore);
  assert.ok(state.squad.length >= STARTERS);
  assert.ok(state.story.exPlayers.some(ex => ex.id === talisman.id));

  // buildEraChronicle, buildBoardComms, and applyStoryEffects cover remaining branches cleanly.
  const modified = applyStoryEffects(state, { trust: 5, pressure: 5, reputation: 10, tape: 'aim', allXp: 50, fatigueDelta: 5 }, cards);
  assert.equal(modified.reputation, state.reputation + 10);
  const chronicle = buildEraChronicle(modified);
  assert.equal(chronicle.axes.length, 4);

  // Barks: the most specific matching rule wins, it then cools down, and quiet moments stay silent.
  const comms = buildBoardComms(modified, modified.clubs[0], cards);
  const recent = [];
  const decider = barkFacts({ event: 'round_start', round: 2, you: 1, them: 1, bestOf: 3 });
  assert.equal(pickBark(comms.rules, decider, recent)?.id, 'decider');
  assert.equal(pickBark(comms.rules, decider, recent), null);
  assert.equal(pickBark(comms.rules, barkFacts({ event: 'round_start', round: 1, you: 1, them: 0, bestOf: 5 }), recent), null);
  const withNemesis = [{ id: 'nemesis_open', score: 5, when: f => f.event === 'round_start' && f.round === 0 }, ...comms.rules];
  assert.equal(pickBark(withNemesis, barkFacts({ event: 'round_start', round: 0, you: 0, them: 0, bestOf: 3 }), [])?.id, 'nemesis_open');

  // Every storylet and live pack choice must present a real tradeoff (both outcome and cost).
  for (const item of ORIGIN_STORYLETS) {
    const built = item.build(modified, cards);
    assert.ok(built.venue);
    for (const choice of built.choices) {
      assert.ok(choice.outcome, `${item.id} choice "${choice.label}" missing outcome`);
      assert.ok(choice.cost, `${item.id} choice "${choice.label}" missing cost`);
      assert.ok(choice.reply, `${item.id} choice "${choice.label}" missing manager reply`);
    }
  }
  for (const pack of STORY_PACKS) {
    const built = pack.buildScene(modified, cards);
    assert.ok(built.venue);
    for (const choice of built.choices) {
      assert.ok(choice.outcome, `${pack.id} choice "${choice.label}" missing outcome`);
      assert.ok(choice.cost, `${pack.id} choice "${choice.label}" missing cost`);
      assert.ok(choice.reply, `${pack.id} choice "${choice.label}" missing manager reply`);
    }
  }

  // refreshPendingScene upgrades a stale saved scene in localStorage to the latest definition.
  const staleState = {
    ...modified,
    story: {
      ...modified.story,
      pendingScene: { id: 'benched_veteran_ultimatum', kind: 'dialogue', choices: [] },
    },
  };
  const refreshed = refreshPendingScene(staleState, cards);
  assert.equal(refreshed.choices.length, 3);
  assert.ok(refreshed.choices.every(c => c.outcome && c.cost && c.reply));
});
