// What the club earns and spends, as plain numbers.
//
// A club holds three kinds of pack. `packs` is the silver count (it was the only
// kind before, so old saves and the market keep working); `gold` and `icons` sit
// beside it. Spending a price takes silver first, then breaks a bigger pack and
// hands the change back as silver.

import { fatiguePenalty } from '../../../shared/src/engine/endless/career.js';

export const PACK_VALUE = { silver: 1, gold: 3, icons: 5 };
export const PACK_KEYS = ['silver', 'gold', 'icons'];
// Silver keeps its old field name; gold and icons are new.
export const PACK_FIELD = { silver: 'packs', gold: 'gold', icons: 'icons' };

export const SQUAD_BASE = 7;
export const TRAIN_SLOTS_MAX = 2;
export const TAPE_MAX = 3;
export const GOLD_PITY = 6;
export const TITLES_PER_ICON = 2;
export const BENCH_XP = 0.4;
export const GOLD_RATING = 80;
// A tired starter should feel it: club fatigue costs 2.5 times what it does elsewhere.
export const CLUB_FATIGUE_X = 2.5;
export const SESSION_PRICE = 1;
export const REROLL_PRICE = 1;
export const INTERNATIONAL_TIER = 2;
export const SLOT_TITLES = 2;

export const stock = (state, kind) => state[PACK_FIELD[kind]] ?? 0;

export function packValue(state) {
  return PACK_KEYS.reduce((sum, kind) => sum + stock(state, kind) * PACK_VALUE[kind], 0);
}

/** Pack counts after paying `price`, or null when the club can't afford it. */
export function payPacks(state, price) {
  if (price <= 0) return state;
  if (price > packValue(state)) return null;
  const left = { silver: stock(state, 'silver'), gold: stock(state, 'gold'), icons: stock(state, 'icons') };
  let owed = price;
  for (const kind of PACK_KEYS) {
    const take = Math.min(left[kind], Math.ceil(owed / PACK_VALUE[kind]));
    left[kind] -= take;
    owed -= take * PACK_VALUE[kind];
    if (owed <= 0) break;
  }
  // A bigger pack can overpay; the change comes back as silver.
  left.silver += -owed;
  return { ...state, packs: left.silver, gold: left.gold, icons: left.icons };
}

export function grantPacks(state, { silver = 0, gold = 0, icons = 0 }) {
  return { ...state, packs: stock(state, 'silver') + silver, gold: stock(state, 'gold') + gold, icons: stock(state, 'icons') + icons };
}

/** Sets the club's pack value to `value`, paying or refunding the difference. */
export function settlePacks(state, value) {
  const spent = packValue(state) - value;
  if (spent <= 0) return grantPacks(state, { silver: -spent });
  return payPacks(state, spent) ?? state;
}

// ── bench slots ─────────────────────────────────────────────────────────────

/** Seven to start, one more once you've reached International, one more with a second title. */
export function squadMax(state) {
  const reached = state.tier >= INTERNATIONAL_TIER || (state.history ?? []).some(year => year.tier >= INTERNATIONAL_TIER);
  return SQUAD_BASE + (reached ? 1 : 0) + ((state.titles ?? 0) >= SLOT_TITLES ? 1 : 0);
}

/** The extra rating a tired player loses on top of the shared fatigue rule. */
export function clubFatigueExtra(dev) {
  return fatiguePenalty(dev) * (CLUB_FATIGUE_X - 1);
}

/** Fields a save from before this system lacks. */
export function rewardDefaults() {
  return { gold: 0, icons: 0, pity: { gold: 0 }, tapes: 0, opens: 0, opening: null, chipOffer: null };
}
