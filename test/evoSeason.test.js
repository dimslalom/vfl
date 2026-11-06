import test from 'node:test';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import {
  STARTERS, clubCard, commitEvolution, draftPack, finishSeries, isEligibleForEvo, newClub,
} from '../src/engine/club/season.js';
import { chooseChip } from '../src/engine/club/rewards.js';

function draft(seed = 42) {
  const picks = [];
  for (let index = 0; index < STARTERS; index += 1) picks.push(draftPack(seed, index, picks, allCards)[0].id);
  return picks;
}

const freshClub = (seed = 42) => newClub({
  seed,
  name: 'Evo Test Club',
  picks: draft(seed),
  cards: allCards,
  crest: 'shield',
  tone: 'cyan',
});

test('Choosing an Evo Chip on the chip pick screen banks it into evoInventory without occupying a hand slot', () => {
  const club = freshClub();

  const offer = {
    stage: 'Week 1',
    floor: 'common',
    attempt: 0,
    options: [
      { uid: 'evo_glacier_1_0_0', kind: 'evo', key: 'glacier', evo: true },
      { uid: 'tac_1', kind: 'tactic', key: 'hit' },
      { uid: 'tac_2', kind: 'tactic', key: 'retake' },
    ],
  };

  const stateWithOffer = { ...club, chipOffer: offer, hand: [] };
  const picked = chooseChip(stateWithOffer, 'evo_glacier_1_0_0');

  assert.equal(picked.chipOffer, null);
  assert.deepEqual(picked.hand, []); // hand is untouched!
  assert.deepEqual(picked.evoInventory, ['glacier']); // banked in inventory!
});

test('isEligibleForEvo validates rating caps and role restrictions', () => {
  const sentinel75 = { id: 's1', rating: 75, role: 'Sentinel' };
  const duelist75 = { id: 'd1', rating: 75, role: 'Duelist' };
  const sentinel85 = { id: 's2', rating: 85, role: 'Sentinel' };

  // Glacier Shield requires maxRating 80 and Sentinel/Controller
  assert.equal(isEligibleForEvo(sentinel75, 'glacier').eligible, true);
  assert.equal(isEligibleForEvo(duelist75, 'glacier').eligible, false); // Role mismatch
  assert.equal(isEligibleForEvo(sentinel85, 'glacier').eligible, false); // Rating too high
});

test('commitEvolution consumes an Evo and starts Level 1 without a training slot', () => {
  const club = freshClub();
  const targetId = club.squad[0];

  const clubWithChip = {
    ...club,
    evoInventory: ['glacier'],
    activeEvo: null,
  };

  const committed = commitEvolution(clubWithChip, targetId, 'glacier');
  assert.equal(Object.hasOwn(committed, 'trainSlot'), false);
  assert.deepEqual(committed.evoInventory, []);
  assert.ok(committed.activeEvo);
  assert.equal(committed.activeEvo.cardId, targetId);
  assert.equal(committed.activeEvo.evoKey, 'glacier');
  assert.equal(committed.activeEvo.level, 1);
  assert.equal(committed.activeEvo.l1Done, false);

  // Committing another while one is active is refused (1 active evo rule)
  const withExtraEvo = { ...committed, evoInventory: ['glacier'] };
  assert.equal(commitEvolution(withExtraEvo, club.squad[1], 'glacier'), withExtraEvo);
});

test('Multi-level evolution match tracking: Level 1 and Level 2 progression and stat/skill unlocks', () => {
  const club = freshClub();
  const targetId = club.squad[0];
  const targetCard = allCards.find(c => c.id === targetId);

  // Start with First Strike committed on targetId
  // First Strike L1: Play 1 match starting (+1 Aim, +1 Ability)
  // First Strike L2: Win 2 matches starting (+1 Aim, +1 Ability, first_blood skill, ember theme)
  const clubActive = {
    ...club,
    evoInventory: [],
    activeEvo: {
      cardId: targetId,
      evoKey: 'first_strike',
      level: 1,
      l1Progress: 0,
      l2Progress: 0,
      l1Done: false,
      l2Done: false,
    },
  };

  // Match 1: Played and lost (winA: false)
  const match1Outcome = {
    won: false,
    results: [
      { map: 'Bind', a: 11, b: 13, winA: false, squad: club.squad },
      { map: 'Haven', a: 9, b: 13, winA: false, squad: club.squad },
    ],
  };

  const afterMatch1 = finishSeries(clubActive, match1Outcome, allCards);
  // Level 1 required 1 match played. Since target played, Level 1 completed!
  assert.equal(afterMatch1.last.evoProgress?.completed, true);
  assert.equal(afterMatch1.last.evoProgress?.level, 1);
  assert.equal(afterMatch1.training[targetId].evoLevel, 1);
  assert.equal(afterMatch1.training[targetId].evoTheme, 'ember');
  assert.equal(afterMatch1.training[targetId].stats.aim, 1);
  assert.equal(afterMatch1.training[targetId].stats.ability, 1);
  assert.equal(afterMatch1.activeEvo.l1Done, true);
  assert.equal(afterMatch1.activeEvo.level, 2);

  // Match 2: Played and won (Level 2 progress: 1/2 wins)
  const match2Outcome = {
    won: true,
    results: [
      { map: 'Ascent', a: 13, b: 8, winA: true, squad: club.squad },
      { map: 'Split', a: 13, b: 10, winA: true, squad: club.squad },
    ],
  };
  const afterMatch2 = finishSeries(afterMatch1, match2Outcome, allCards);
  assert.equal(afterMatch2.last.evoProgress?.completed, false);
  assert.equal(afterMatch2.last.evoProgress?.level, 2);
  assert.equal(afterMatch2.last.evoProgress?.progress, 1);
  assert.equal(afterMatch2.activeEvo.l2Done, false);

  // Match 3: Played and won (Level 2 progress: 2/2 wins -> Full Evolution Complete!)
  const match3Outcome = {
    won: true,
    results: [
      { map: 'Sunset', a: 13, b: 7, winA: true, squad: club.squad },
      { map: 'Icebox', a: 13, b: 9, winA: true, squad: club.squad },
    ],
  };
  const afterMatch3 = finishSeries(afterMatch2, match3Outcome, allCards);
  assert.equal(afterMatch3.last.evoProgress?.completed, true);
  assert.equal(afterMatch3.last.evoProgress?.level, 2);
  assert.equal(afterMatch3.activeEvo, null); // Active evo completed and cleared!

  // Check upgraded card via clubCard
  const upgraded = clubCard(afterMatch3, targetCard);
  assert.equal(upgraded.evoLevel, 2);
  assert.equal(upgraded.evoTheme, 'ember');
  assert.equal(upgraded.evoBadge, 'FBD');
  assert.ok(upgraded.learned.includes('first_blood'));
  assert.equal(afterMatch3.training[targetId].stats.aim, 2); // +1 (L1) + 1 (L2) = +2
  assert.equal(afterMatch3.training[targetId].stats.ability, 2);
  assert.ok(upgraded.stats.aim >= targetCard.stats.aim + 2);
});
