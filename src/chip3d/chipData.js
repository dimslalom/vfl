// What each tactic chip prints and pays. The face shows what the tactic rewards
// as icons, never words; opening the chip shows the payout steps, read straight
// from the tactic's own numbers in seriesCards.js so the two can never disagree.

import { TACTICS, TACTIC_LIST } from '../engine/endless/seriesCards.js';

export const ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];

// Clay colour, edge spots and the printed inlay per tier.
export const CHIP_TIERS = {
  common: { body: '#8d93a3', spot: '#ece8e1', face: '#161b29', ink: '#ece8e1' },
  uncommon: { body: '#3f6fd8', spot: '#ece8e1', face: '#101a33', ink: '#cfe0ff' },
  rare: { body: '#d8b34c', spot: '#211b06', face: '#211b06', ink: '#d8b34c' },
};

export const CHIP_ICONS = {
  pocket: ['igl', 'map'],
  hit: ['Duelist', 'Duelist'],
  layers: ['Controller', 'Initiator'],
  retake: ['Sentinel', 'Controller'],
  contact: ['Initiator', 'flick'],
  flood: ['Duelist', 'flex'],
  defaults: ROLES,
  calling: ['mastermind'],
  noRespect: ['flick'],
  lockout: ['lock', 'map'],
};

const SKILL_ICON = { flick: 'flick', flex: 'flex', mastermind: 'mastermind' };

// Board tactics pay in half steps between ×1.5 and ×3 (tacticMult in board.js).
const half = value => Math.min(3, Math.max(1.5, Math.round(value * 2) / 2));

/**
 * The payout ladder: each step is the icons on a lane and the multiplier they
 * earn. It stops at the cap, so a chip never promises a step it can't pay.
 */
export function chipLadder(key) {
  const tactic = TACTICS[key];
  const base = 1 + (tactic.base ?? 0);
  if (tactic.coverage) return [{ icons: ROLES, mult: half(base + (tactic.perRole ?? 0.15) + tactic.coverage) }];
  if (tactic.partner) return [{ icons: [tactic.role, tactic.partner], mult: half(base + (tactic.perRole ?? 0.15) + tactic.pair) }];
  const steps = [];
  const repeat = (icon, n) => Array.from({ length: n }, () => icon);
  for (let n = 1; n <= 3; n++) {
    let mult;
    let icons;
    if (tactic.specialty) {
      mult = half(base + n * tactic.specialtyBonus);
      icons = repeat(SKILL_ICON[tactic.specialty], n);
    } else if (tactic.role) {
      mult = half(base + n * (tactic.perRole ?? 0.15));
      icons = repeat(tactic.role, n);
    } else {
      return [{ icons: CHIP_ICONS[key], mult: half(base) }];
    }
    steps.push({ icons, mult });
    if (mult >= 3) break;
  }
  return steps;
}

// Takes old spellings too (hands saved as 'no-respect'): TACTICS maps them to the real key.
export function chipInfo(key) {
  const tactic = TACTICS[key];
  const id = tactic.key;
  return { key: id, name: tactic.name, tier: tactic.tier, icons: CHIP_ICONS[id], ladder: chipLadder(id) };
}

export const CHIP_KEYS = TACTIC_LIST.map(tactic => tactic.key);
