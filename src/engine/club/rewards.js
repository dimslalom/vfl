// Spending what the club has earned: opening packs, picking chips, extra training.
//
// Every roll is a seed plus a tag, like the rest of the club, so a save stays plain
// JSON. An opened pack is kept in `state.opening` until you pick, so a reload in the
// middle of a pack can't lose or reroll it.

import { mulberry32, pickN } from '../../../shared/src/engine/perfectRun.js';
import { bankTactics } from '../endless/seriesCards.js';
import { maxSignableRating } from '../endless/stature.js';
import {
  GOLD_PITY, GOLD_RATING, NAME_MAX, RENAME_PRICE, REROLL_PRICE, SESSION_PRICE, TAPE_MAX, TRAIN_SLOTS_MAX, payPacks, squadMax, stock,
} from './economy.js';
import { CONTRACT_MAX, SKILL_SESSIONS, rollChipOffer, squadCards, trainingOffer } from './season.js';

export const PICKS = 3;

function hash(...parts) {
  let value = 2166136261;
  for (const char of parts.join('|')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

const isGold = card => card.rating > GOLD_RATING;
const strongest = (a, b) => b.rating - a.rating || a.id.localeCompare(b.id);

// ── packs ───────────────────────────────────────────────────────────────────

const POOLS = {
  silver: card => card.league !== 'icon',
  gold: card => card.league !== 'icon' && isGold(card),
  icons: card => card.league === 'icon',
};

/** Why a pack can't be opened right now, or null when it can. */
export function openBlocker(state, kind) {
  if (state.opening) return 'open';
  if (stock(state, kind) < 1) return 'empty';
  if (state.phase === 'over') return 'over';
  if (state.squad.length >= squadMax(state)) return 'full';
  return null;
}

/** Who a pack of this kind can hold: everyone of its kind not already placed, within reach first. */
export function packPool(state, kind, cards) {
  const placed = new Set([...state.squad, ...state.clubs.flatMap(club => club.roster)]);
  const limit = maxSignableRating(state.reputation, squadCards(state, cards));
  const all = cards.filter(card => POOLS[kind](card) && !placed.has(card.id));
  const reachable = all.filter(card => card.rating <= limit);
  // A club that can't reach this kind yet still gets the weakest of it, never an empty pack.
  const weakest = [...all].sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id)).slice(0, PICKS);
  return { pool: reachable.length >= PICKS ? reachable : weakest, limit };
}

/** The next silver pack is the one that pays gold. */
export const goldDue = state => (state.pity?.gold ?? 0) >= GOLD_PITY - 1;

function deal(state, kind, cards) {
  const rng = mulberry32(hash(state.seed, 'open', kind, state.opens ?? 0));
  const { pool } = packPool(state, kind, cards);
  let picks = pickN(rng, pool, Math.min(PICKS, pool.length));
  let guaranteed = false;
  if (kind === 'silver' && goldDue(state) && !picks.some(isGold)) {
    // The best gold within reach; if none is, simply the best card there is.
    const best = [...pool].sort(strongest).find(isGold) ?? [...pool].sort(strongest)[0];
    if (best) {
      picks = [...picks.slice(0, PICKS - 1), best];
      guaranteed = true;
    }
  }
  return { picks: picks.sort(strongest), guaranteed };
}

/** Tear a pack: it leaves the stock and its three cards wait for your pick. */
export function openPack(state, kind, cards) {
  if (openBlocker(state, kind)) return state;
  const { picks, guaranteed } = deal(state, kind, cards);
  const field = kind === 'silver' ? 'packs' : kind;
  const dry = (state.pity?.gold ?? 0) + 1;
  const pity = kind === 'silver' ? { ...state.pity, gold: picks.some(isGold) ? 0 : dry } : state.pity;
  return {
    ...state,
    [field]: stock(state, kind) - 1,
    opens: (state.opens ?? 0) + 1,
    pity,
    opening: { kind, ids: picks.map(card => card.id), guaranteed },
  };
}

/** Sign one of the three, or pass on all of them: a pass is worth a skill tape. */
export function choosePick(state, id) {
  const { opening } = state;
  if (!opening) return state;
  const base = { ...state, opening: null };
  if (id == null) return { ...base, tapes: Math.min(TAPE_MAX, (state.tapes ?? 0) + 1) };
  if (!opening.ids.includes(id) || state.squad.length >= squadMax(state)) return state;
  const moved = { ...state.moved };
  delete moved[id];
  return {
    ...base,
    squad: [...state.squad, id],
    contracts: { ...state.contracts, [id]: CONTRACT_MAX },
    moved,
  };
}

// ── chips ───────────────────────────────────────────────────────────────────

/** Add the chip you picked to the hand, dropping `replaceUid` if the hand is full. Null passes. */
export function chooseChip(state, uid, replaceUid = null) {
  const offer = state.chipOffer;
  if (!offer) return state;
  if (uid == null) return { ...state, chipOffer: null };
  const chip = offer.options.find(option => option.uid === uid);
  if (!chip) return state;
  const held = replaceUid ? state.hand.filter(card => card.uid !== replaceUid) : state.hand;
  const { hand, overflow } = bankTactics(held, [chip]);
  if (overflow.length) return state;
  return { ...state, hand, chipOffer: null };
}

export function canReroll(state) {
  return Boolean(state.chipOffer) && payPacks(state, REROLL_PRICE) !== null;
}

/** A new set of three for one pack. Each reroll is a new roll, not the old one again. */
export function rerollChips(state) {
  if (!canReroll(state)) return state;
  const paid = payPacks(state, REROLL_PRICE);
  return { ...paid, chipOffer: rollChipOffer(state, state.chipOffer.stage, state.chipOffer.attempt + 1) };
}

// ── the club's name ─────────────────────────────────────────────────────────

/** A club name as stored: trimmed, single-spaced, at most NAME_MAX characters. */
export function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX).trim();
}

/** Renaming needs a real, different name, a club still in charge, and the packs. */
export function canRename(state, name) {
  const next = cleanName(name);
  return Boolean(next) && next !== state.name && state.phase !== 'over' && payPacks(state, RENAME_PRICE) !== null;
}

/** A new name for RENAME_PRICE in pack value. */
export function renameClub(state, name) {
  if (!canRename(state, name)) return state;
  return { ...payPacks(state, RENAME_PRICE), name: cleanName(name) };
}

// ── training ────────────────────────────────────────────────────────────────

export function canBuySession(state) {
  return (state.phase === 'league' || state.phase === 'playoffs')
    && state.trainSlot < TRAIN_SLOTS_MAX && payPacks(state, SESSION_PRICE) !== null;
}

/** A second session this week, for a pack. */
export function buySession(state) {
  if (!canBuySession(state)) return state;
  return { ...payPacks(state, SESSION_PRICE), trainSlot: state.trainSlot + 1 };
}

/** Spend a skill tape on the session a player is learning, without using the week's slot. */
export function useTape(state, card) {
  if (!(state.tapes > 0)) return state;
  const offer = trainingOffer(state, card);
  if (!offer.skill) return state;
  const entry = { stats: {}, skills: [], ...state.training[card.id] };
  const sessions = offer.sessions + 1;
  const learned = sessions >= SKILL_SESSIONS;
  const updated = learned
    ? { ...entry, skills: [...entry.skills, offer.skill], learning: null }
    : { ...entry, learning: { key: offer.skill, sessions } };
  return { ...state, tapes: state.tapes - 1, training: { ...state.training, [card.id]: updated } };
}
