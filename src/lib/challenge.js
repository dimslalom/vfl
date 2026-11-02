// A challenge is a link, not an account: the seed reproduces the sender's
// opening draw, and everything else says what score to beat over how long.
// Nothing here is trusted beyond display. Challenge runs never reach a
// leaderboard, so a forged link can only mislead the person who opens it.
const MAX_SCORE = 1_000_000;
const MAX_YEARS = 50;

export function encodeChallenge({ seed, score, years, packs, by }) {
  const code = [(seed >>> 0).toString(36), score, Math.max(1, years), packs].join('.');
  return new URLSearchParams({ c: code, by: String(by ?? '').slice(0, 28) }).toString();
}

export function decodeChallenge(search) {
  const params = new URLSearchParams(search);
  const parts = params.get('c')?.split('.');
  if (parts?.length !== 4) return null;
  const seed = parseInt(parts[0], 36);
  const [score, years, packs] = parts.slice(1).map(Number);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
  if (!Number.isInteger(years) || years < 1 || years > MAX_YEARS) return null;
  if (![1, 3].includes(packs)) return null;
  return { seed, score, years, packs, by: (params.get('by') ?? '').trim().slice(0, 28) };
}

export function challengeUrl(origin, challenge) {
  return `${origin}/run?${encodeChallenge(challenge)}`;
}
