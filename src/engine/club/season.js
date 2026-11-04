// Club mode: a squad you keep, in a league, year after year.
//
// A year is five league weeks, top-four playoffs, a review and one transfer
// window. The state is plain JSON of ids, so a save is just the state, and every
// roll comes from a seed plus a tag, so no rng state needs storing.
//
// One contract rule carries the whole market: every player, yours or a rival's,
// has one to three years left, and anyone on their last year can move. Nothing
// in the window is a dice roll. A rival takes your player only if you let them.

import { effectiveCard, emptyDev, tickCareerYear, tickFatigue, careerStage } from '../../../shared/src/engine/endless/career.js';
import { eligibleOrgs, mulberry32, pickN, samplePack } from '../../../shared/src/engine/perfectRun.js';
import { BOARD_SKILLS } from '../board/board.js';
import { TIERS, reputationDelta, tierPools } from '../endless/ladder.js';
import { releaseFee, signingCost } from '../endless/market.js';
import { maxSignableRating } from '../endless/stature.js';
import { tickWorldYear } from '../endless/world.js';
import { createTacticInstance, TACTIC_LIST } from '../endless/seriesCards.js';
import {
  BENCH_XP, TITLES_PER_ICON, TRAIN_SLOTS_MAX, clubFatigueExtra, grantPacks, packValue, rewardDefaults, withSignings,
  settlePacks, squadMax,
} from './economy.js';

export const LEAGUE_SIZE = 6;
export const WEEKS = LEAGUE_SIZE - 1;
export const PLAYOFF_SPOTS = 4;
export const STARTERS = 5;
export const SQUAD_MAX = 7;
export const CONTRACT_MAX = 3;
export const DRAFT_PACKS = 5;
export const DRAFT_PACK_SIZE = 3;
export const SKILL_SESSIONS = 3;
export const STAT_STEP = 2;
export const STAT_CAP = 8;
export const XP_PER_POINT = 150;
export const YEAR_PACKS = 3;
export const TITLE_PACKS = 2;
export const RIVAL_PREMIUM = 1;
export const TRIAL_MAX_RATING = 70;
export const FREE_AGENT_GAP = 2;
// Keeps a first squad inside the bottom tier's range, so year one is a climb.
const DRAFT_MAX_RATING = 79;
const DRAFT_MIN_RATING = 68;
// A last place in the bottom tier is a warning; two in a row ends the run.
const SACKED_AFTER = 2;
const STAT_KEYS = ['aim', 'positioning', 'ability', 'mentality', 'synergy'];
const SKILL_KEYS = Object.keys(BOARD_SKILLS);
const ROUND_EDGE_PER_POINT = 0.04;
const YOU = 'you';

function hash(...parts) {
  let value = 2166136261;
  for (const char of parts.join('|')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

const rngFor = (state, ...tags) => mulberry32(hash(state.seed, ...tags));
const byId = cards => new Map(cards.map(card => [card.id, card]));

// ── the card as it stands today ─────────────────────────────────────────────

export function clubCard(state, card) {
  const developed = effectiveCard(card, state.dev[card.id]);
  const growth = developed.rating - card.rating;
  const training = state.training[card.id];
  // The board scores stats, so growth has to reach them to count in a match.
  const tired = Math.round(clubFatigueExtra(state.dev[card.id]));
  const stats = Object.fromEntries(STAT_KEYS.map(key => [key, Math.round(developed.stats[key] + growth + (training?.stats?.[key] ?? 0) - tired)]));
  return { ...developed, rating: developed.rating - tired, stats, learned: training?.skills ?? [] };
}

export function squadCards(state, cards) {
  const lookup = byId(cards);
  return state.squad.map(id => clubCard(state, lookup.get(id)));
}

/** Cards as the world sees them, with moved players at their new clubs. */
function worldCards(state, cards) {
  return cards.map(card => {
    const move = state.moved[card.id];
    const placed = move ? { ...card, org: move.org, org_name: move.name, org_logo: move.logo } : card;
    return clubCard(state, placed);
  });
}

function averageRating(roster) {
  return roster.reduce((sum, card) => sum + card.rating, 0) / roster.length;
}

// ── contracts ───────────────────────────────────────────────────────────────

/** Years left. A rival's clock is derived, so saves never store the world. */
export function contractYears(state, id) {
  return state.contracts[id] ?? CONTRACT_MAX - ((hash(state.seed, id) + state.year) % CONTRACT_MAX);
}

// ── draft ───────────────────────────────────────────────────────────────────

export function draftPack(seed, index, pickedIds, cards) {
  const pool = cards.filter(card => card.league !== 'icon' && card.rating >= DRAFT_MIN_RATING && card.rating <= DRAFT_MAX_RATING);
  const rng = mulberry32(hash(seed, 'draft', index));
  return samplePack(rng, pool, new Set(pickedIds), DRAFT_PACK_SIZE);
}

// ── league ──────────────────────────────────────────────────────────────────

function leagueRivals(state, cards) {
  const taken = new Set(state.squad);
  const world = worldCards(state, cards);
  const pool = tierPools(eligibleOrgs(world, taken), cards)[state.tier] ?? [];
  // Last year's clubs stay, so a rival you beat is there again next year.
  const kept = pool.filter(org => state.rivals?.[state.tier]?.includes(org.id));
  const rest = pool.filter(org => !kept.includes(org));
  const filled = [...kept, ...pickN(mulberry32(hash(state.seed, 'league', state.tier)), rest, LEAGUE_SIZE - 1 - kept.length)];
  return filled.map(org => ({ id: org.id, name: org.name, logo: org.logo, roster: org.roster.map(card => card.id) }));
}

/** Round robin: every club plays every other once, one round each week. */
function roundRobin(ids) {
  const order = [...ids];
  return Array.from({ length: order.length - 1 }, () => {
    const pairs = [];
    for (let i = 0; i < order.length / 2; i += 1) pairs.push([order[i], order[order.length - 1 - i]]);
    order.splice(1, 0, order.pop());
    return pairs;
  });
}

function startYear(state, cards) {
  const clubs = leagueRivals(state, cards);
  const rivals = { ...state.rivals, [state.tier]: clubs.map(club => club.id) };
  const ids = pickN(rngFor(state, 'fixtures', state.year), [YOU, ...clubs.map(club => club.id)], LEAGUE_SIZE);
  return {
    ...state,
    rivals,
    phase: 'league',
    week: 0,
    trainSlot: 1,
    clubs,
    fixtures: roundRobin(ids),
    table: Object.fromEntries(ids.map(id => [id, { w: 0, l: 0, rd: 0 }])),
    playoffs: null,
    results: [],
    last: null,
    review: null,
  };
}

export function newClub({ seed, name, picks, cards, crest, tone }) {
  const base = {
    v: 2,
    ...rewardDefaults(),
    seed,
    name,
    crest,
    tone,
    year: 1,
    tier: 0,
    squad: picks,
    contracts: Object.fromEntries(picks.map(id => [id, CONTRACT_MAX])),
    packs: 3,
    reputation: 0,
    dev: {},
    xp: {},
    training: {},
    moved: {},
    rivals: {},
    hand: [],
    titles: 0,
    lastPlaces: 0,
    history: [],
    seriesWon: 0,
    roundsWon: 0,
    yearsAtClub: {},
    signings: [],
  };
  return startYear(base, cards);
}

/** A save is usable only if every player and club it names still exists. */
export function isValidClub(state, cards) {
  if (!state || !Array.isArray(state.squad) || state.squad.length < STARTERS) return false;
  if (!Array.isArray(state.clubs) || !Array.isArray(state.fixtures) || !state.table || !state.contracts) return false;
  if (!['league', 'playoffs', 'review', 'over'].includes(state.phase)) return false;
  const known = new Set(cards.map(card => card.id));
  const ids = [...state.squad, ...state.clubs.flatMap(club => club.roster ?? [])];
  return ids.every(id => known.has(id)) && state.clubs.length === LEAGUE_SIZE - 1;
}

export function clubById(state, id) {
  return state.clubs.find(club => club.id === id);
}

/** One card by id from anywhere in the world, or undefined. */
export function findCard(state, cards, id) {
  return worldCards(state, cards).find(card => card.id === id);
}

export function clubRoster(state, club, cards) {
  const world = byId(worldCards(state, cards));
  return club.roster.map(id => world.get(id));
}

export function standings(state, cards) {
  const power = id => {
    if (id === YOU) return averageRating(squadCards(state, cards).slice(0, STARTERS));
    return averageRating(clubRoster(state, clubById(state, id), cards));
  };
  return Object.entries(state.table)
    .map(([id, row]) => ({ id, ...row, power: power(id) }))
    .sort((a, b) => b.w - a.w || b.rd - a.rd || b.power - a.power)
    .map((row, index) => ({ ...row, pos: index + 1, name: row.id === YOU ? state.name : clubById(state, row.id).name, you: row.id === YOU }));
}

/** Who you play next, or null when your year's matches are done. */
export function nextMatch(state) {
  if (state.phase === 'league') {
    const pair = state.fixtures[state.week].find(match => match.includes(YOU));
    return { id: pair[0] === YOU ? pair[1] : pair[0], bestOf: 3, stage: `Week ${state.week + 1}` };
  }
  if (state.phase !== 'playoffs') return null;
  const { semis, final } = state.playoffs;
  const semi = semis.find(match => match.ids.includes(YOU) && !match.winner);
  if (semi) return { id: semi.ids.find(id => id !== YOU), bestOf: 3, stage: 'Semifinal' };
  if (final?.ids.includes(YOU) && !final.winner) return { id: final.ids.find(id => id !== YOU), bestOf: 5, stage: 'Final' };
  return null;
}

// ── simulated series between rivals ─────────────────────────────────────────

function simSeries(rng, powerA, powerB, bestOf) {
  const need = Math.ceil(bestOf / 2);
  const chance = Math.max(0.15, Math.min(0.85, 0.5 + (powerA - powerB) * ROUND_EDGE_PER_POINT));
  let a = 0;
  let b = 0;
  while (a < need && b < need) {
    if (rng() < chance) a += 1;
    else b += 1;
  }
  return { a, b };
}

function clubPower(state, id, cards) {
  if (id === YOU) return averageRating(squadCards(state, cards).slice(0, STARTERS));
  return averageRating(clubRoster(state, clubById(state, id), cards));
}

function recordResult(table, a, b, roundsA, roundsB) {
  const next = { ...table };
  const won = roundsA > roundsB;
  const rd = roundsA - roundsB;
  next[a] = { w: next[a].w + (won ? 1 : 0), l: next[a].l + (won ? 0 : 1), rd: next[a].rd + rd };
  next[b] = { w: next[b].w + (won ? 0 : 1), l: next[b].l + (won ? 1 : 0), rd: next[b].rd - rd };
  return next;
}

// ── after a series you played ───────────────────────────────────────────────

function growSquad(state, results, cards) {
  const lookup = byId(cards);
  const lanes = results.reduce((sum, round) => sum + round.a, 0);
  const mvp = mostValuable(results);
  const dev = { ...state.dev };
  const xp = { ...state.xp };
  const growth = [];
  state.squad.forEach((id, index) => {
    const card = lookup.get(id);
    const started = index < STARTERS;
    const current = dev[id] ?? emptyDev(card);
    let entry = tickFatigue(current, { started });
    const prospect = careerStage(state.seed, card, entry) === 'prospect';
    const isMvp = started && card.id === mvp;
    // The bench learns from watching: a share of what a starter earns, prospects twice as fast.
    const base = 10 + lanes * 2 + (isMvp ? 10 : 0);
    const gain = Math.round(base * (started ? 1 : BENCH_XP) * (prospect ? 2 : 1));
    const total = (xp[id] ?? 0) + gain;
    const points = Math.floor(total / XP_PER_POINT);
    if (points) entry = { ...entry, d: (entry.d ?? 0) + points };
    xp[id] = total % XP_PER_POINT;
    growth.push({ id, gain, pct: xp[id], mvp: isMvp, bench: !started });
    dev[id] = entry;
  });
  return { dev, xp, growth, mvp };
}

function mostValuable(results) {
  const counts = {};
  for (const round of results) {
    const id = round.mvp?.id ?? round.mvp;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// A win offers three chips. The deeper the stage, the better the best of them.
const CHIP_FLOOR = { Semifinal: 'uncommon', Final: 'rare' };
const TIER_ORDER = ['common', 'uncommon', 'rare'];

export function rollChipOffer(state, stage, attempt = 0) {
  const floor = CHIP_FLOOR[stage] ?? 'common';
  const rng = rngFor(state, 'chips', state.year, state.week, stage, attempt);
  const weighted = [
    ...TACTIC_LIST.filter(tactic => tactic.tier === 'common'),
    ...TACTIC_LIST.filter(tactic => tactic.tier === 'common'),
    ...TACTIC_LIST.filter(tactic => tactic.tier === 'uncommon'),
    ...TACTIC_LIST.filter(tactic => tactic.tier === 'rare'),
  ];
  const keys = [];
  while (keys.length < 3) {
    const tactic = weighted[Math.floor(rng() * weighted.length)];
    if (!keys.includes(tactic.key)) keys.push(tactic.key);
  }
  const reaches = key => TIER_ORDER.indexOf(TACTIC_LIST.find(tactic => tactic.key === key).tier) >= TIER_ORDER.indexOf(floor);
  if (!keys.some(reaches)) {
    const pool = TACTIC_LIST.filter(tactic => tactic.tier === floor && !keys.includes(tactic.key));
    keys[2] = pool[Math.floor(rng() * pool.length)].key;
  }
  return { stage, floor, attempt, options: keys.map(key => createTacticInstance(rng, key, 'owned')) };
}

function afterSeries(state, { won, results, hand }, cards, opponentId, stage) {
  const roundsWon = results.filter(round => round.winA).length;
  const { dev, xp, growth, mvp } = growSquad(state, results, cards);
  return {
    ...state,
    dev,
    xp,
    hand,
    chipOffer: won ? rollChipOffer(state, stage) : state.chipOffer,
    packs: state.packs + (won ? 1 : 0),
    seriesWon: state.seriesWon + (won ? 1 : 0),
    roundsWon: state.roundsWon + roundsWon,
    results: [...state.results, { opponent: opponentId, won }],
    last: {
      won,
      opponent: opponentId,
      stage,
      rounds: results.map(({ map, a, b, winA }) => ({ map, a, b, winA })),
      growth,
      mvp,
      packs: won ? 1 : 0,
    },
  };
}

function startPlayoffs(state, cards) {
  const seeds = standings(state, cards).slice(0, PLAYOFF_SPOTS).map(row => row.id);
  return {
    ...state,
    phase: 'playoffs',
    playoffs: {
      seeds,
      semis: [{ ids: [seeds[0], seeds[3]], winner: null }, { ids: [seeds[1], seeds[2]], winner: null }],
      final: null,
    },
  };
}

function simPlayoffs(state, cards) {
  const { semis, final } = state.playoffs;
  const play = (match, bestOf, tag) => {
    if (match.winner || match.ids.includes(YOU)) return match;
    const [a, b] = match.ids;
    const score = simSeries(rngFor(state, 'playoff', state.year, tag), clubPower(state, a, cards), clubPower(state, b, cards), bestOf);
    return { ...match, winner: score.a > score.b ? a : b };
  };
  const nextSemis = semis.map((match, index) => play(match, 3, `semi${index}`));
  let nextFinal = final;
  if (!nextFinal && nextSemis.every(match => match.winner)) {
    nextFinal = { ids: nextSemis.map(match => match.winner), winner: null };
  }
  if (nextFinal) nextFinal = play(nextFinal, 5, 'final');
  return { ...state, playoffs: { ...state.playoffs, semis: nextSemis, final: nextFinal } };
}

function settleIfDone(state, cards) {
  const simmed = simPlayoffs(state, cards);
  return simmed.playoffs.final?.winner ? settleYear(simmed, cards) : simmed;
}

/** A clean sweep earns a second training session the next week. */
function nextSessions({ won, results }) {
  const sweep = won && results.length >= 2 && results.every(round => round.winA);
  return sweep ? TRAIN_SLOTS_MAX : 1;
}

/** Record the series you just played and move the year along. */
export function finishSeries(state, outcome, cards) {
  const match = nextMatch(state);
  if (!match) return state;
  const played = afterSeries(state, outcome, cards, match.id, match.stage);
  const roundsWon = outcome.results.filter(round => round.winA).length;
  const roundsLost = outcome.results.length - roundsWon;

  if (state.phase === 'league') {
    let table = recordResult(played.table, YOU, match.id, roundsWon, roundsLost);
    for (const [index, [a, b]] of state.fixtures[state.week].entries()) {
      if (a === YOU || b === YOU) continue;
      const score = simSeries(rngFor(state, 'week', state.year, state.week, index), clubPower(state, a, cards), clubPower(state, b, cards), 3);
      table = recordResult(table, a, b, score.a, score.b);
    }
    const week = state.week + 1;
    const next = { ...played, table, week, trainSlot: nextSessions(outcome) };
    if (week < WEEKS) return next;
    const playoffs = startPlayoffs(next, cards);
    return playoffs.playoffs.seeds.includes(YOU) ? simPlayoffs(playoffs, cards) : settleIfDone(playoffs, cards);
  }

  const winner = outcome.won ? YOU : match.id;
  const { semis, final } = played.playoffs;
  const nextPlayoffs = match.bestOf === 5
    ? { ...played.playoffs, final: { ...final, winner } }
    : { ...played.playoffs, semis: semis.map(item => (item.ids.includes(YOU) ? { ...item, winner } : item)) };
  return settleIfDone({ ...played, trainSlot: nextSessions(outcome), playoffs: nextPlayoffs }, cards);
}

// ── training ────────────────────────────────────────────────────────────────

/** This week's three choices for a player: a stat, a skill and rest. */
export function trainingOffer(state, card) {
  const today = hash(state.seed, card.id, state.year, state.week);
  const entry = state.training[card.id] ?? {};
  const stat = STAT_KEYS[today % STAT_KEYS.length];
  const owned = SKILL_KEYS.filter(key => card.learned?.includes(key) || card.specialties?.some?.(spec => spec.key === key));
  const open = SKILL_KEYS.filter(key => !owned.includes(key));
  const skill = entry.learning?.key ?? (entry.skills?.length ? null : open[today % Math.max(open.length, 1)] ?? null);
  return {
    stat,
    statCapped: (entry.stats?.[stat] ?? 0) >= STAT_CAP,
    skill,
    sessions: entry.learning?.sessions ?? 0,
    fatigue: state.dev[card.id]?.f ?? 0,
  };
}

/** Spend the week's slot. A skill takes three sessions; a stat lands at once. */
export function train(state, card, focus) {
  if (!state.trainSlot) return state;
  const offer = trainingOffer(state, card);
  const entry = { stats: {}, skills: [], ...state.training[card.id] };
  const done = next => ({ ...next, trainSlot: Math.max(0, state.trainSlot - 1) });
  if (focus === 'rest') {
    const dev = { ...state.dev[card.id], f: 0 };
    return done({ ...state, dev: { ...state.dev, [card.id]: dev } });
  }
  if (focus === 'stat') {
    if (offer.statCapped) return state;
    const stats = { ...entry.stats, [offer.stat]: (entry.stats[offer.stat] ?? 0) + STAT_STEP };
    return done({ ...state, training: { ...state.training, [card.id]: { ...entry, stats } } });
  }
  if (!offer.skill) return state;
  const sessions = offer.sessions + 1;
  const learned = sessions >= SKILL_SESSIONS;
  const updated = learned
    ? { ...entry, skills: [...entry.skills, offer.skill], learning: null }
    : { ...entry, learning: { key: offer.skill, sessions } };
  return done({ ...state, training: { ...state.training, [card.id]: updated } });
}

// ── year end ────────────────────────────────────────────────────────────────

function placementOf(state, cards) {
  const { semis, final } = state.playoffs;
  if (final.winner === YOU) return 1;
  if (final.ids.includes(YOU)) return 2;
  if (semis.some(match => match.ids.includes(YOU))) return 3;
  const pos = standings(state, cards).find(row => row.you).pos;
  return pos >= LEAGUE_SIZE ? 9 : 5;
}

function settleYear(state, cards) {
  const lookup = byId(cards);
  const placement = placementOf(state, cards);
  const table = standings(state, cards);
  const leaguePos = table.find(row => row.you).pos;
  const bottom = leaguePos === LEAGUE_SIZE;
  const lastPlaces = bottom && state.tier === 0 ? state.lastPlaces + 1 : 0;
  let movement = 'hold';
  if (placement <= 2 && state.tier < TIERS.length - 1) movement = 'promote';
  else if (bottom && state.tier > 0) movement = 'relegate';
  else if (lastPlaces >= SACKED_AFTER) movement = 'sacked';
  else if (lastPlaces) movement = 'warned';
  const before = squadCards(state, cards);

  const rng = rngFor(state, 'career', state.year);
  const dev = { ...state.dev };
  const yearsAtClub = { ...state.yearsAtClub };
  for (const id of state.squad) {
    yearsAtClub[id] = (yearsAtClub[id] ?? 0) + 1;
    const card = lookup.get(id);
    const { dev: updated } = tickCareerYear(rng, state.seed, card, dev[id] ?? emptyDev(card), {
      year: state.year,
      yearsAtOrg: yearsAtClub[id],
      rested: dev[id]?.idle ?? 0,
      cohesion: 4,
    });
    dev[id] = { ...updated, f: 0, idle: 0 };
  }
  const orgs = state.clubs.map(club => ({ roster: club.roster.map(id => lookup.get(id)) }));
  const worldDev = tickWorldYear(rng, state.seed, orgs, dev, { year: state.year });

  const contracts = { ...state.contracts };
  for (const id of state.squad) contracts[id] = Math.max(1, contracts[id] - 1);

  const titles = state.titles + (placement === 1 ? 1 : 0);
  const packsGained = YEAR_PACKS + (placement === 1 ? TITLE_PACKS : 0);
  // Playoffs pay gold, a title pays two, and every second title pays an icon.
  const goldGained = placement === 1 ? 2 : placement <= 3 ? 1 : 0;
  const iconsGained = placement === 1 && titles % TITLES_PER_ICON === 0 ? 1 : 0;
  const settled = {
    ...grantPacks(state, { silver: packsGained, gold: goldGained, icons: iconsGained }),
    dev: worldDev,
    contracts,
    yearsAtClub,
    titles,
    lastPlaces,
    history: [...(state.history ?? []), { year: state.year, tier: state.tier, leaguePos, placement, movement }],
    reputation: state.reputation + reputationDelta(state.tier, placement),
    phase: movement === 'sacked' ? 'over' : 'review',
  };
  const after = squadCards(settled, cards);
  return {
    ...settled,
    review: {
      movement,
      placement,
      leaguePos,
      packs: packsGained,
      gold: goldGained,
      icons: iconsGained,
      fromTier: state.tier,
      changes: after.map((card, index) => ({ id: card.id, rating: card.rating, delta: card.rating - before[index].rating })),
    },
  };
}

// ── transfer window ─────────────────────────────────────────────────────────

function trialists(state, cards, excluded = []) {
  const inLeague = new Set(state.clubs.flatMap(club => club.roster));
  const skip = new Set([...state.squad, ...excluded]);
  const order = card => hash(state.seed, state.year, 'trial', card.id) % 997;
  return worldCards(state, cards)
    .filter(card => card.league !== 'icon' && !skip.has(card.id) && !inLeague.has(card.id) && card.rating <= TRIAL_MAX_RATING)
    .sort((a, b) => order(a) - order(b));
}

/** What is on the table: your last-year players, rivals' and free agents. */
export function windowOffers(state, cards) {
  const squad = squadCards(state, cards);
  const limit = maxSignableRating(state.reputation, squad);
  const table = standings(state, cards).filter(row => !row.you);
  const rivals = state.clubs.flatMap(club => clubRoster(state, club, cards)
    .filter(card => contractYears(state, card.id) === 1)
    .map(card => ({ card, club, cost: signingCost(card) + RIVAL_PREMIUM, locked: card.rating > limit })))
    .sort((a, b) => b.card.rating - a.card.rating)
    .slice(0, 4);

  const inLeague = new Set(state.clubs.flatMap(club => club.roster));
  // Free agents sit just under your level. Real upgrades come from rivals or training.
  const freeCap = Math.floor(averageRating(squad)) - FREE_AGENT_GAP;
  const free = worldCards(state, cards)
    .filter(card => card.league !== 'icon' && !state.squad.includes(card.id) && !inLeague.has(card.id) && card.rating <= freeCap)
    .sort((a, b) => (hash(state.seed, state.year, a.id) % 40) - (hash(state.seed, state.year, b.id) % 40) || b.rating - a.rating)
    .slice(0, 3)
    .sort((a, b) => b.rating - a.rating)
    .map(card => ({ card, cost: signingCost(card), locked: false }));
  // Always one trialist for nothing, so no club can be left short of five.
  const [trialist] = trialists(state, cards, free.map(item => item.card.id));
  if (trialist) free.push({ card: trialist, cost: 0, locked: false, trial: true });

  const mine = squad.filter(card => state.contracts[card.id] === 1).map((card, index) => {
    const suitor = table[index % table.length];
    return {
      card,
      renew: signingCost(card),
      fee: releaseFee(card),
      suitor: suitor ? { id: suitor.id, name: suitor.name } : null,
    };
  });
  return { mine, rivals, free, limit };
}

/** Applies picks to the window for the running totals on screen. */
export function windowTotals(state, offers, { own = {}, buy = [], drop = [] }) {
  let packs = packValue(state);
  let squad = state.squad.length;
  const expiringIds = new Set(offers.mine.map(item => item.card.id));
  for (const item of offers.mine) {
    if (own[item.card.id] === 'keep') packs -= item.renew;
    if (own[item.card.id] === 'go') { packs += item.fee; squad -= 1; }
  }
  for (const id of drop) {
    if (state.squad.includes(id) && !expiringIds.has(id)) squad -= 1;
  }
  for (const item of [...offers.rivals, ...offers.free]) {
    if (buy.includes(item.card.id)) { packs -= item.cost; squad += 1; }
  }
  const undecided = offers.mine.filter(item => !own[item.card.id]).length;
  return {
    packs,
    squad,
    undecided,
    trialists: Math.max(0, STARTERS - squad),
    canClose: undecided === 0 && packs >= 0 && squad <= squadMax(state),
  };
}

export function closeWindow(state, decisions, cards) {
  if (state.phase !== 'review') return state;
  const offers = windowOffers(state, cards);
  const totals = windowTotals(state, offers, decisions);
  if (!totals.canClose) return state;
  const { own = {}, buy = [], drop = [] } = decisions;
  const contracts = { ...state.contracts };
  const moved = { ...state.moved };
  const leaving = new Set();
  const expiringIds = new Set(offers.mine.map(item => item.card.id));
  for (const item of offers.mine) {
    if (own[item.card.id] === 'keep') contracts[item.card.id] = CONTRACT_MAX;
    if (own[item.card.id] === 'go') {
      leaving.add(item.card.id);
      delete contracts[item.card.id];
      const club = item.suitor && clubById(state, item.suitor.id);
      if (club) moved[item.card.id] = { org: club.id, name: club.name, logo: club.logo };
    }
  }
  for (const id of drop) {
    if (state.squad.includes(id) && !expiringIds.has(id)) {
      leaving.add(id);
      delete contracts[id];
      delete moved[id];
    }
  }
  const signed = [...offers.rivals, ...offers.free].filter(item => buy.includes(item.card.id));
  for (const item of signed) {
    contracts[item.card.id] = CONTRACT_MAX;
    delete moved[item.card.id];
  }
  // If a signed player was swapped onto a released slot, put them into that slot so lineup order stays intact.
  const remaining = state.squad.filter(id => !leaving.has(id));
  const squad = [...remaining, ...signed.map(item => item.card.id)];
  // Short of five with nothing to spend: trialists fill the gap for free.
  const filling = trialists(state, cards, squad).slice(0, Math.max(0, STARTERS - squad.length)).map(card => card.id);
  for (const id of filling) contracts[id] = 1;
  squad.push(...filling);
  const signings = withSignings(state, signed.map(item => item.card.id), 'window');
  return startYear({ ...settlePacks(state, totals.packs), squad, contracts, moved, signings, year: state.year + 1, tier: nextTier(state) }, cards);
}

function nextTier(state) {
  const { movement, fromTier } = state.review;
  if (movement === 'promote') return fromTier + 1;
  if (movement === 'relegate') return fromTier - 1;
  return fromTier;
}

// ── squad and score ─────────────────────────────────────────────────────────

/** Swap two squad positions. The first five start and the first is IGL. */
export function moveSquad(state, from, to) {
  const squad = [...state.squad];
  [squad[from], squad[to]] = [squad[to], squad[from]];
  return { ...state, squad };
}

export function clubScore(state) {
  return state.titles * 300 + state.seriesWon * 100 + state.roundsWon * 20;
}
