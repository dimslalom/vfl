// The map board prototype: five players, three maps, no dice after you commit.
// Everything is pure so the bots, the tests and the screen share one result.
import { getCardSpecialties } from '../../../shared/src/data/specialties.js';
import { mulberry32 } from '../../../shared/src/engine/perfectRun.js';
import { TACTICS, tacticActivation } from '../endless/seriesCards.js';

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
 *
 * `ctx` carries what the rest of the board does to this lane (resolveBoard and
 * sideScores fill it in): `igl` the side's IGL id, `chain` a second multiplier
 * from a Second Call on another lane, `cancelled` when the enemy's Lock the Map
 * voids this side's chip, `disrespect` ('half' | 'zero') when the enemy's No
 * Respect sits on this lane.
 */
export function laneScore(cards, lane, tactic = null, ctx = {}) {
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
  // No Respect: the enemy's best player here counts for half, or nothing.
  if (cards.length && ctx.disrespect) {
    const best = steps.filter(step => step.key === 'player').reduce((top, step) => (step.value > top.value ? step : top));
    const value = ctx.disrespect === 'zero' ? best.value : Math.ceil(best.value / 2);
    total -= value;
    steps.push({ key: 'disrespect', op: '-', value, label: 'No Respect', player: best.label, total });
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
  const tacticCtx = { ...ctx, rule: cards.length > 0 && ruleFires(cards, lane) };
  if (cards.length && tactic && ctx.cancelled) {
    steps.push({ key: 'cancelled', op: '×', value: 1, label: 'Cancelled', total });
  } else if (cards.length && tactic) {
    const value = tacticMult(tactic, cards, tacticCtx);
    if (value > 1) {
      total = Math.round(total * value);
      steps.push({ key: 'tactic', op: '×', value, label: 'Tactic', total });
    }
  }
  if (cards.length && ctx.chain && !ctx.cancelled) {
    total = Math.round(total * ctx.chain);
    steps.push({ key: 'chain', op: '×', value: ctx.chain, label: 'Chain', total });
  }
  return { total, steps };
}

// The numbers behind the chips with board rules, in one place to tune.
export const CHIP_TUNING = {
  pocket: 2,            // the IGL's lane, when the lane's role rule also fires
  pocketAlone: false,   // true: only when the IGL plays the lane alone instead
  defaults: 2.5,        // three different roles on the lane
  calling: 2,           // its own lane; +0.5 per Mastermind
  chain: 1.5,           // the lane it chains to; +0.5 per Mastermind
  lockout: 1,           // its own lane (1 = none: it is a pure counter to the enemy chip)
  disrespect: 'zero',   // the enemy's best player on No Respect's lane: 'zero' or 'half'
  noRespect: 1,         // No Respect's own multiplier (1 = none)...
  noRespectFlick: 1.5,  // ...unless a Flick player shares its lane
};

const half = raw => Math.min(3, Math.max(1.5, Math.round(raw * 2) / 2));
const count = (cards, skill) => cards.filter(card => hasSkill(card, skill)).length;

/**
 * Tactics pay for who is on the lane, in half steps you can multiply in your
 * head. Most chips read the Endless numbers through the clamp; the ones whose
 * Endless rule can't work on a three-player lane have board rules of their own.
 */
export function tacticMult(tactic, cards, ctx = {}) {
  const key = TACTICS[tactic?.key]?.key;
  switch (key) {
    // The IGL's prepared play: ×2 on the lane the IGL plays.
    case 'pocket': {
      const igl = cards.some(card => card.id === ctx.igl);
      const fits = CHIP_TUNING.pocketAlone ? igl && cards.length === 1 : igl && (ctx.rule ?? true);
      return fits ? CHIP_TUNING.pocket : 1.5;
    }
    // A full mixed lane: three different roles.
    case 'defaults': return new Set(cards.map(card => card.role)).size >= 3 ? CHIP_TUNING.defaults : 1.5;
    // ×2 here, and a ×1.5 chain to the next lane (chainMult); Masterminds add.
    case 'calling': return Math.min(3, CHIP_TUNING.calling + 0.5 * count(cards, 'mastermind'));
    // Works on the enemy's best player instead (sideScores); a Flick beside it adds ×1.5.
    case 'noRespect': return count(cards, 'flick') ? CHIP_TUNING.noRespectFlick : CHIP_TUNING.noRespect;
    // Cancels the enemy's chip (sideScores); nothing of its own by default.
    case 'lockout': return CHIP_TUNING.lockout;
    default: return half(tacticActivation(tactic, cards, { bonus: 0 }).mult);
  }
}

/** The lane a Second Call chains to: the one on its left, or from the left lane, the middle. */
export function chainLane(lane) {
  return lane === 0 ? 1 : lane - 1;
}

/** What a Second Call pays on the lane it chains to: ×1.5, +0.5 per Mastermind on the chip's lane. */
export function chainMult(cards) {
  return Math.min(3, CHIP_TUNING.chain + 0.5 * count(cards, 'mastermind'));
}

const keyOf = tactic => TACTICS[tactic?.card?.key]?.key ?? null;

/**
 * One side's lanes with its own chip, before anything the enemy does: the
 * chip on its lane, a Second Call's chain, the IGL for Pocket Strat. `enemy`
 * is the other side's tactic, for the effects that reach across.
 */
export function sideScores({ roster, slots, maps, tactic = null, enemy = null }) {
  const lanes = maps.map((_, lane) => laneCards(roster, slots, lane));
  const mine = keyOf(tactic);
  const theirs = keyOf(enemy);
  const cancelled = Boolean(tactic) && theirs === 'lockout';
  const chainTo = mine === 'calling' && !cancelled ? chainLane(tactic.lane) : null;
  return maps.map((map, lane) => {
    const ctx = { igl: roster[0]?.id, cancelled };
    if (lane === chainTo) ctx.chain = chainMult(lanes[tactic.lane]);
    // The enemy's No Respect on this lane hits our best player, unless our Lock the Map cancelled it.
    if (theirs === 'noRespect' && enemy.lane === lane && keyOf(tactic) !== 'lockout') {
      ctx.disrespect = CHIP_TUNING.disrespect;
    }
    return laneScore(lanes[lane], map, tactic?.lane === lane ? tactic.card : null, ctx);
  });
}

/** The sum as players read it: the stat total, then each bonus in order. */
export function laneFormula(steps) {
  const sum = steps.filter(step => step.key === 'player').reduce((total, step) => total + step.value, 0);
  const bonuses = new Map();
  for (const step of steps) {
    if (['player', 'tactic', 'aura', 'chain', 'cancelled', 'disrespect'].includes(step.key)) continue;
    bonuses.set(step.label, (bonuses.get(step.label) ?? 0) + step.value);
  }
  const rest = [...bonuses].map(([label, value]) => `+${value} ${label}`);
  const cut = steps.find(step => step.key === 'disrespect');
  if (cut) rest.unshift(`-${cut.value} ${cut.label}`);
  for (const step of steps.filter(item => item.key === 'tactic' || item.key === 'chain')) rest.push(`×${step.value} ${step.label}`);
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
  const myLanes = maps.map((_, lane) => laneCards(you.roster, you.slots, lane));
  const theirLanes = maps.map((_, lane) => laneCards(them.roster, them.slots, lane));
  const myScores = sideScores({ ...you, maps, enemy: them.tactic });
  const theirScores = sideScores({ ...them, maps, enemy: you.tactic });
  const lanes = maps.map((map, lane) => {
    const myCards = myLanes[lane];
    const theirCards = theirLanes[lane];
    const mine = underAura(myScores[lane], theirCards);
    const theirs = underAura(theirScores[lane], myCards);
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


/** The placement and tactic lane worth the most lanes against `against`, if known. */
export function bestPlacement({ roster, maps, tactic = null, against = null, rng = null }) {
  let best = null;
  for (const slots of allPlacements(roster.length)) {
    for (let lane = 0; lane < (tactic ? LANES : 1); lane += 1) {
      const scores = sideScores({ roster, slots, maps, tactic: tactic ? { lane, card: tactic } : null }).map(score => score.total);
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
