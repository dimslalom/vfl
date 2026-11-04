// The map board prototype: five players, three maps, no dice after you commit.
// Everything is pure so the bots, the tests and the screen share one result.
import { getCardSpecialties } from '../../../shared/src/data/specialties.js';
import { mulberry32 } from '../../../shared/src/engine/perfectRun.js';
import { tacticActivation } from '../endless/seriesCards.js';

export const LANES = 3;
export const SQUAD_SIZE = 5;
export const LANE_CAP = 3;
export const MAPS_TO_WIN = 2;

// Combos add, so a lane can be read as a plain sum; only a tactic multiplies.
const ROLE_PAIR = 20;
const TEAMMATE_PAIR = 15;
const COUNTRY_PAIR = 8;
const ONE_TRICK_BONUS = 20;
const AURA_PENALTY = 15;

export const BOARD_SKILLS = {
  flex: { label: 'Flex', text: 'Moves free during the rotate' },
  flick: { label: 'Flick', text: 'Alone on a lane: scores their best stat' },
  one_trick: { label: 'One Trick', text: '+20 on maps that suit their agent' },
  mastermind: { label: 'Mastermind', text: 'As IGL: two rotates' },
  aura: { label: 'Aura', text: '-15 to the enemy on their lane' },
};

export function hasSkill(card, key) {
  return Boolean(card.learned?.includes(key)) || getCardSpecialties(card).some(spec => spec.key === key);
}

/** Every legal way to spread five players: each map gets one, none gets more than three. */
export function allPlacements(size = SQUAD_SIZE) {
  const out = [];
  const walk = (slots) => {
    if (slots.length === size) {
      const counts = [0, 1, 2].map(lane => slots.filter(slot => slot === lane).length);
      if (counts.every(count => count >= 1 && count <= LANE_CAP)) out.push(slots);
      return;
    }
    for (let lane = 0; lane < LANES; lane += 1) walk([...slots, lane]);
  };
  walk([]);
  return out;
}

export function isLegalPlacement(slots) {
  if (slots.length !== SQUAD_SIZE) return false;
  return [0, 1, 2].every((lane) => {
    const count = slots.filter(slot => slot === lane).length;
    return count >= 1 && count <= LANE_CAP;
  });
}

function pairs(cards) {
  const out = [];
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) out.push([cards[i], cards[j]]);
  }
  return out;
}

function ruleFires(cards, lane) {
  const roles = new Set(cards.map(card => card.role));
  return lane.roles.every(role => roles.has(role));
}

/**
 * One side's total on one lane, as the steps the screen plays back. Each step
 * carries the running total, so the last one is the number that decides it.
 * Every player scores the stat printed on their card that this lane asks for.
 */
export function laneScore(cards, lane, tactic = null) {
  const steps = [];
  let total = 0;
  const add = (key, value, label) => {
    total += value;
    steps.push({ key, op: '+', value, label, total });
  };
  for (const card of cards) {
    const alone = cards.length === 1 && hasSkill(card, 'flick');
    add('player', alone ? Math.max(...Object.values(card.stats)) : card.stats[lane.stat], card.player);
  }
  if (cards.length && ruleFires(cards, lane)) add('rule', ROLE_PAIR, 'Roles');
  for (const card of cards) {
    if (hasSkill(card, 'one_trick') && card.agents?.length === 1 && lane.agents?.includes(card.agents[0])) {
      add('trick', ONE_TRICK_BONUS, 'Trick');
    }
  }
  for (const [a, b] of pairs(cards)) {
    if (a.org && a.org === b.org) add('teammates', TEAMMATE_PAIR, 'Team');
    else if (a.nationality && a.nationality === b.nationality) add('country', COUNTRY_PAIR, 'Nation');
  }
  if (cards.length && tactic) {
    const value = tacticMult(tactic, cards);
    total = Math.round(total * value);
    steps.push({ key: 'tactic', op: '×', value, label: 'Tactic', total });
  }
  return { total, steps };
}

// Tactics pay for who is on the lane, in half steps you can multiply in your head.
export function tacticMult(tactic, cards) {
  const raw = tacticActivation(tactic, cards, { bonus: 0 }).mult;
  return Math.min(3, Math.max(1.5, Math.round(raw * 2) / 2));
}

/** The sum as players read it: the stat total, then each bonus in order. */
export function laneFormula(steps) {
  const sum = steps.filter(step => step.key === 'player').reduce((total, step) => total + step.value, 0);
  const bonuses = new Map();
  for (const step of steps) {
    if (['player', 'tactic', 'aura'].includes(step.key)) continue;
    bonuses.set(step.label, (bonuses.get(step.label) ?? 0) + step.value);
  }
  const rest = [...bonuses].map(([label, value]) => `+${value} ${label}`);
  const tactic = steps.find(step => step.key === 'tactic');
  if (tactic) rest.push(`×${tactic.value} ${tactic.label}`);
  const aura = steps.find(step => step.key === 'aura');
  if (aura) rest.push(`-${aura.value} ${aura.label}`);
  return steps.length ? [String(sum), ...rest].join('  ') : '';
}

function laneCards(roster, slots, lane) {
  return roster.filter((_, index) => slots[index] === lane);
}

// An aura lands last, on the side opposite the player carrying it.
function underAura(score, opposing) {
  const value = opposing.filter(card => hasSkill(card, 'aura')).length * AURA_PENALTY;
  if (!value || !score.steps.length) return score;
  const total = Math.max(0, score.total - value);
  return { total, steps: [...score.steps, { key: 'aura', op: '-', value, label: 'Aura', total }] };
}

/** The whole board. Ties on a map go to the higher raw rating there. */
export function resolveBoard({ maps, you, them }) {
  const lanes = maps.map((map, lane) => {
    const myCards = laneCards(you.roster, you.slots, lane);
    const theirCards = laneCards(them.roster, them.slots, lane);
    const mine = underAura(laneScore(myCards, map, you.tactic?.lane === lane ? you.tactic.card : null), theirCards);
    const theirs = underAura(laneScore(theirCards, map, them.tactic?.lane === lane ? them.tactic.card : null), myCards);
    const rawMine = myCards.reduce((sum, card) => sum + card.rating, 0);
    const rawTheirs = theirCards.reduce((sum, card) => sum + card.rating, 0);
    const winner = mine.total !== theirs.total
      ? (mine.total > theirs.total ? 'you' : 'them')
      : rawMine === rawTheirs ? null : (rawMine > rawTheirs ? 'you' : 'them');
    return { mine, theirs, winner };
  });
  const youWon = lanes.filter(lane => lane.winner === 'you').length;
  const themWon = lanes.filter(lane => lane.winner === 'them').length;
  const youTotal = lanes.reduce((sum, lane) => sum + lane.mine.total, 0);
  const themTotal = lanes.reduce((sum, lane) => sum + lane.theirs.total, 0);
  const winner = youWon !== themWon ? (youWon > themWon ? 'you' : 'them') : (youTotal >= themTotal ? 'you' : 'them');
  return { lanes, youWon, themWon, youTotal, themTotal, winner };
}

function laneValue(roster, slots, map, lane, tactic) {
  return laneScore(laneCards(roster, slots, lane), map, tactic).total;
}

/** The placement and tactic lane worth the most lanes against `against`, if known. */
export function bestPlacement({ roster, maps, tactic = null, against = null, rng = null }) {
  let best = null;
  for (const slots of allPlacements(roster.length)) {
    for (let lane = 0; lane < (tactic ? LANES : 1); lane += 1) {
      const scores = maps.map((map, index) => laneValue(roster, slots, map, index, tactic && index === lane ? tactic : null));
      const value = against
        ? scores.filter((score, index) => score > against[index]).length * 1000 + scores.reduce((a, b) => a + b, 0)
        : [...scores].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) + Math.min(...scores) * 0.2;
      const noise = rng ? rng() * 40 : 0;
      if (!best || value + noise > best.value) best = { slots, value: value + noise, lane };
    }
  }
  return { slots: best.slots, tactic: tactic ? { lane: best.lane, card: tactic } : null };
}

/** How many non-Flex players the IGL may move. The leftmost card is the IGL. */
export function rotateMoves(roster) {
  return hasSkill(roster[0], 'mastermind') ? 2 : 1;
}

/** Whether `next` is a board the IGL can reach from `locked` this rotate. */
export function isLegalRotation(locked, next, roster) {
  if (!isLegalPlacement(next)) return false;
  const moved = next.filter((slot, index) => slot !== locked[index] && !hasSkill(roster[index], 'flex')).length;
  return moved <= rotateMoves(roster);
}

export function isLegalRotate(slots, index, lane) {
  if (slots[index] === lane) return false;
  const next = [...slots];
  next[index] = lane;
  return isLegalPlacement(next);
}

export function rotate(slots, index, lane) {
  const next = [...slots];
  next[index] = lane;
  return next;
}

/** The best reachable board against one as it stands, one move at a time. */
export function bestRotate({ you, them, maps }) {
  const score = slots => resolveBoard({ maps, you: { ...you, slots }, them });
  let best = you.slots;
  let top = score(best);
  for (let step = 0; step < you.slots.length; step += 1) {
    let improved = false;
    for (let index = 0; index < best.length; index += 1) {
      for (let lane = 0; lane < LANES; lane += 1) {
        const slots = rotate(best, index, lane);
        if (slots[index] === best[index] || !isLegalRotation(you.slots, slots, you.roster)) continue;
        const result = score(slots);
        if (result.youWon > top.youWon || (result.youWon === top.youWon && result.youTotal > top.youTotal)) {
          best = slots;
          top = result;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/**
 * A full board between a thinking player and the opponent the game plays. The
 * opponent places first with a little noise, shows `shown` of its five, and
 * both IGLs then answer the revealed board at the same time.
 */
export function playBoard({ seed, you, them, maps, shown = 2, skill = true }) {
  const rng = mulberry32(seed);
  const opp = bestPlacement({ roster: them.roster, maps, tactic: them.tactic, rng });
  const seen = opp.slots.map((slot, index) => (index < shown ? slot : null));
  const estimate = maps.map((map, lane) => laneScore(them.roster.filter((_, i) => seen[i] === lane), map).total * 1.6);
  const placed = skill
    ? bestPlacement({ roster: you.roster, maps, tactic: you.tactic, against: estimate })
    : { slots: allPlacements()[Math.floor(rng() * 150) % allPlacements().length], tactic: you.tactic ? { lane: 0, card: you.tactic } : null };
  const side = (roster, plan) => ({ roster, slots: plan.slots, tactic: plan.tactic });
  const mine = side(you.roster, placed);
  const theirs = side(them.roster, opp);
  const mineRotated = skill ? bestRotate({ you: mine, them: theirs, maps }) : mine.slots;
  const theirRotated = bestRotate({ you: theirs, them: mine, maps });
  return resolveBoard({
    maps,
    you: { ...mine, slots: mineRotated },
    them: { ...theirs, slots: theirRotated },
  });
}
