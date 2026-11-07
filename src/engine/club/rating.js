// Ranked Club rating: Elo between live clubs, Iron to Radiant on top of it.
// A CPU match (the queue found nobody) moves no rating but still counts for
// form and First Win of the Day. Pure, so the Duel object and tests share it.

export const START_RATING = 1000;
export const RANKS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];
// Iron is under 900, then one rank per 100: Silver from 1000, Radiant from 1600.
const RANK_FLOOR = 800;
const RANK_STEP = 100;
const NEW_GAMES = 20;
const FORM_LENGTH = 5;

export function rankFor(rating) {
  const index = Math.min(RANKS.length - 1, Math.max(0, Math.floor((rating - RANK_FLOOR) / RANK_STEP)));
  const top = index === RANKS.length - 1;
  const base = RANK_FLOOR + index * RANK_STEP;
  return {
    index,
    name: RANKS[index],
    next: top ? null : RANKS[index + 1],
    // Share of the way to the next rank; Iron counts from 800, Radiant stays full.
    progress: top ? 1 : Math.min(1, Math.max(0, (rating - base) / RANK_STEP)),
    toNext: top ? 0 : Math.max(0, base + RANK_STEP - rating),
  };
}

/** Rating change for one series: K 32 for a club's first 20 games, then 16. */
export function ratingDelta(mine, theirs, won, games = 0) {
  const k = games < NEW_GAMES ? 32 : 16;
  const expected = 1 / (1 + 10 ** ((theirs - mine) / 400));
  return Math.round(k * ((won ? 1 : 0) - expected));
}

export function freshRating() {
  return { rating: START_RATING, games: 0, wins: 0, form: '', firstWinDay: null };
}

/**
 * One finished ranked series for one club. `opponent` is the other club's
 * rating before the series, or null against the CPU. `day` is the UTC date key.
 */
export function settleRanked(row, { won, opponent, day }) {
  const before = row ?? freshRating();
  const delta = opponent == null ? 0 : ratingDelta(before.rating, opponent, won, before.games);
  const firstWin = won && before.firstWinDay !== day;
  const after = {
    rating: Math.max(0, before.rating + delta),
    games: before.games + 1,
    wins: before.wins + (won ? 1 : 0),
    form: `${before.form}${won ? 'W' : 'L'}`.slice(-FORM_LENGTH),
    firstWinDay: firstWin ? day : before.firstWinDay,
  };
  return { row: after, delta, firstWin };
}

export function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}
