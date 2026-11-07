// Club mode: a squad you keep, in a league, year after year.
//
// A year is five league weeks, top-four playoffs, a review and one transfer
// window. The state is plain JSON of ids, so a save is just the state, and every
// roll comes from a seed plus a tag, so no rng state needs storing.
//
// One contract rule carries the whole market: every player, yours or a rival's,
// has one to three years left, and anyone on their last year can move. Nothing
// in the window is a dice roll. A rival takes your player only if you let them.

import { effectiveCard, tickFatigue } from '../../../shared/src/engine/endless/career.js';
import { STAT_KEYS } from '../../../shared/src/data/statFields.js';
import { eligibleOrgs, mulberry32, pickN, samplePack } from '../../../shared/src/engine/perfectRun.js';
import { chipTier, winsNeeded } from '../board/board.js';
import { TIERS, reputationDelta, tierPools } from '../endless/ladder.js';
import { releaseFee, signingCost } from '../endless/market.js';
import { maxSignableRating } from '../endless/stature.js';
import { createTacticInstance, TACTIC_LIST } from '../endless/seriesCards.js';
import {
  BENCH_XP, GOLD_RATING, INTERNATIONAL_TIER, TITLES_PER_ICON, clubFatigueExtra, grantPacks, packValue, rewardDefaults, withNews,
  settlePacks, squadMax,
} from './economy.js';
import { bankTapes, rollFlawlessTape, rollTapes, TRAINING_SKILLS } from './tapes.js';

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
export const YEAR_PACKS = 6;
export const TITLE_PACKS = 2;
export const RIVAL_PREMIUM = 1;
export const TRIAL_MAX_RATING = 70;
export const FREE_AGENT_GAP = 2;
// Keeps a first squad inside the bottom tier's range, so year one is a climb.
const DRAFT_MAX_RATING = 79;
const DRAFT_MIN_RATING = 68;
// A last place in the bottom tier is a warning; two in a row ends the run.
const SACKED_AFTER = 2;
const ROUND_EDGE_PER_POINT = 0.04;
const YOU = 'you';

// ── Evo Chips Catalog ───────────────────────────────────────────────────────

// Apex evos grow every stat a little: their board skill carries them, and big stat
// jumps inflated ratings without changing results (the sim put stats at 0 to 2 points).
const APEX_L1 = { aim: 1, positioning: 1, ability: 1, mentality: 1, synergy: 1 };
const APEX_L2 = { aim: 2, positioning: 2, ability: 2, mentality: 2, synergy: 2 };

export const EVO_CHIPS = {
  glacier: {
    key: 'glacier',
    name: 'Glacier Shield',
    tier: 'common',
    theme: 'glacier',
    badge: 'ANC',
    color: '#4ade80',
    headline: 'ANC',
    requirements: { maxRating: 80, roles: ['Sentinel', 'Controller'] },
    level1: { type: 'win', count: 1, stats: { positioning: 1, mentality: 1 }, label: 'Win 1 match with player starting' },
    level2: { type: 'win', count: 2, stats: { positioning: 1, mentality: 1 }, skill: 'anchor', label: 'Win 2 matches with player in starting 5' },
  },
  first_strike: {
    key: 'first_strike',
    name: 'First Strike',
    tier: 'common',
    theme: 'ember',
    badge: 'FBD',
    color: '#f87171',
    headline: 'FBD',
    requirements: { maxRating: 82, roles: ['Duelist', 'Initiator'] },
    level1: { type: 'play', count: 1, stats: { aim: 1, ability: 1 }, label: 'Play 1 match with player starting' },
    level2: { type: 'win', count: 2, stats: { aim: 1, ability: 1 }, skill: 'first_blood', label: 'Win 2 matches with player in starting 5' },
  },
  clutch_factor: {
    key: 'clutch_factor',
    name: 'Clutch Factor',
    tier: 'rare',
    theme: 'amethyst',
    badge: 'CLT',
    color: '#c084fc',
    headline: 'CLT',
    requirements: { maxRating: 84, roles: null },
    level1: { type: 'win', count: 1, stats: { aim: 2, mentality: 2 }, label: 'Win 1 match with player starting' },
    level2: { type: 'mvp', count: 2, stats: { aim: 2, mentality: 2 }, skill: 'clutch', label: 'Win 2 matches where player is MVP' },
  },
  hivemind: {
    key: 'hivemind',
    name: 'Hivemind',
    tier: 'rare',
    theme: 'cyber',
    badge: 'LNK',
    color: '#38bdf8',
    headline: 'LNK',
    requirements: { maxRating: 85, roles: null },
    level1: { type: 'play', count: 2, stats: { synergy: 2, ability: 2 }, label: 'Play 2 matches with player starting' },
    level2: { type: 'win', count: 2, stats: { synergy: 2, ability: 2 }, skill: 'synergy_link', label: 'Win 2 matches with player in starting 5' },
  },
  apex_predator: {
    key: 'apex_predator',
    name: 'Apex Predator',
    tier: 'apex',
    theme: 'apex',
    badge: 'OVD',
    color: '#ff003c',
    headline: 'OVD',
    requirements: { maxRating: 93, roles: null },
    level1: { type: 'play', count: 2, stats: APEX_L1, label: 'Play 2 matches with player starting' },
    level2: { type: 'mvp', count: 3, stats: APEX_L2, skill: 'overdrive', label: 'Win 3 matches where player is MVP' },
  },
  bastion: {
    key: 'bastion',
    name: 'Bastion Wall',
    tier: 'common',
    theme: 'iron',
    badge: 'ICD',
    color: '#f59e0b',
    headline: 'ICD',
    requirements: { maxRating: 81, roles: ['Sentinel', 'Initiator'] },
    level1: { type: 'play', count: 1, stats: { positioning: 1, ability: 1 }, label: 'Play 1 match with player starting' },
    level2: { type: 'win', count: 2, stats: { positioning: 1, mentality: 1 }, skill: 'ironclad', label: 'Win 2 matches with player in starting 5' },
  },
  phantom_drift: {
    key: 'phantom_drift',
    name: 'Phantom Drift',
    tier: 'common',
    theme: 'phantom',
    badge: 'LRK',
    color: '#2dd4bf',
    headline: 'LRK',
    requirements: { maxRating: 81, roles: ['Controller', 'Duelist'] },
    level1: { type: 'play', count: 1, stats: { aim: 1, positioning: 1 }, label: 'Play 1 match with player starting' },
    level2: { type: 'win', count: 2, stats: { aim: 1, ability: 1 }, skill: 'lurk', label: 'Win 2 matches with player in starting 5' },
  },
  hyperdrive: {
    key: 'hyperdrive',
    name: 'Hyperdrive',
    tier: 'rare',
    theme: 'neon',
    badge: 'VEL',
    color: '#84cc16',
    headline: 'VEL',
    requirements: { maxRating: 85, roles: ['Duelist', 'Initiator'] },
    level1: { type: 'win', count: 1, stats: { aim: 2, mentality: 2 }, label: 'Win 1 match with player starting' },
    level2: { type: 'mvp', count: 2, stats: { aim: 2, synergy: 2 }, skill: 'velocity', label: 'Win 2 matches where player is MVP' },
  },
  solstice: {
    key: 'solstice',
    name: 'Solstice Flame',
    tier: 'rare',
    theme: 'solar',
    badge: 'CMB',
    color: '#fb923c',
    headline: 'CMB',
    requirements: { maxRating: 86, roles: null },
    level1: { type: 'win', count: 1, stats: { ability: 2, mentality: 2 }, label: 'Win 1 match with player starting' },
    level2: { type: 'mvp', count: 2, stats: { aim: 2, synergy: 2 }, skill: 'combustion', label: 'Win 2 matches where player is MVP' },
  },
  void_walker: {
    key: 'void_walker',
    name: 'Void Walker',
    tier: 'rare',
    theme: 'abyss',
    badge: 'PHS',
    color: '#a855f7',
    headline: 'PHS',
    requirements: { maxRating: 86, roles: null },
    level1: { type: 'play', count: 2, stats: { positioning: 2, mentality: 2 }, label: 'Play 2 matches with player starting' },
    level2: { type: 'win', count: 2, stats: { positioning: 2, ability: 2 }, skill: 'phase', label: 'Win 2 matches with player in starting 5' },
  },
  chronos: {
    key: 'chronos',
    name: 'Chronos Dial',
    tier: 'apex',
    theme: 'chrono',
    badge: 'TRP',
    color: '#eab308',
    headline: 'TRP',
    requirements: { maxRating: 93, roles: null },
    level1: { type: 'play', count: 2, stats: APEX_L1, label: 'Play 2 matches with player starting' },
    level2: { type: 'mvp', count: 3, stats: APEX_L2, skill: 'timewarp', label: 'Win 3 matches where player is MVP' },
  },
  tempest: {
    key: 'tempest',
    name: 'Tempest Surge',
    tier: 'rare',
    theme: 'storm',
    badge: 'SRG',
    color: '#38bdf8',
    headline: 'SRG',
    requirements: { maxRating: 87, roles: null },
    level1: { type: 'play', count: 2, stats: { aim: 2, synergy: 2 }, label: 'Play 2 matches with player starting' },
    level2: { type: 'mvp', count: 2, stats: { aim: 2, positioning: 2 }, skill: 'surge', label: 'Win 2 matches where player is MVP' },
  },
  valkyrie: {
    key: 'valkyrie',
    name: 'Valkyrie Ascent',
    tier: 'apex',
    theme: 'valkyrie',
    badge: 'ASC',
    color: '#fb7185',
    headline: 'ASC',
    requirements: { maxRating: 93, roles: null },
    level1: { type: 'play', count: 2, stats: APEX_L1, label: 'Play 2 matches with player starting' },
    level2: { type: 'mvp', count: 3, stats: APEX_L2, skill: 'ascendance', label: 'Win 3 matches where player is MVP' },
  },
  sovereign: {
    key: 'sovereign',
    name: 'Sovereign Crown',
    tier: 'apex',
    theme: 'sovereign',
    badge: 'DMN',
    color: '#d946ef',
    headline: 'DMN',
    requirements: { maxRating: 93, roles: null },
    level1: { type: 'play', count: 2, stats: APEX_L1, label: 'Play 2 matches with player starting' },
    level2: { type: 'mvp', count: 3, stats: APEX_L2, skill: 'dominion', label: 'Win 3 matches where player is MVP' },
  },
  singularity: {
    key: 'singularity',
    name: 'Singularity Core',
    tier: 'apex',
    theme: 'singularity',
    badge: 'BKH',
    color: '#06b6d4',
    headline: 'BKH',
    requirements: { maxRating: 92, roles: null },
    level1: { type: 'play', count: 2, stats: APEX_L1, label: 'Play 2 matches with player starting' },
    level2: { type: 'mvp', count: 3, stats: APEX_L2, skill: 'black_hole', label: 'Win 3 matches where player is MVP' },
  },
};

export const EVO_KEYS = Object.keys(EVO_CHIPS);

export function hashTag(...parts) {
  let value = 2166136261;
  for (const char of parts.join('|')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

const hash = hashTag;

const rngFor = (state, ...tags) => mulberry32(hash(state.seed, ...tags));
const byId = cards => new Map(cards.map(card => [card.id, card]));

// ── the card as it stands today ─────────────────────────────────────────────

export function clubCard(state, card) {
  if (!card) return card;
  const developed = effectiveCard(card, state.dev[card.id]);
  const growth = developed.rating - card.rating;
  const training = state.training[card.id];
  // The board scores stats, so growth has to reach them to count in a match.
  const tired = Math.round(clubFatigueExtra(state.dev[card.id]));
  const stats = Object.fromEntries(STAT_KEYS.map(key => [key, Math.round(developed.stats[key] + growth + (training?.stats?.[key] ?? 0) - tired)]));
  const trainingOvr = Math.round(Object.values(training?.stats ?? {}).reduce((a, b) => a + b, 0) / STAT_KEYS.length);
  const developmentRating = (tired ? effectiveCard(card, { ...state.dev[card.id], f: 0 }).rating : developed.rating) + trainingOvr;
  const regularTier = card.league !== 'icon' && ['bronze', 'silver', 'gold'].includes(card.tier);
  const tier = regularTier ? (developmentRating >= GOLD_RATING ? 'gold' : developmentRating >= 70 ? 'silver' : 'bronze') : card.tier;
  return {
    ...developed,
    rating: developed.rating - tired + trainingOvr,
    developmentRating,
    tier,
    palette: tier === card.tier ? card.palette : tier,
    stats,
    learned: training?.skills ?? [],
    evoTheme: training?.evoTheme ?? null,
    evoLevel: training?.evoLevel ?? null,
    evoBadge: training?.evoBadge ?? null,
    evolutions: training?.evolutions ?? [],
  };
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
    news: [],
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
  const need = winsNeeded(bestOf);
  const chance = Math.max(0.15, Math.min(0.85, 0.5 + (powerA - powerB) * ROUND_EDGE_PER_POINT));
  let a = 0;
  let b = 0;
  while (a < need && b < need) {
    if (rng() < chance) a += 1;
    else b += 1;
  }
  return { a, b };
}

export function clubPower(state, id, cards) {
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

export function xpPerPoint(rating) {
  if (rating < 75) return 150;
  if (rating < 82) return 250;
  return 400;
}

export function evoStatGain(cardRating, maxRating, desiredStats) {
  if (!maxRating || cardRating < maxRating) {
    if (!maxRating) return { ...desiredStats };
    const statKeys = Object.keys(desiredStats);
    const totalDesired = Object.values(desiredStats).reduce((a, b) => a + b, 0);
    const maxStatPoints = Math.max(0, Math.floor((maxRating - cardRating) * 5));
    if (totalDesired <= maxStatPoints) return { ...desiredStats };
    if (maxStatPoints === 0) return Object.fromEntries(statKeys.map(k => [k, 0]));
    let remaining = maxStatPoints;
    const result = {};
    for (const [k, v] of Object.entries(desiredStats)) {
      const take = Math.min(v, remaining);
      result[k] = take;
      remaining -= take;
    }
    return result;
  }
  return Object.fromEntries(Object.keys(desiredStats).map(k => [k, 0]));
}

export function packEarnedFromSeries(state, { won, results }, stage) {
  if (!won) return false;
  const sweep = results.length > 0 && results.every(round => round.winA);
  if (sweep) return true;
  if (state.phase === 'playoffs' || stage === 'Semifinal' || stage === 'Final') return true;
  if (state.phase === 'league' && (state.week === 4 || state.week === 8)) return true;
  return false;
}

function growSquad(state, results, cards) {
  const lookup = byId(cards);
  const lanes = results.reduce((sum, round) => sum + round.a, 0);
  const flawlessRounds = results.filter(round => round.a === 3).length;
  const mvp = mostValuable(results);
  const dev = { ...state.dev };
  const xp = { ...state.xp };
  const growth = [];
  state.squad.forEach((id, index) => {
    const card = lookup.get(id);
    const started = index < STARTERS;
    const current = dev[id] ?? {};
    let entry = tickFatigue(current, { started });
    const isMvp = started && card.id === mvp;
    // The bench learns from watching: a share of what a starter earns.
    const base = 10 + lanes * 2 + (isMvp ? 10 : 0) + flawlessRounds * 5;
    const gain = Math.round(base * (started ? 1 : BENCH_XP));
    const total = (xp[id] ?? 0) + gain;
    const currentCard = clubCard(state, card);
    const targetXp = xpPerPoint(currentCard.rating);
    const points = Math.floor(total / targetXp);
    if (points) entry = { ...entry, d: (entry.d ?? 0) + points };
    xp[id] = total % targetXp;
    growth.push({ id, gain, pct: xp[id], targetXp, mvp: isMvp, bench: !started });
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

function rollTactic(state, stage) {
  const rng = rngFor(state, 'tactic-loot', state.year, state.week, stage);
  const floor = TIER_ORDER.indexOf(CHIP_FLOOR[stage] ?? 'common');
  const pool = TACTIC_LIST.flatMap(tactic => {
    const tier = TIER_ORDER.indexOf(chipTier(tactic.key));
    if (tier < floor) return [];
    return tier === 0 ? [tactic.key, tactic.key] : [tactic.key];
  });
  return createTacticInstance(rng, pool[Math.floor(rng() * pool.length)]);
}

export function rollSeasonEvo(rng, champion, tier) {
  const roll = rng();
  const apexChance = champion && tier === INTERNATIONAL_TIER ? 0.05 : 0;
  const regularChance = champion ? 0.30 : 0.25;
  if (roll < apexChance) {
    const apexPool = EVO_KEYS.filter(key => EVO_CHIPS[key].tier === 'apex');
    return apexPool[Math.floor(rng() * apexPool.length)];
  }
  if (roll >= apexChance + regularChance) return null;
  const pool = EVO_KEYS.filter(key => EVO_CHIPS[key].tier === (champion ? 'rare' : 'common'));
  return pool[Math.floor(rng() * pool.length)];
}

export function rollChipOffer(state, stage, attempt = 0) {
  const floor = CHIP_FLOOR[stage] ?? 'common';
  const rng = rngFor(state, 'chips', state.year, state.week, stage, attempt);
  const of = tier => TACTIC_LIST.filter(tactic => chipTier(tactic.key) === tier);
  const weighted = [...of('common'), ...of('common'), ...of('uncommon'), ...of('rare')];
  const keys = [];
  while (keys.length < 3) {
    const tactic = weighted[Math.floor(rng() * weighted.length)];
    if (!keys.includes(tactic.key)) keys.push(tactic.key);
  }
  const reaches = key => TIER_ORDER.indexOf(chipTier(key)) >= TIER_ORDER.indexOf(floor);
  if (!keys.some(reaches)) {
    const pool = of(floor).filter(tactic => !keys.includes(tactic.key));
    keys[2] = pool[Math.floor(rng() * pool.length)].key;
  }
  const options = keys.map(key => createTacticInstance(rng, key, 'owned'));

  // Rare chance (~28%) to replace a non-floor slot with an Evo Chip
  const evoRoll = rng();
  if (evoRoll < 0.28) {
    const evoPool = stage === 'Final' || stage === 'Semifinal'
      ? EVO_KEYS.filter(k => EVO_CHIPS[k].tier !== 'common')
      : EVO_KEYS.filter(k => EVO_CHIPS[k].tier !== 'apex');
    const chosenEvoKey = evoPool[Math.floor(rng() * evoPool.length)];
    const evoDef = EVO_CHIPS[chosenEvoKey];

    // Pick a slot that doesn't compromise the guaranteed floor
    const meetsFloor = options.map((opt, i) => (reaches(opt.key) ? i : -1)).filter(i => i !== -1);
    const candidateSlots = [0, 1, 2].filter(i => !meetsFloor.includes(i) || meetsFloor.length > 1);
    const replaceSlot = candidateSlots[0] ?? 0;

    options[replaceSlot] = {
      uid: `evo_${chosenEvoKey}_${state.year}_${state.week}_${attempt}`,
      kind: 'evo',
      key: chosenEvoKey,
      name: evoDef.name,
      tier: evoDef.tier,
      theme: evoDef.theme,
      badge: evoDef.badge,
      color: evoDef.color,
      evo: true,
    };
  }

  return { stage, floor, attempt, options };
}

function processActiveEvo(state, { won, mvp, results }, cards) {
  if (!state.activeEvo) return { activeEvo: null, training: state.training, evoProgress: null };
  const { cardId, evoKey } = state.activeEvo;
  const evo = EVO_CHIPS[evoKey];
  if (!evo) return { activeEvo: null, training: state.training, evoProgress: null };

  const playedIds = new Set(results.flatMap(round => round.squad ?? []));
  const started = playedIds.has(cardId) || results.length > 0;
  const isMvp = (mvp === cardId);

  let activeEvo = { ...state.activeEvo };
  let training = { ...state.training };
  let cardTraining = { stats: {}, skills: [], ...(training[cardId] ?? {}) };
  let evoProgress = null;

  if (started) {
    const rawCard = cards?.find(c => c.id === cardId) ?? { id: cardId, rating: 75 };
    const currentCard = clubCard(state, rawCard);

    if (!activeEvo.l1Done) {
      const req = evo.level1;
      const countMatch = (req.type === 'play') || (req.type === 'win' && won) || (req.type === 'mvp' && won && isMvp);
      const l1Progress = (activeEvo.l1Progress ?? 0) + (countMatch ? 1 : 0);
      const l1Done = l1Progress >= req.count;
      activeEvo = { ...activeEvo, l1Progress, progress: l1Progress, l1Done, level: l1Done ? 2 : 1 };

      if (l1Done) {
        const stats = { ...cardTraining.stats };
        const gainedStats = evoStatGain(currentCard.rating, evo.requirements?.maxRating, req.stats);
        for (const [sKey, sVal] of Object.entries(gainedStats)) {
          stats[sKey] = (stats[sKey] ?? 0) + sVal;
        }
        cardTraining = {
          ...cardTraining,
          stats,
          evoTheme: evo.theme,
          evoLevel: 1,
        };
        evoProgress = { cardId, evoKey, level: 1, completed: true, name: evo.name, gainedStats };
      } else {
        evoProgress = { cardId, evoKey, level: 1, completed: false, progress: l1Progress, total: req.count, name: evo.name };
      }
    } else if (!activeEvo.l2Done) {
      const req = evo.level2;
      const countMatch = (req.type === 'play') || (req.type === 'win' && won) || (req.type === 'mvp' && won && isMvp);
      const l2Progress = (activeEvo.l2Progress ?? 0) + (countMatch ? 1 : 0);
      const l2Done = l2Progress >= req.count;
      activeEvo = { ...activeEvo, l2Progress, progress: l2Progress, l2Done };

      if (l2Done) {
        const stats = { ...cardTraining.stats };
        const gainedStats = evoStatGain(currentCard.rating, evo.requirements?.maxRating, req.stats);
        for (const [sKey, sVal] of Object.entries(gainedStats)) {
          stats[sKey] = (stats[sKey] ?? 0) + sVal;
        }
        const skills = [...new Set([...(cardTraining.skills ?? []), req.skill])];
        const evolutions = [...(cardTraining.evolutions ?? []), evoKey];
        cardTraining = {
          ...cardTraining,
          stats,
          skills,
          evoTheme: evo.theme,
          evoLevel: 2,
          evoBadge: evo.badge,
          evolutions,
          activeEvoKey: null,
        };
        evoProgress = { cardId, evoKey, level: 2, completed: true, name: evo.name, skill: req.skill, gainedStats };
        activeEvo = null; // Evolution fully mastered!
      } else {
        evoProgress = { cardId, evoKey, level: 2, completed: false, progress: l2Progress, total: req.count, name: evo.name };
      }
    }
  }

  training[cardId] = cardTraining;
  return { activeEvo, training, evoProgress };
}

function afterSeries(state, { won, results, hand }, cards, opponentId, stage) {
  const roundsWon = results.filter(round => round.winA).length;
  const flawlessRounds = results.filter(round => round.a === 3).length;
  const flawlessTapes = Array.from(
    { length: flawlessRounds },
    (_, i) => rollFlawlessTape(rngFor(state, 'flawless-tape', state.year, state.week, stage, i)),
  );
  const { dev, xp, growth, mvp } = growSquad(state, results, cards);
  const { activeEvo, training, evoProgress } = processActiveEvo({ ...state, dev }, { won, mvp, results }, cards);
  const tapes = rollTapes(rngFor(state, 'tape-loot', state.year, state.week, stage), won);
  const allTapes = [...tapes, ...flawlessTapes];
  const tactic = won ? rollTactic(state, stage) : null;
  const packWon = packEarnedFromSeries(state, { won, results }, stage);
  // Board refills are temporary. Only chips equipped from the club can carry over.
  const equipped = new Set((state.hand ?? []).map(chip => chip.uid));
  const surviving = (hand ?? state.hand ?? []).filter(chip => equipped.has(chip.uid));
  const developed = { ...state, dev, training };
  const changes = growth.map(row => {
    const card = cards.find(item => item.id === row.id);
    const before = clubCard(state, card);
    const after = clubCard(developed, card);
    return { ...row, ovrGain: after.developmentRating - before.developmentRating, tier: before.tier === after.tier ? null : after.tier };
  });
  return {
    ...state,
    dev,
    xp,
    hand: surviving,
    tacticReserve: tactic ? [...(state.tacticReserve ?? []), tactic] : state.tacticReserve ?? [],
    trainingTapes: bankTapes(state.trainingTapes, allTapes),
    training,
    activeEvo,
    packs: state.packs + (packWon ? 1 : 0),
    seriesWon: state.seriesWon + (won ? 1 : 0),
    roundsWon: state.roundsWon + roundsWon,
    results: [...state.results, { opponent: opponentId, won }],
    last: {
      won,
      opponent: opponentId,
      stage,
      rounds: results.map(({ map, a, b, winA }) => ({ map, a, b, winA })),
      growth: changes,
      mvp,
      evoProgress,
      packs: packWon ? 1 : 0,
      tapes: allTapes,
      flawlessRounds,
      flawlessTapes,
      tactic,
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
    const next = { ...played, table, week };
    if (week < WEEKS) return next;
    const playoffs = startPlayoffs(next, cards);
    return playoffs.playoffs.seeds.includes(YOU) ? simPlayoffs(playoffs, cards) : settleIfDone(playoffs, cards);
  }

  const winner = outcome.won ? YOU : match.id;
  const { semis, final } = played.playoffs;
  const nextPlayoffs = match.bestOf === 5
    ? { ...played.playoffs, final: { ...final, winner } }
    : { ...played.playoffs, semis: semis.map(item => (item.ids.includes(YOU) ? { ...item, winner } : item)) };
  return settleIfDone({ ...played, playoffs: nextPlayoffs }, cards);
}

// ── training ────────────────────────────────────────────────────────────────

/** Preview a tape's target. Generic skill tapes use the player's current skill offer. */
export function trainingOffer(state, card, target = null) {
  const today = hash(state.seed, card.id, state.year, state.week);
  const entry = state.training[card.id] ?? {};
  const stat = STAT_KEYS.includes(target) ? target : STAT_KEYS[today % STAT_KEYS.length];
  const open = TRAINING_SKILLS.filter(key => !card.learned?.includes(key)
    && !card.specialties?.some(spec => (spec.key ?? spec) === key));
  const canLearn = Boolean(entry.learning?.key) || !entry.skills?.length;
  const skill = !canLearn ? null : TRAINING_SKILLS.includes(target)
    ? (open.includes(target) && (!entry.learning || entry.learning.key === target) ? target : null)
    : entry.learning?.key ?? open[today % Math.max(open.length, 1)] ?? null;
  return {
    stat,
    statCapped: (entry.stats?.[stat] ?? 0) >= STAT_CAP,
    skill,
    sessions: entry.learning?.sessions ?? 0,
  };
}

export function isEligibleForEvo(card, evoKey) {
  const evo = EVO_CHIPS[evoKey];
  if (!evo || !card) return { eligible: false, reason: 'Invalid' };
  if (evo.requirements.roles && !evo.requirements.roles.includes(card.role)) {
    return { eligible: false, reason: `Requires ${evo.requirements.roles.join('/')}` };
  }
  if (card.learned?.includes(evo.level2.skill)) {
    return { eligible: false, reason: `Already has ${evo.name}` };
  }
  const capped = Boolean(evo.requirements.maxRating && card.rating >= evo.requirements.maxRating);
  return { eligible: true, reason: capped ? 'Skill only' : 'Eligible', capped };
}

export function commitEvolution(state, cardId, evoKey) {
  if (!state.squad.includes(cardId)) return state;
  if (!state.evoInventory?.includes(evoKey)) return state;
  if (state.activeEvo) return state; // Only 1 active evo at a time across the club

  const nextInventory = [...state.evoInventory];
  const index = nextInventory.indexOf(evoKey);
  nextInventory.splice(index, 1);

  const activeEvo = {
    cardId,
    evoKey,
    level: 1,
    progress: 0,
    l1Progress: 0,
    l2Progress: 0,
    l1Done: false,
    l2Done: false,
  };

  const currentTraining = state.training[cardId] ?? { stats: {}, skills: [] };
  const nextTraining = {
    ...state.training,
    [cardId]: {
      ...currentTraining,
      activeEvoKey: evoKey,
    },
  };

  return {
    ...state,
    evoInventory: nextInventory,
    activeEvo,
    training: nextTraining,
  };
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

  const dev = { ...state.dev };
  for (const id of state.squad) {
    if (dev[id]) dev[id] = { ...dev[id], f: 0, idle: 0 };
  }

  const contracts = { ...state.contracts };
  for (const id of state.squad) contracts[id] = Math.max(1, contracts[id] - 1);

  const titles = state.titles + (placement === 1 ? 1 : 0);
  const packsGained = YEAR_PACKS + (placement === 1 ? TITLE_PACKS : 0);
  // Playoffs pay gold, a title pays two, and every second title pays an icon.
  const goldGained = placement === 1 ? 2 : placement <= 3 ? 1 : 0;
  const iconsGained = placement === 1 && titles % TITLES_PER_ICON === 0 ? 1 : 0;
  const evo = rollSeasonEvo(rngFor(state, 'season-evo', state.year), placement === 1, state.tier);
  const settled = {
    ...grantPacks(state, { silver: packsGained, gold: goldGained, icons: iconsGained }),
    dev,
    evoInventory: evo ? [...(state.evoInventory ?? []), evo] : state.evoInventory ?? [],
    last: { ...state.last, evoReward: evo },
    contracts,
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
      changes: after.map((card, index) => ({ id: card.id, rating: card.rating, delta: card.developmentRating - before[index].developmentRating })),
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
  const sold = [];
  const expiringIds = new Set(offers.mine.map(item => item.card.id));
  for (const item of offers.mine) {
    if (own[item.card.id] === 'keep') contracts[item.card.id] = CONTRACT_MAX;
    if (own[item.card.id] === 'go') {
      leaving.add(item.card.id);
      delete contracts[item.card.id];
      const club = item.suitor && clubById(state, item.suitor.id);
      if (club) {
        moved[item.card.id] = { org: club.id, name: club.name, logo: club.logo };
        sold.push({ id: item.card.id, club: club.id });
      }
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
  const news = withNews(state, [
    ...sold.map(({ id, club }) => ({ id, club, kind: 'in' })),
    ...signed.filter(item => item.club).map(item => ({ id: item.card.id, club: item.club.id, kind: 'out' })),
  ]);
  return startYear({ ...settlePacks(state, totals.packs), squad, contracts, moved, news, year: state.year + 1, tier: nextTier(state) }, cards);
}

function nextTier(state) {
  const { movement, fromTier } = state.review;
  if (movement === 'promote') return fromTier + 1;
  if (movement === 'relegate') return fromTier - 1;
  return fromTier;
}

// ── squad and score ─────────────────────────────────────────────────────────

export function moveSquad(state, from, to) {
  const squad = [...state.squad];
  [squad[from], squad[to]] = [squad[to], squad[from]];
  return { ...state, squad };
}

export function clubScore(state) {
  return state.titles * 300 + state.seriesWon * 100 + state.roundsWon * 20;
}
