// Rules the client and the Worker must agree on. The Daily is one year of
// Endless: three events, then the run ends on its own.
export const DAILY_YEARS = 1;

// The most one year can score: three titles through four rounds each, every
// map won 13-0, a Grand Slam and a Perfect Season. Worked out against
// ROUND_META in test/dailyRules.test.js, so a format change fails the test.
export const DAILY_SCORE_MAX = 3341;

// Overall boards count only scores made under one-year Daily rules. Stored
// date keys are unpadded ("2026-11-3"), so this filters on created_at.
export const DAILY_BOARD_START_MS = Date.UTC(2026, 10, 3);

// True on the last event of a run with a fixed length. `fixedYears` is null for
// a run the player ends themselves.
export function isLastEvent(fixedYears, tourIndex) {
  return fixedYears != null && tourIndex + 1 >= fixedYears * 3;
}
