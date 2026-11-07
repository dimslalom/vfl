// The map board prototype: five players, three maps, no dice after you commit.
// Everything is pure so the bots, the tests and the screen share one result.
import { getCardSpecialties } from '../../../shared/src/data/specialties.js';
import { mulberry32 } from '../../../shared/src/engine/perfectRun.js';
import { TACTICS, tacticActivation } from '../endless/seriesCards.js';

export const LANES = 3;
export const SQUAD_SIZE = 5;
export const LANE_CAP = 3;
export const PRIMARY_LANE = 0;

export function winsNeeded(bestOf) {
  return Math.ceil(bestOf / 2);
}

export function seriesWinner(bestOf, youWins, themWins) {
  const needed = winsNeeded(bestOf);
  if (youWins >= needed) return 'you';
  if (themWins >= needed) return 'them';
  return null;
}

// Combos add, so a lane can be read as a plain sum; only a tactic multiplies.
const ROLE_PAIR = 20;
const TEAMMATE_PAIR = 15;
const COUNTRY_PAIR = 8;
const ONE_TRICK_BONUS = 20;
const AURA_PENALTY = 15;

// Evo skill numbers, tuned by simulation (see EVO_TUNING notes in the evo lab).
export const EVO_TUNING = {
  ironclad: 4,          // its lane's flat bonus; no chip works there, either side
  lurk: 6,              // facing exactly one enemy
  velocityWindow: 4,    // dashes to a losing lane trailing by this much or less
  velocityKeep: 0.4,    // share of its stat it scores on arrival
  combustionPct: 0.2,   // the burned star's cut...
  combustionMax: 10,    // ...capped
  combustionFuel: 5,    // what Combustion costs its own lane
  phaseKeep: 0.5,       // Phase's own share while voiding the best enemy facing it
  surgeEnemy: 8,        // per enemy card on the next lane
  surgeAlly: 2,         // per own card on the next lane
  ascendanceKeep: 0.75, // share of her stat she brings to the lane she flies to
  overdriveWin: 1.2,    // other lanes when its lane wins
  overdriveTilt: 0.9,   // other lanes when its lane loses
  blackHoleKeep: 0.5,   // the pulled star's stats on arrival
};

export const BOARD_SKILLS = {
  flex: { label: 'Flex', text: 'Moves free during the rotate' },
  flick: { label: 'Flick', text: 'Alone on a lane: scores their best stat' },
  one_trick: { label: 'One Trick', text: '+20 on maps that suit their agent' },
  mastermind: { label: 'Mastermind', text: 'As IGL: two rotates' },
  aura: { label: 'Aura', text: '-15 to the enemy on their lane' },
  anchor: { label: 'Anchor', text: 'With 1 teammate: both +12' },
  first_blood: { label: 'First Blood', text: 'On primary lane: +20' },
  clutch: { label: 'Clutch', text: 'Alone vs 2+: +25' },
  synergy_link: { label: 'Synergy Link', text: 'Teammate combo with anyone' },
  overdrive: { label: 'Overdrive', text: 'Win lane: other lanes x1.2; lose it: x0.9' },
  ironclad: { label: 'Ironclad', text: 'No chips work on its lane, either side; +4' },
  lurk: { label: 'Lurk', text: 'Hidden until resolve; +6 vs 1; cannot rotate' },
  velocity: { label: 'Velocity', text: 'Dashes to a lane lost by 4 or less; arrives at 40%' },
  combustion: { label: 'Combustion', text: 'Win lane: next lane enemy star -20%; -5 fuel' },
  phase: { label: 'Phase', text: 'Best enemy facing it scores 0; it scores half' },
  timewarp: { label: 'Timewarp', text: 'Lose a series by one map: replay it, once' },
  surge: { label: 'Surge', text: 'With ally: next lane -8 per enemy, -2 per ally' },
  ascendance: { label: 'Ascendance', text: 'Lane lost: flies to a losing lane at 75%' },
  dominion: { label: 'Dominion', text: 'Plays alone, best stat; lane counts double; voids enemy chip' },
  black_hole: { label: 'Black Hole', text: 'Pulls the enemy star in at half stats' },
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

export function isLegalPlacement(slots, roster = null) {
  if (slots.length !== SQUAD_SIZE) return false;
  const counts = [0, 1, 2].map(lane => slots.filter(slot => slot === lane).length);
  return counts.every(count => count >= 1 && count <= LANE_CAP) && !crowdsCrown(slots, roster);
}

/** Dominion plays alone: no ally may share the Sovereign's lane. */
export function crowdsCrown(slots, roster) {
  if (!Array.isArray(roster)) return false; // also called as an Array#every callback
  return roster.some((card, index) => slots[index] != null && hasSkill(card, 'dominion')
    && slots.filter(slot => slot === slots[index]).length > 1);
}

/** The lane a Combustion flare or a Surge bolt reaches: the next one, or the middle from the right. */
export function nextLane(lane) {
  return lane === LANES - 1 ? lane - 1 : lane + 1;
}

/** What a lane is worth in lanes won: two with a Sovereign on it. */
export function laneWeight(lane) {
  return lane.myCards.some(card => hasSkill(card, 'dominion')) || lane.theirCards.some(card => hasSkill(card, 'dominion')) ? 2 : 1;
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
    steps.push({ key, op: value < 0 ? '-' : '+', value: Math.abs(value), label, total });
  };
  // Phase: facing one, this side's highest-rated card here is pulled into the rift and scores 0.
  const voided = ctx.phaseOut && cards.length ? cards.reduce((top, card) => (card.rating > top.rating ? card : top)) : null;
  for (const card of cards) {
    if (card === voided) {
      steps.push({ key: 'player', op: '+', value: 0, label: card.player, voided: true, total });
      continue;
    }
    // Flick alone, and the Sovereign (who always plays alone), score their best stat.
    const best = cards.length === 1 && (hasSkill(card, 'flick') || hasSkill(card, 'dominion'));
    const stat = best ? Math.max(...Object.values(card.stats)) : card.stats[lane.stat];
    // Phase: its own share while it holds the rift open.
    const phasing = hasSkill(card, 'phase') && (ctx.enemyCount ?? 0) > 0;
    add('player', phasing ? Math.round(stat * EVO_TUNING.phaseKeep) : stat, card.player);
  }
  const hasIronclad = cards.some(card => hasSkill(card, 'ironclad'));
  // No Respect: the enemy's best player here counts for half, or nothing.
  // Bastion (Ironclad) is immune to tactic debuffs on its lane.
  if (cards.length && ctx.disrespect && !hasIronclad) {
    const best = steps.filter(step => step.key === 'player').reduce((top, step) => (step.value > top.value ? step : top));
    const value = ctx.disrespect === 'zero' ? best.value : Math.ceil(best.value / 2);
    total -= value;
    steps.push({ key: 'disrespect', op: '-', value, label: 'No Respect', player: best.label, total });
  }
  // Ironclad: the plate holds its lane; no chip works here, either side.
  if (cards.length && hasIronclad) add('ironclad', EVO_TUNING.ironclad, 'Ironclad');
  if (cards.length && ruleFires(cards, lane)) add('rule', ROLE_PAIR, 'Roles');
  for (const card of cards) {
    if (hasSkill(card, 'one_trick') && card.agents?.length === 1 && lane.agents?.includes(card.agents[0])) {
      add('trick', ONE_TRICK_BONUS, 'Trick');
    }
  }
  // Anchor: When sharing a lane with exactly 1 teammate, both gain +12 (+24 to lane).
  if (cards.length === 2 && cards.some(card => hasSkill(card, 'anchor'))) {
    add('anchor', 24, 'Anchor');
  }
  // First Blood: On the primary (leftmost) lane, +20 opening duel bonus per player.
  if (ctx.laneIndex === PRIMARY_LANE) {
    for (const card of cards) {
      if (hasSkill(card, 'first_blood')) add('first_blood', 20, 'First Blood');
    }
  }
  // Clutch: Alone on a lane against 2 or more enemies, gains +25 power.
  if (cards.length === 1 && hasSkill(cards[0], 'clutch') && (ctx.enemyCount >= 2)) {
    add('clutch', 25, 'Clutch');
  }
  // Lurk: hidden until resolve; it pays off facing exactly one enemy.
  if (cards.length && cards.some(card => hasSkill(card, 'lurk')) && ctx.enemyCount === 1) {
    add('lurk', EVO_TUNING.lurk, 'Lurk');
  }
  // Combustion burns its own lane's fuel; the flare it buys lands at resolve.
  if (cards.some(card => hasSkill(card, 'combustion'))) add('combustion_fuel', -EVO_TUNING.combustionFuel, 'Fuel');
  for (const [a, b] of pairs(cards)) {
    if (a.org && a.org === b.org) add('teammates', TEAMMATE_PAIR, 'Team');
    else if (hasSkill(a, 'synergy_link') || hasSkill(b, 'synergy_link')) add('synergy_link', TEAMMATE_PAIR, 'Link');
    else if (a.nationality && a.nationality === b.nationality) add('country', COUNTRY_PAIR, 'Nation');
  }
  const tacticCtx = { ...ctx, rule: cards.length > 0 && ruleFires(cards, lane) };
  if (cards.length && tactic && hasIronclad) {
    steps.push({ key: 'cancelled', op: '×', value: 1, label: 'Ironclad', total });
  } else if (cards.length && tactic && ctx.cancelled) {
    steps.push({ key: 'cancelled', op: '×', value: 1, label: 'Cancelled', total });
  } else if (cards.length && tactic) {
    const value = tacticMult(tactic, cards, tacticCtx);
    if (value > 1) {
      total = Math.round(total * value);
      steps.push({ key: 'tactic', op: '×', value, label: 'Tactic', total });
    }
  }
  if (cards.length && ctx.chain && !ctx.cancelled && !hasIronclad) {
    total = Math.round(total * ctx.chain);
    steps.push({ key: 'chain', op: '×', value: ctx.chain, label: 'Chain', total });
  }
  return { total, steps };
}

// Chips whose rarity differs on the board from Endless: Pocket Strat's board
// rule wins as often as the uncommons, so it is dealt and printed as one.
const BOARD_TIERS = { pocket: 'uncommon' };

/** A chip's rarity on the board and in Club. */
export function chipTier(key) {
  const tactic = TACTICS[key];
  return BOARD_TIERS[tactic?.key] ?? tactic?.tier ?? 'common';
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

/** A side's chips as a list: `tactics`, or the older single `tactic`, either way. */
export function chipList(tactics) {
  return (Array.isArray(tactics) ? tactics : tactics ? [tactics] : []).filter(Boolean);
}

/**
 * One side's lanes with its own chips, before anything the enemy does. Each
 * lane holds at most one chip per side, and the enemy's chip on the same lane
 * is the only one that can reach it: Lock the Map cancels the chip facing it,
 * No Respect cuts the best player facing it. A Second Call chains to the next
 * lane only when that lane carries none of your own chips. `tactic` and
 * `enemy` each take one chip or a list.
 */
export function sideScores({ roster, slots, maps, tactic = null, tactics = null, enemy = null, enemyCounts = null, enemyRoster = null, enemySlots = null }) {
  const lanes = maps.map((_, lane) => laneCards(roster, slots, lane));
  const enemyLanes = enemyRoster && enemySlots ? maps.map((_, lane) => laneCards(enemyRoster, enemySlots, lane)) : null;
  const mine = chipList(tactics ?? tactic);
  const theirs = chipList(enemy);
  const on = (list, lane) => list.find(chip => chip.lane === lane) ?? null;
  const cancelled = lane => Boolean(on(mine, lane)) && (keyOf(on(theirs, lane)) === 'lockout' || (enemyLanes?.[lane] && enemyLanes[lane].some(c => hasSkill(c, 'dominion'))));
  const chains = {};
  for (const chip of mine) {
    if (keyOf(chip) !== 'calling' || cancelled(chip.lane)) continue;
    const to = chainLane(chip.lane);
    if (on(mine, to)) continue;
    chains[to] = Math.max(chains[to] ?? 1, chainMult(lanes[chip.lane]));
  }

  return maps.map((map, lane) => {
    const oppCards = enemyLanes?.[lane] ?? [];
    const ctx = {
      igl: roster[0]?.id,
      laneIndex: lane,
      enemyCount: enemyCounts?.[lane] ?? (theirs.length ? 1 : 0),
      // Facing a Phase card: this side's best card here falls into the rift.
      phaseOut: oppCards.some(c => hasSkill(c, 'phase')),
      cancelled: cancelled(lane),
    };
    if (chains[lane]) ctx.chain = chains[lane];
    // The enemy's No Respect hits our best player here, unless our own Lock the Map faces it.
    if (keyOf(on(theirs, lane)) === 'noRespect' && keyOf(on(mine, lane)) !== 'lockout') {
      ctx.disrespect = CHIP_TUNING.disrespect;
    }
    return laneScore(lanes[lane], map, on(mine, lane)?.card ?? null, ctx);
  });
}

/** The sum as players read it: the stat total, then each bonus in order. */
export function laneFormula(steps) {
  const sum = steps.filter(step => step.key === 'player').reduce((total, step) => total + step.value, 0);
  const bonuses = new Map();
  const penalties = new Map();
  for (const step of steps) {
    if (['player', 'tactic', 'aura', 'chain', 'cancelled', 'disrespect', 'overdrive'].includes(step.key)) continue;
    if (step.op === '-') {
      penalties.set(step.label, (penalties.get(step.label) ?? 0) + step.value);
    } else {
      bonuses.set(step.label, (bonuses.get(step.label) ?? 0) + step.value);
    }
  }
  const rest = [...bonuses].map(([label, value]) => `+${value} ${label}`);
  const cut = steps.find(step => step.key === 'disrespect');
  if (cut) rest.unshift(`-${cut.value} ${cut.label}`);
  for (const [label, value] of penalties) rest.push(`-${value} ${label}`);
  for (const step of steps.filter(item => item.key === 'tactic' || item.key === 'chain' || item.key === 'overdrive')) rest.push(`×${step.value} ${step.label}`);
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
  // Black Hole rewrites a roster entry (the pulled star arrives weakened), so work on copies.
  you = { ...you, roster: [...you.roster] };
  them = { ...them, roster: [...them.roster] };
  const pulled = card => ({
    ...card,
    pulled: true,
    stats: Object.fromEntries(Object.entries(card.stats).map(([key, value]) => [key, Math.round(value * EVO_TUNING.blackHoleKeep)])),
  });
  let youSlots = [...you.slots];
  let themSlots = [...them.slots];
  const displacements = [];
  const velocityMoves = [];

  // 1. Singularity (Event Horizon): Pulls the opponent's highest-rated player from another lane into this lane!
  for (let lane = 0; lane < LANES; lane++) {
    const youCards = laneCards(you.roster, youSlots, lane);
    if (youCards.some(c => hasSkill(c, 'black_hole'))) {
      let bestOppIdx = -1;
      let bestOppRating = -1;
      them.roster.forEach((c, idx) => {
        if (themSlots[idx] !== lane && c.rating > bestOppRating) {
          bestOppRating = c.rating;
          bestOppIdx = idx;
        }
      });
      if (bestOppIdx !== -1) {
        const fromLane = themSlots[bestOppIdx];
        const oppCardsOnLane = them.roster.map((c, idx) => ({ c, idx })).filter(item => themSlots[item.idx] === lane);
        if (oppCardsOnLane.length >= 3) {
          const lowest = oppCardsOnLane.reduce((low, item) => (item.c.rating < low.c.rating ? item : low));
          themSlots[lowest.idx] = fromLane;
        }
        themSlots[bestOppIdx] = lane;
        displacements.push({ side: 'them', card: them.roster[bestOppIdx], fromLane, toLane: lane, reason: 'black_hole' });
        them.roster[bestOppIdx] = pulled(them.roster[bestOppIdx]);
      }
    }
  }
  for (let lane = 0; lane < LANES; lane++) {
    const themCards = laneCards(them.roster, themSlots, lane);
    if (themCards.some(c => hasSkill(c, 'black_hole'))) {
      let bestYouIdx = -1;
      let bestYouRating = -1;
      you.roster.forEach((c, idx) => {
        if (youSlots[idx] !== lane && c.rating > bestYouRating) {
          bestYouRating = c.rating;
          bestYouIdx = idx;
        }
      });
      if (bestYouIdx !== -1) {
        const fromLane = youSlots[bestYouIdx];
        const youCardsOnLane = you.roster.map((c, idx) => ({ c, idx })).filter(item => youSlots[item.idx] === lane);
        if (youCardsOnLane.length >= 3) {
          const lowest = youCardsOnLane.reduce((low, item) => (item.c.rating < low.c.rating ? item : low));
          youSlots[lowest.idx] = fromLane;
        }
        youSlots[bestYouIdx] = lane;
        displacements.push({ side: 'you', card: you.roster[bestYouIdx], fromLane, toLane: lane, reason: 'black_hole' });
        you.roster[bestYouIdx] = pulled(you.roster[bestYouIdx]);
      }
    }
  }

  const computeScores = (ySlots, tSlots) => {
    const myLanes = maps.map((_, lane) => laneCards(you.roster, ySlots, lane));
    const theirLanes = maps.map((_, lane) => laneCards(them.roster, tSlots, lane));
    const myEnemyCounts = theirLanes.map(cards => cards.length);
    const theirEnemyCounts = myLanes.map(cards => cards.length);
    const myScores = sideScores({ ...you, slots: ySlots, maps, enemy: chipList(them.tactics ?? them.tactic), enemyCounts: myEnemyCounts, enemyRoster: them.roster, enemySlots: tSlots });
    const theirScores = sideScores({ ...them, slots: tSlots, maps, enemy: chipList(you.tactics ?? you.tactic), enemyCounts: theirEnemyCounts, enemyRoster: you.roster, enemySlots: ySlots });
    return maps.map((map, lane) => {
      const myCards = myLanes[lane];
      const theirCards = theirLanes[lane];
      const mine = underAura(myScores[lane], theirCards);
      const theirs = underAura(theirScores[lane], myCards);
      const rawMine = myCards.reduce((sum, card) => sum + card.rating, 0);
      const rawTheirs = theirCards.reduce((sum, card) => sum + card.rating, 0);
      const winner = mine.total !== theirs.total
        ? (mine.total > theirs.total ? 'you' : 'them')
        : rawMine === rawTheirs ? null : (rawMine > rawTheirs ? 'you' : 'them');
      return { mine, theirs, winner, rawMine, rawTheirs, myCards, theirCards };
    });
  };

  let lanes = computeScores(youSlots, themSlots);

  // Every pass below works for either side; `sides` names the halves of a lane for each.
  const decide = lane => (lane.mine.total !== lane.theirs.total
    ? (lane.mine.total > lane.theirs.total ? 'you' : 'them')
    : lane.rawMine === lane.rawTheirs ? null : (lane.rawMine > lane.rawTheirs ? 'you' : 'them'));
  const sides = {
    you: { own: 'mine', foe: 'theirs', cards: 'myCards', foeCards: 'theirCards', other: 'them' },
    them: { own: 'theirs', foe: 'mine', cards: 'theirCards', foeCards: 'myCards', other: 'you' },
  };
  const margin = (lane, k) => lane[k.own].total - lane[k.foe].total;
  const nudge = (lane, half, value, step) => {
    const total = Math.max(0, lane[half].total + value);
    lane[half] = { ...lane[half], total, steps: [...lane[half].steps, { ...step, op: value < 0 ? '-' : '+', value: Math.abs(value), total }] };
  };
  const effects = [];

  // 2. Velocity: dashes to its side's closest losing lane within the window, even when
  // leaving costs the lane it stood on. It arrives spent, scoring a share of its stat.
  for (const who of ['you', 'them']) {
    const k = sides[who];
    const roster = who === 'you' ? you.roster : them.roster;
    roster.forEach((card, index) => {
      if (!hasSkill(card, 'velocity')) return;
      const slots = who === 'you' ? youSlots : themSlots;
      const from = slots[index];
      if (slots.filter(slot => slot === from).length < 2) return;
      const target = lanes
        .map((lane, idx) => ({ lane, idx }))
        .filter(({ lane, idx }) => idx !== from && lane.winner === k.other && -margin(lane, k) <= EVO_TUNING.velocityWindow
          && slots.filter(slot => slot === idx).length < LANE_CAP)
        .sort((a, b) => margin(b.lane, k) - margin(a.lane, k))[0];
      if (!target) return;
      const next = [...slots];
      next[index] = target.idx;
      if (who === 'you') youSlots = next; else themSlots = next;
      lanes = computeScores(youSlots, themSlots);
      const spent = Math.ceil(card.stats[maps[target.idx].stat] * (1 - EVO_TUNING.velocityKeep));
      nudge(lanes[target.idx], k.own, -spent, { key: 'fatigue', label: 'Fatigue' });
      lanes[target.idx].winner = decide(lanes[target.idx]);
      velocityMoves.push({ side: who, card, fromLane: from, toLane: target.idx, fatigue: spent });
    });
  }

  // 3. Combustion: winning its lane burns the enemy star on the next lane.
  lanes.forEach((lane, idx) => {
    for (const who of ['you', 'them']) {
      const k = sides[who];
      if (lane.winner !== who || !lane[k.cards].some(card => hasSkill(card, 'combustion'))) continue;
      const to = nextLane(idx);
      const target = lanes[to];
      if (!target[k.foeCards].length || !target[k.foe].total) continue;
      const star = target[k.foeCards].reduce((top, card) => (card.rating > top.rating ? card : top));
      const value = Math.min(EVO_TUNING.combustionMax, Math.round(star.rating * EVO_TUNING.combustionPct));
      nudge(target, k.foe, -value, { key: 'combustion', label: 'Combustion' });
      target.winner = decide(target);
      effects.push({ key: 'combustion', side: who, fromLane: idx, toLane: to, card: star, value });
    }
  });

  // 4. Surge: with an ally on its lane, chain lightning hits every card on the next lane, its own side less.
  lanes.forEach((lane, idx) => {
    for (const who of ['you', 'them']) {
      const k = sides[who];
      if (lane[k.cards].length < 2 || !lane[k.cards].some(card => hasSkill(card, 'surge'))) continue;
      const to = nextLane(idx);
      const target = lanes[to];
      const foes = target[k.foeCards].length;
      const allies = target[k.cards].length;
      if (foes) nudge(target, k.foe, -EVO_TUNING.surgeEnemy * foes, { key: 'surge', label: 'Surge' });
      if (allies) nudge(target, k.own, -EVO_TUNING.surgeAlly * allies, { key: 'surge', label: 'Surge' });
      target.winner = decide(target);
      effects.push({ key: 'surge', side: who, fromLane: idx, toLane: to, foes, allies });
    }
  });

  // 5. Ascendance: when her lane is lost she leaves it, taking her score with her,
  // and lands on her side's closest losing lane with a share of her stat.
  for (const who of ['you', 'them']) {
    const k = sides[who];
    const home = lanes.findIndex(lane => lane[k.cards].some(card => hasSkill(card, 'ascendance')));
    if (home < 0 || lanes[home].winner !== k.other) continue;
    const needy = lanes
      .map((lane, idx) => ({ lane, idx }))
      .filter(({ lane, idx }) => idx !== home && lane.winner === k.other)
      .sort((a, b) => margin(b.lane, k) - margin(a.lane, k))[0];
    if (!needy) continue;
    const valk = lanes[home][k.cards].find(card => hasSkill(card, 'ascendance'));
    const left = valk.stats[maps[home].stat];
    const brought = Math.round(valk.stats[maps[needy.idx].stat] * EVO_TUNING.ascendanceKeep);
    nudge(lanes[home], k.own, -left, { key: 'ascendance', label: 'Ascendance' });
    nudge(needy.lane, k.own, brought, { key: 'ascendance', label: 'Ascendance' });
    lanes[home].winner = decide(lanes[home]);
    needy.lane.winner = decide(needy.lane);
    effects.push({ key: 'ascendance', side: who, card: valk, fromLane: home, toLane: needy.idx, value: brought });
  }

  // 6. Overdrive: winning its lane lifts its side's other lanes; losing it tilts them.
  for (const who of ['you', 'them']) {
    const k = sides[who];
    lanes.forEach((lane, idx) => {
      if (!lane[k.cards].some(card => hasSkill(card, 'overdrive')) || lane.winner === null) return;
      const mult = lane.winner === who ? EVO_TUNING.overdriveWin : EVO_TUNING.overdriveTilt;
      lanes.forEach((other, j) => {
        if (j === idx || !other[k.own].total) return;
        const total = Math.round(other[k.own].total * mult);
        other[k.own] = { ...other[k.own], total, steps: [...other[k.own].steps, { key: 'overdrive', op: '×', value: mult, label: mult > 1 ? 'Momentum' : 'Tilt', total }] };
      });
      effects.push({ key: 'overdrive', side: who, fromLane: idx, mult });
    });
  }
  lanes = lanes.map(lane => ({ ...lane, winner: decide(lane), weight: laneWeight(lane) }));

  // A Sovereign's lane counts as two lanes won, for whoever takes it.
  const youWon = lanes.filter(lane => lane.winner === 'you').reduce((sum, lane) => sum + lane.weight, 0);
  const themWon = lanes.filter(lane => lane.winner === 'them').reduce((sum, lane) => sum + lane.weight, 0);
  const youTotal = lanes.reduce((sum, lane) => sum + lane.mine.total, 0);
  const themTotal = lanes.reduce((sum, lane) => sum + lane.theirs.total, 0);
  const winner = youWon !== themWon ? (youWon > themWon ? 'you' : 'them') : (youTotal >= themTotal ? 'you' : 'them');
  return { lanes, youWon, themWon, youTotal, themTotal, winner, displacements, velocityMoves, effects, youSlots, themSlots };
}


/** Every way to lay `count` chips on different lanes, as lane lists. */
function chipLayouts(count) {
  const out = [];
  const walk = (used) => {
    if (used.length === count) { out.push(used); return; }
    for (let lane = 0; lane < LANES; lane += 1) if (!used.includes(lane)) walk([...used, lane]);
  };
  walk([]);
  return out;
}

/**
 * The placement and chip lanes worth the most lanes against `against`, if
 * known. `tactics` (or one `tactic`) are chip cards; each takes its own lane,
 * up to one per lane.
 */
export function bestPlacement({ roster, maps, tactic = null, tactics = null, against = null, rng = null }) {
  const cards = (tactics ?? (tactic ? [tactic] : [])).filter(Boolean).slice(0, LANES);
  const layouts = chipLayouts(cards.length);
  let best = null;
  for (const slots of allPlacements(roster.length)) {
    if (crowdsCrown(slots, roster)) continue;
    for (const lanes of layouts) {
      const chips = cards.map((card, index) => ({ lane: lanes[index], card }));
      const scores = sideScores({ roster, slots, maps, tactics: chips }).map(score => score.total);
      const value = against
        ? scores.filter((score, index) => score > against[index]).length * 1000 + scores.reduce((a, b) => a + b, 0)
        : [...scores].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) + Math.min(...scores) * 0.2;
      const noise = rng ? rng() * 40 : 0;
      if (!best || value + noise > best.value) best = { slots, value: value + noise, chips };
    }
  }
  return { slots: best.slots, tactics: best.chips, tactic: best.chips[0] ?? null };
}

/** How many non-Flex players the IGL may move. The leftmost card is the IGL. */
export function rotateMoves(roster) {
  return hasSkill(roster[0], 'mastermind') ? 2 : 1;
}

/** Whether `next` is a board the IGL can reach from `locked` this rotate. */
export function isLegalRotation(locked, next, roster) {
  if (!isLegalPlacement(next, roster)) return false;
  // A lurker is committed in the smoke: it never moves at the rotate.
  if (next.some((slot, index) => slot !== locked[index] && hasSkill(roster[index], 'lurk'))) return false;
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
 * opponent places with a little noise and shows `shown` of its five (none: both
 * boards turn over together at lock in), then both IGLs answer the revealed
 * board at the same time.
 */
export function playBoard({ seed, you, them, maps, shown = 0, skill = true }) {
  const rng = mulberry32(seed);
  const theirChips = them.tactics ?? (them.tactic ? [them.tactic] : []);
  const myChips = you.tactics ?? (you.tactic ? [you.tactic] : []);
  const opp = bestPlacement({ roster: them.roster, maps, tactics: theirChips, rng });
  const seen = opp.slots.map((slot, index) => (index < shown ? slot : null));
  const estimate = maps.map((map, lane) => laneScore(them.roster.filter((_, i) => seen[i] === lane), map).total * 1.6);
  const placed = skill
    ? bestPlacement({ roster: you.roster, maps, tactics: myChips, against: shown ? estimate : null })
    : { slots: allPlacements()[Math.floor(rng() * 150) % allPlacements().length], tactics: myChips.slice(0, LANES).map((card, lane) => ({ lane, card })) };
  const side = (roster, plan) => ({ roster, slots: plan.slots, tactics: plan.tactics });
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
