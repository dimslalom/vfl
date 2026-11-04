import test from 'node:test';
import assert from 'node:assert/strict';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };
import { nextMoves, tabCounts } from '../src/lib/deskMoves.js';
import { previewSquadChange, squadPower } from '../src/engine/endless/squadPreview.js';
import { scoreLines } from '../src/lib/scoreBreakdown.js';
import { challengeUrl, decodeChallenge, encodeChallenge } from '../src/lib/challenge.js';
import {
  HALL_CAP, addHallEntry, migratePerfectRunSaves,
} from '../src/lib/perfectRunSaves.js';
import { prestigePayout } from '../src/engine/endless/market.js';
import { DAILY_SCORE_MAX, DAILY_YEARS, isLastEvent } from '../src/lib/dailyRules.js';
import { lobbyTurn } from '../src/lib/lobbyTurn.js';
import { ROUND_KEYS, ROUND_META, evaluateEndless, evaluateSeason, teamPower } from '../shared/src/engine/perfectRun.js';
import { effectiveRoster } from '../shared/src/engine/endless/career.js';

const sample = allCards.filter(card => card.org).slice(0, 8);
const five = sample.slice(0, 5);

test('nextMoves is empty when nothing waits, and vanishes outside Endless', () => {
  assert.deepEqual(nextMoves({}), []);
  assert.deepEqual(nextMoves({ endless: false, poachOffer: { cardId: 'x' }, packs: 3 }), []);
});

test('nextMoves orders work from most to least urgent and counts tabs', () => {
  const target = { id: 'target', rating: 80 };
  const moves = nextMoves({
    poachOffer: { cardId: 'x' }, prospect: { cardId: 'y' }, rosterCount: 4,
    packs: 3, targets: [{ id: 'dear', rating: 95 }, target], costOf: card => (card.rating > 90 ? 5 : 3),
    mapChanges: [{ id: 'bind' }],
  });
  assert.deepEqual(moves.map(move => move.key), ['poach', 'prospect', 'short', 'pack', 'signing', 'maps']);
  assert.equal(moves[0].blocking, true);
  assert.equal(moves.find(move => move.key === 'signing').card, target);
  assert.deepEqual(tabCounts(moves), { squad: 0, market: 3, world: 1 });
});

test('a signing only counts as a move once it is affordable', () => {
  const moves = nextMoves({ packs: 1, targets: [{ id: 'a' }], costOf: () => 3 });
  assert.deepEqual(moves.map(move => move.key), ['pack']);
});

test('previewSquadChange agrees with the power the game computes afterwards', () => {
  const dev = { [five[1].id]: { d: 3, p: 12 } };
  const bonds = {};
  const incoming = sample[6];
  const preview = previewSquadChange({ picks: five, dev, bonds }, { incoming, outId: five[2].id });
  const applied = five.map(card => (card.id === five[2].id ? incoming : card));
  const actual = squadPower({ picks: applied, dev, bonds });
  assert.equal(preview.after.power, actual.power);
  assert.equal(preview.after.chem, actual.chem);
  assert.equal(preview.power, actual.power - squadPower({ picks: five, dev, bonds }).power);
  assert.equal(preview.benchOnly, false);
});

test('squadPower is the same calculation the legacy modes used', () => {
  const direct = teamPower(five, five[0].id);
  assert.equal(squadPower({ picks: five, endless: false }).power, direct.power);
  assert.equal(effectiveRoster(five, {}).length, 5);
});

test('a bench signing changes no starter, and losing a starter leaves no after-power', () => {
  const six = sample.slice(0, 6);
  const bench = previewSquadChange({ picks: five }, { incoming: sample[6] });
  assert.equal(bench.benchOnly, true);
  assert.equal(bench.power, 0);
  const lost = previewSquadChange({ picks: five }, { outId: five[0].id });
  assert.equal(lost.after, null);
  assert.equal(lost.power, null);
  const covered = previewSquadChange({ picks: six }, { outId: six[1].id });
  assert.notEqual(covered.after, null);
});

function fakeEvent(champion, mapsWon, mapsLost, roundDiff) {
  const series = [{ won: champion, mapsWon, mapsLost, roundDiff }];
  return { champion, series };
}

test('score lines add up to the score, including the zero floor', () => {
  const season = evaluateSeason([fakeEvent(true, 2, 0, 12), fakeEvent(true, 2, 1, 4), fakeEvent(true, 3, 0, 20)]);
  const add = lines => lines.reduce((sum, line) => sum + line.value, 0);
  assert.equal(add(scoreLines(season)), season.score);
  assert.ok(scoreLines(season).some(line => line.key === 'slams'));

  const floored = evaluateEndless([fakeEvent(false, 0, 2, -40), fakeEvent(false, 0, 2, -30), fakeEvent(false, 0, 2, -30), fakeEvent(true, 2, 0, 20)]);
  assert.equal(add(scoreLines(floored)), floored.score);
  assert.ok(scoreLines(floored).some(line => line.key === 'floor'));
});

test('prestige pays the multiplier on its button, and the lines show it', () => {
  const payout = prestigePayout({ level: 0, multiplier: 1, bankedScore: 0 }, 1001);
  assert.deepEqual(payout, { multiplier: 1.5, total: 1502, bonus: 501 });

  const run = evaluateEndless([fakeEvent(true, 2, 0, 12), fakeEvent(true, 2, 1, 4), fakeEvent(false, 1, 2, -3)]);
  const { multiplier, total, bonus } = prestigePayout({ multiplier: 1 }, run.score);
  const retired = { ...run, score: total, prestigeBonus: bonus, prestigeMultiplier: multiplier };
  const lines = scoreLines(retired);
  assert.equal(lines.find(line => line.key === 'prestige').value, bonus);
  assert.equal(lines.reduce((sum, line) => sum + line.value, 0), total);
});

test('challenge links round-trip and reject anything malformed', () => {
  const challenge = { seed: 0xfeedbeef, score: 1240, years: 2, packs: 3, by: 'Brisbane Reapers' };
  assert.deepEqual(decodeChallenge(`?${encodeChallenge(challenge)}`), challenge);
  assert.match(challengeUrl('https://x.test', challenge), /^https:\/\/x\.test\/run\?c=/);
  for (const bad of ['', '?c=1.2', '?c=zzzzzzzzzz.1.1.3', '?c=1.-5.1.3', '?c=1.5.0.3', '?c=1.5.1.9', '?c=1.a.1.3']) {
    assert.equal(decodeChallenge(bad), null, bad);
  }
});

test('v3 saves gain an empty Hall, and the Hall keeps the best runs', () => {
  const migrated = migratePerfectRunSaves({ saveVersion: 3, endlessV3: { bestScore: 900 } });
  assert.deepEqual(migrated.hall, []);
  assert.equal(migrated.saveVersion, 4);
  assert.equal(migrated.endlessV3.bestScore, 900);
  assert.deepEqual(migratePerfectRunSaves(null).hall, []);

  let hall = [];
  for (let score = 0; score < HALL_CAP + 5; score += 1) hall = addHallEntry(hall, { score, at: score });
  assert.equal(hall.length, HALL_CAP);
  assert.equal(hall[0].score, HALL_CAP + 4);
  assert.equal(hall.at(-1).score, 5);
});

test('the Daily score ceiling covers a perfect year', () => {
  const series = ROUND_KEYS.map(key => ROUND_META[key].bestOf);
  const mapsPerEvent = series.reduce((sum, bestOf) => sum + Math.ceil(bestOf / 2), 0);
  const maps = mapsPerEvent * 3;
  const perfect = series.length * 3 * 100 + maps * 20 + maps * 13 + 3 * 150 + 300 + 500;
  assert.equal(DAILY_SCORE_MAX, perfect);
});

test('a Daily ends by itself after its third event; a normal run never does', () => {
  assert.equal(DAILY_YEARS, 1);
  assert.equal(isLastEvent(DAILY_YEARS, 0), false);
  assert.equal(isLastEvent(DAILY_YEARS, 1), false);
  assert.equal(isLastEvent(DAILY_YEARS, 2), true);
  assert.equal(isLastEvent(2, 2), false);
  assert.equal(isLastEvent(2, 5), true);
  assert.equal(isLastEvent(null, 300), false);
});

test('lobbyTurn names whose move it is in every phase', () => {
  const base = {
    hostId: 'a',
    competitors: [{ id: 'a', squadName: 'Alpha' }, { id: 'b', squadName: 'Bravo' }],
  };
  assert.deepEqual(lobbyTurn({ ...base, phase: 'lobby' }, 'b').waitingOn, ['Alpha']);
  assert.equal(lobbyTurn({ ...base, phase: 'lobby' }, 'a').mine, true);
  const draft = { ...base, phase: 'draft', draft: { activeCompetitorId: 'b', deadlineAt: 9 } };
  assert.equal(lobbyTurn(draft, 'b').mine, true);
  assert.equal(lobbyTurn(draft, 'a').deadlineAt, 9);
  const igl = { ...base, phase: 'igl_select', draft: { iglSelections: { a: 'x' }, deadlineAt: 5 } };
  assert.equal(lobbyTurn(igl, 'a').mine, false);
  assert.deepEqual(lobbyTurn(igl, 'a').waitingOn, ['Bravo']);
  const prep = { ...base, phase: 'series_prep', seriesPrep: { deadlineAt: 3, sides: { a: { ready: true }, b: { ready: false } } } };
  assert.equal(lobbyTurn(prep, 'b').mine, true);
  assert.deepEqual(lobbyTurn(prep, 'a').waitingOn, ['Bravo']);
});
