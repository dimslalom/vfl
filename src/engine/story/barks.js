// In-match barks: one short line, picked by the most specific rule that matches what just
// happened on the board (after Valve's dynamic dialog, GDC 2012). No match means silence.

/** Facts the board knows at a moment: which event, the score, and the series shape. */
export function barkFacts({ event, round, you, them, bestOf, champion = null }) {
  const need = Math.ceil(bestOf / 2);
  return {
    event,
    round,
    you,
    them,
    champion,
    decider: you === need - 1 && them === need - 1,
    matchPoint: you === need - 1 && them < need - 1,
    facingOut: them === need - 1 && you < need - 1,
    levelled: event === 'round_won' && you === them && you > 0,
    sweep: champion === 'you' && them === 0,
  };
}

// ponytail: cooldown lives in module memory, so it resets on reload; persist it in the save if repeats show up.
const heard = [];
const COOLDOWN = 12;

/** Highest-scoring matching rule that has not played recently, or null. */
export function pickBark(rules, facts, recent = heard) {
  const pick = (rules ?? [])
    .filter(rule => !recent.includes(rule.id) && rule.when(facts))
    .sort((a, b) => b.score - a.score)[0];
  if (!pick) return null;
  recent.push(pick.id);
  if (recent.length > COOLDOWN) recent.shift();
  return pick;
}
