// What each tactic chip prints and pays. The payout steps are not worked out
// here: each step is a lane of example players run through the board's own
// tacticMult, so a chip can never promise a number the board won't pay.

import { tacticMult } from '../engine/board/board.js';
import { TACTICS, TACTIC_LIST } from '../engine/endless/seriesCards.js';

export const ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];
export const SKILLS = ['flick', 'flex', 'mastermind'];

// Every chip pays at least this on any lane (the clamp in tacticMult).
export const CHIP_FLOOR = 1.5;

// Clay colour, edge spots and the printed inlay per tier.
export const CHIP_TIERS = {
  common: { body: '#8d93a3', spot: '#ece8e1', face: '#161b29', ink: '#ece8e1' },
  uncommon: { body: '#3f6fd8', spot: '#ece8e1', face: '#101a33', ink: '#cfe0ff' },
  rare: { body: '#d8b34c', spot: '#211b06', face: '#211b06', ink: '#d8b34c' },
};

// The same codes the player cards print, so a chip and a card read alike.
export const CODES = {
  Duelist: 'DLT', Initiator: 'INI', Controller: 'CTL', Sentinel: 'SEN',
  flick: 'FLICK', flex: 'FLEX', mastermind: 'MIND', any: 'ANY', map: 'MAP', lock: 'MAP',
};

// The lanes that climb each chip's ladder, as the players on them: a role, or a
// skill on a player whose role the chip ignores. A chip with no steps only ever
// pays the floor. `icons` is what the face prints.
const CHIPS = {
  pocket: { icons: ['any'], steps: [] },
  hit: { icons: ['Duelist', 'Duelist'], steps: [['Duelist', 'Duelist'], ['Duelist', 'Duelist', 'Duelist']] },
  layers: { icons: ['Controller', 'Initiator'], steps: [['Controller', 'Initiator']] },
  retake: { icons: ['Sentinel', 'Controller'], steps: [['Sentinel', 'Controller']] },
  contact: { icons: ['Initiator', 'flick'], steps: [['Initiator', 'flick'], ['Initiator', 'flick', 'flick']] },
  flood: { icons: ['flex'], steps: [['flex'], ['flex', 'flex'], ['flex', 'flex', 'flex']] },
  // Needs four roles on one lane; a lane holds three, so it can't fire on the board.
  defaults: { icons: ROLES, steps: [], dead: true, code: '4 ROLES' },
  calling: { icons: ['mastermind'], steps: [['mastermind'], ['mastermind', 'mastermind']] },
  noRespect: { icons: ['flick'], steps: [['flick'], ['flick', 'flick']] },
  // Multiplies the map bonus, which the board always passes as 0.
  lockout: { icons: ['lock', 'map'], steps: [], dead: true, code: 'MAP RULE' },
};

// Kept for the tests and older callers: what each chip prints.
export const CHIP_ICONS = Object.fromEntries(Object.entries(CHIPS).map(([key, chip]) => [key, chip.icons]));

function exampleCard(token, index) {
  const skill = SKILLS.includes(token);
  return {
    id: `example-${index}`,
    player: `example-${index}`,
    role: skill ? 'none' : token,
    specialties: skill ? [token] : ['none'],
    stats: {},
  };
}

/** The multiplier a chip pays on a lane holding exactly these players. */
export function chipMultFor(key, tokens) {
  return tacticMult({ key }, tokens.map(exampleCard));
}

/**
 * The payout ladder above the floor: each step is the players a lane needs and
 * what it then pays. An empty ladder means the chip only ever pays the floor.
 */
export function chipLadder(key) {
  const id = TACTICS[key].key;
  return CHIPS[id].steps.map(icons => ({ icons, mult: chipMultFor(id, icons) }));
}

/** The short rule the code face prints: "CTL+INI", "2 DLT", "ANY". */
export function chipCode(key) {
  const id = TACTICS[key].key;
  if (CHIPS[id].code) return CHIPS[id].code;
  const first = CHIPS[id].steps[0] ?? CHIPS[id].icons;
  if (!CHIPS[id].steps.length) return CODES.any;
  const counts = new Map();
  for (const token of first) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts].map(([token, n]) => (n > 1 ? `${n} ${CODES[token]}` : CODES[token])).join('+');
}

// Takes old spellings too (hands saved as 'no-respect'): TACTICS maps them to the real key.
export function chipInfo(key) {
  const tactic = TACTICS[key];
  const id = tactic.key;
  const ladder = chipLadder(id);
  return {
    key: id,
    name: tactic.name,
    tier: tactic.tier,
    icons: CHIPS[id].icons,
    ladder,
    code: chipCode(id),
    dead: Boolean(CHIPS[id].dead),
    max: ladder.length ? ladder[ladder.length - 1].mult : CHIP_FLOOR,
  };
}

/**
 * The most this chip can pay for a real squad, and who has to share the lane:
 * every lane of 1 to 3 of the five, through the board's own numbers. Ties go to
 * the smaller group, since that leaves more players for the other two lanes.
 */
export function chipPlan(key, roster = []) {
  let best = { mult: CHIP_FLOOR, cards: [] };
  const consider = (cards) => {
    const mult = tacticMult({ key: TACTICS[key].key }, cards);
    if (mult > best.mult || (mult === best.mult && best.cards.length && cards.length < best.cards.length)) best = { mult, cards };
  };
  const n = roster.length;
  for (let a = 0; a < n; a++) {
    consider([roster[a]]);
    for (let b = a + 1; b < n; b++) {
      consider([roster[a], roster[b]]);
      for (let c = b + 1; c < n; c++) consider([roster[a], roster[b], roster[c]]);
    }
  }
  return { ...best, fits: best.mult > CHIP_FLOOR };
}

export const CHIP_KEYS = TACTIC_LIST.map(tactic => tactic.key);
