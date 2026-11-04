// What each tactic chip prints and pays. The payout steps are not worked out
// here: each step is a lane of example players run through the board's own
// tacticMult, so a chip can never promise a number the board won't pay.

import { chainMult, chipTier, hasSkill, tacticMult } from '../engine/board/board.js';
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
  flick: 'FLICK', flex: 'FLEX', mastermind: 'MIND', any: 'ANY', igl: 'IGL', map: 'MAP', lock: 'LOCK',
  trio: '3 ROLES', chain: 'CHAIN', slash: 'CUT',
};

// The lanes that climb each chip's ladder, as the players on them: a role, a
// skill on a player whose role the chip ignores, 'igl' for the IGL, or 'any'
// for any player at all. `icons` is what the face prints, `code` its rule in
// the cards' codes. Rares do something on top (`special`), read by resolveBoard.
const CHIPS = {
  pocket: { icons: ['igl'], steps: [['igl']], code: 'IGL' },
  hit: { icons: ['Duelist', 'Duelist'], steps: [['Duelist', 'Duelist'], ['Duelist', 'Duelist', 'Duelist']] },
  layers: { icons: ['Controller', 'Initiator'], steps: [['Controller', 'Initiator']] },
  retake: { icons: ['Sentinel', 'Controller'], steps: [['Sentinel', 'Controller']] },
  contact: { icons: ['Initiator', 'flick'], steps: [['Initiator', 'flick'], ['Initiator', 'flick', 'flick']] },
  flood: { icons: ['flex'], steps: [['flex'], ['flex', 'flex'], ['flex', 'flex', 'flex']] },
  defaults: { icons: ['trio'], steps: [['Duelist', 'Controller', 'Sentinel']], code: '3 ROLES' },
  // Rare: ×2 on its lane and a ×1.5 chain to the next lane; Masterminds add to both.
  calling: { icons: ['chain'], steps: [['any'], ['mastermind'], ['mastermind', 'mastermind']], code: 'CHAIN', special: 'chain' },
  // Rare: the enemy's best player on its lane scores 0; a Flick beside it adds ×1.5 to its lane.
  noRespect: {
    icons: ['slash'], code: 'THEIR BEST', special: 'disrespect', headline: '0',
    ladder: [{ icons: ['slash'], label: '0' }, { icons: ['flick'], label: '+×1.5' }],
  },
  // Rare: the enemy's chip pays nothing, wherever it is. A pure counter.
  lockout: { icons: ['lock'], code: 'THEIR CHIP', special: 'cancel', headline: 'OFF', ladder: [{ icons: ['lock'], label: 'OFF' }] },
};

// Kept for the tests and older callers: what each chip prints.
export const CHIP_ICONS = Object.fromEntries(Object.entries(CHIPS).map(([key, chip]) => [key, chip.icons]));

function exampleCard(token, index) {
  const skill = SKILLS.includes(token);
  return {
    id: token === 'igl' ? 'example-igl' : `example-${index}`,
    player: `example-${index}`,
    role: skill || token === 'igl' || token === 'any' ? 'none' : token,
    specialties: skill ? [token] : ['none'],
    stats: {},
  };
}

/** The multiplier a chip pays on a lane holding exactly these players. */
export function chipMultFor(key, tokens) {
  return tacticMult({ key }, tokens.map(exampleCard), { igl: 'example-igl' });
}

/** A Second Call's chain multiplier, for a chip lane holding these players. */
export function chainMultFor(tokens) {
  return chainMult(tokens.map(exampleCard));
}

/**
 * The payout ladder: each step is the players a lane needs and what it then
 * pays (or `label`, for a chip that doesn't multiply). Steps the board would
 * pay only at the floor are left out.
 */
export function chipLadder(key) {
  const id = TACTICS[key].key;
  if (CHIPS[id].ladder) return CHIPS[id].ladder.map(step => ({ ...step, mult: null }));
  return CHIPS[id].steps.map(icons => ({ icons, mult: chipMultFor(id, icons) }));
}

/** The short rule the code face prints: "CTL+INI", "2 DLT", "ANY". */
export function chipCode(key) {
  const id = TACTICS[key].key;
  if (CHIPS[id].code) return CHIPS[id].code;
  const first = CHIPS[id].steps[0] ?? CHIPS[id].icons;
  const counts = new Map();
  for (const token of first) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts].map(([token, n]) => (n > 1 ? `${n} ${CODES[token]}` : CODES[token])).join('+');
}

// Takes old spellings too (hands saved as 'no-respect'): TACTICS maps them to the real key.
export function chipInfo(key) {
  const tactic = TACTICS[key];
  const id = tactic.key;
  const ladder = chipLadder(id);
  const max = ladder.length && ladder.at(-1).mult ? ladder.at(-1).mult : CHIP_FLOOR;
  return {
    key: id,
    name: tactic.name,
    tier: chipTier(id),
    icons: CHIPS[id].icons,
    ladder,
    code: chipCode(id),
    special: CHIPS[id].special ?? null,
    max,
    // The big print on the face: the most it pays, or what it does instead.
    headline: CHIPS[id].headline ?? `×${max}`,
  };
}

/**
 * The most this chip can pay for a real squad, and who has to share the lane:
 * every lane of 1 to 3 of the five, through the board's own numbers. Ties go to
 * the smaller group, since that leaves more players for the other two lanes.
 * A chip that pays the same on any lane comes back with `anyLane`.
 */
export function chipPlan(key, roster = []) {
  const id = TACTICS[key].key;
  const ctx = { igl: roster[0]?.id };
  if (id === 'noRespect') {
    const flick = roster.filter(card => hasSkill(card, 'flick'));
    return { kind: 'disrespect', mult: 1, cards: flick.slice(0, 1), fits: true, flick: flick.length > 0 };
  }
  if (id === 'lockout') return { kind: 'cancel', mult: 1, cards: [], fits: true };
  const base = tacticMult({ key: id }, [exampleCard('any', 0)], ctx);
  let best = { mult: base, cards: [] };
  const consider = (cards) => {
    const mult = tacticMult({ key: id }, cards, ctx);
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
  // Pays the same on any lane: only worth saying when that is above the floor.
  return { ...best, anyLane: !best.cards.length && base > CHIP_FLOOR, fits: best.mult > CHIP_FLOOR, special: CHIPS[id].special ?? null };
}

export const CHIP_KEYS = TACTIC_LIST.map(tactic => tactic.key);
