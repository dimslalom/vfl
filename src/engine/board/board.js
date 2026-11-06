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
  overdrive: { label: 'Overdrive', text: 'Win lane: +0.2x other lanes' },
  ironclad: { label: 'Ironclad', text: 'Lane immune to tactic debuffs; +3' },
  lurk: { label: 'Lurk', text: 'Stealthed until resolve; +4 vs 1' },
  velocity: { label: 'Velocity', text: 'Flashes to clutched losing lane' },
  combustion: { label: 'Combustion', text: 'Win lane: -20% adjacent enemy star' },
  phase: { label: 'Phase', text: 'Siphons +4 from facing synergy' },
  timewarp: { label: 'Timewarp', text: 'Losing by <=6: +6 rewind surge' },
  surge: { label: 'Surge', text: 'With ally: -4 adjacent enemy lane' },
  ascendance: { label: 'Ascendance', text: 'Trailing <=10: +8 to ally, or +4' },
  dominion: { label: 'Dominion', text: 'Collects +2 per enemy synergy (max +8)' },
  black_hole: { label: 'Black Hole', text: 'Pulls enemy star from other lane' },
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
  const hasIronclad = cards.some(card => hasSkill(card, 'ironclad'));
  // No Respect: the enemy's best player here counts for half, or nothing.
  // Bastion (Ironclad) is immune to tactic debuffs on its lane.
  if (cards.length && ctx.disrespect && !hasIronclad) {
    const best = steps.filter(step => step.key === 'player').reduce((top, step) => (step.value > top.value ? step : top));
    const value = ctx.disrespect === 'zero' ? best.value : Math.ceil(best.value / 2);
    total -= value;
    steps.push({ key: 'disrespect', op: '-', value, label: 'No Respect', player: best.label, total });
  }
  // Ironclad: Fortress anchor grants +3 defensive armor to its lane.
  if (cards.length && hasIronclad) {
    add('ironclad', 3, 'Ironclad');
  }
  if (cards.length && ruleFires(cards, lane) && !ctx.phaseOut) add('rule', ROLE_PAIR, 'Roles');
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
  // Lurk: Shrouded from opponent until resolve; +4 duel power when opposing lane has only 1 card.
  if (cards.length && cards.some(card => hasSkill(card, 'lurk')) && ctx.enemyCount === 1) {
    add('lurk', 4, 'Lurk');
  }
  // Phase: Siphons +4 from facing enemy if enemy has active Team or Nation synergy.
  if (cards.length && cards.some(card => hasSkill(card, 'phase')) && ctx.enemyHasSynergy) {
    add('phase', 4, 'Phase');
  }
  // Dominion: Demands tribute from enemy ranks; collects 2 points per active enemy synergy across all lanes (max +8).
  if (cards.length && cards.some(card => hasSkill(card, 'dominion'))) {
    const bonus = Math.min(8, (ctx.enemyTotalSynergies ?? 0) * 2);
    if (bonus > 0) add('dominion', bonus, 'Dominion');
  }
  for (const [a, b] of pairs(cards)) {
    if (a.org && a.org === b.org) add('teammates', TEAMMATE_PAIR, 'Team');
    else if (hasSkill(a, 'synergy_link') || hasSkill(b, 'synergy_link')) add('synergy_link', TEAMMATE_PAIR, 'Link');
    else if (a.nationality && a.nationality === b.nationality && !ctx.phaseOut) add('country', COUNTRY_PAIR, 'Nation');
  }
  const tacticCtx = { ...ctx, rule: cards.length > 0 && ruleFires(cards, lane) };
  if (cards.length && tactic && ctx.cancelled && !hasIronclad) {
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

  let enemyTotalSynergies = 0;
  if (enemyLanes) {
    for (const oppCards of enemyLanes) {
      for (const [a, b] of pairs(oppCards)) {
        if (a.org && a.org === b.org) enemyTotalSynergies += 1;
        else if (hasSkill(a, 'synergy_link') || hasSkill(b, 'synergy_link')) enemyTotalSynergies += 1;
        else if (a.nationality && a.nationality === b.nationality) enemyTotalSynergies += 1;
      }
    }
  }
  if (theirs.length) enemyTotalSynergies += theirs.length;

  return maps.map((map, lane) => {
    const oppCards = enemyLanes?.[lane] ?? [];
    let enemyHasSynergy = false;
    for (const [a, b] of pairs(oppCards)) {
      if ((a.org && a.org === b.org) || hasSkill(a, 'synergy_link') || hasSkill(b, 'synergy_link') || (a.nationality && a.nationality === b.nationality)) {
        enemyHasSynergy = true;
        break;
      }
    }
    const ctx = {
      igl: roster[0]?.id,
      laneIndex: lane,
      enemyCount: enemyCounts?.[lane] ?? (theirs.length ? 1 : 0),
      enemyRatings: oppCards.map(c => c.rating),
      enemyHasSynergy,
      enemyTotalSynergies,
      phaseOut: Boolean(oppCards.some(c => hasSkill(c, 'phase'))),
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

  // 2. Velocity (Swift Flank): Automatically rotates to flip a losing lane during resolve (-4 sprint fatigue).
  for (let i = 0; i < you.roster.length; i++) {
    const card = you.roster[i];
    if (hasSkill(card, 'velocity')) {
      const curLane = youSlots[i];
      for (let targetLane = 0; targetLane < LANES; targetLane++) {
        if (targetLane === curLane) continue;
        const targetCards = laneCards(you.roster, youSlots, targetLane);
        if (targetCards.length >= 3) continue;
        if (lanes[targetLane].winner === 'them') {
          const testSlots = [...youSlots];
          testSlots[i] = targetLane;
          const testLanes = computeScores(testSlots, themSlots);
          const flippedWin = testLanes[targetLane].mine.total - 4 > testLanes[targetLane].theirs.total;
          const curLaneOk = lanes[curLane].winner !== 'you' || testLanes[curLane].winner === 'you';
          if (flippedWin && curLaneOk) {
            youSlots = testSlots;
            velocityMoves.push({ side: 'you', card, fromLane: curLane, toLane: targetLane, fatigue: 4 });
            lanes = computeScores(youSlots, themSlots);
            const destLane = lanes[targetLane];
            const newTotal = Math.max(0, destLane.mine.total - 4);
            destLane.mine = { ...destLane.mine, total: newTotal, steps: [...destLane.mine.steps, { key: 'fatigue', op: '-', value: 4, label: 'Fatigue', total: newTotal }] };
            destLane.winner = destLane.mine.total !== destLane.theirs.total
              ? (destLane.mine.total > destLane.theirs.total ? 'you' : 'them')
              : destLane.rawMine === destLane.rawTheirs ? null : (destLane.rawMine > destLane.rawTheirs ? 'you' : 'them');
            break;
          }
        }
      }
    }
  }

  // 3. Solstice (Solar Eclipse): Winning this lane blinds adjacent enemy star by 20% (up to -10 max).
  lanes.forEach((lane, idx) => {
    if (lane.winner === 'you' && lane.myCards.some(c => hasSkill(c, 'combustion'))) {
      const adj = (idx + 1) % LANES;
      const adjLane = lanes[adj];
      if (adjLane.theirs.total > 0 && adjLane.theirCards.length > 0) {
        const topEnemy = adjLane.theirCards.reduce((top, c) => (c.rating > top.rating ? c : top));
        const penalty = Math.min(10, Math.round(topEnemy.rating * 0.2));
        if (penalty > 0) {
          const total = Math.max(0, adjLane.theirs.total - penalty);
          adjLane.theirs = { ...adjLane.theirs, total, steps: [...adjLane.theirs.steps, { key: 'combustion', op: '-', value: penalty, label: 'Solar Eclipse', total }] };
          adjLane.winner = adjLane.mine.total !== adjLane.theirs.total
            ? (adjLane.mine.total > adjLane.theirs.total ? 'you' : 'them')
            : adjLane.rawMine === adjLane.rawTheirs ? null : (adjLane.rawMine > adjLane.rawTheirs ? 'you' : 'them');
        }
      }
    }
    if (lane.winner === 'them' && lane.theirCards.some(c => hasSkill(c, 'combustion'))) {
      const adj = (idx + 1) % LANES;
      const adjLane = lanes[adj];
      if (adjLane.mine.total > 0 && adjLane.myCards.length > 0) {
        const topCard = adjLane.myCards.reduce((top, c) => (c.rating > top.rating ? c : top));
        const penalty = Math.min(10, Math.round(topCard.rating * 0.2));
        if (penalty > 0) {
          const total = Math.max(0, adjLane.mine.total - penalty);
          adjLane.mine = { ...adjLane.mine, total, steps: [...adjLane.mine.steps, { key: 'combustion', op: '-', value: penalty, label: 'Solar Eclipse', total }] };
          adjLane.winner = adjLane.mine.total !== adjLane.theirs.total
            ? (adjLane.mine.total > adjLane.theirs.total ? 'you' : 'them')
            : adjLane.rawMine === adjLane.rawTheirs ? null : (adjLane.rawMine > adjLane.rawTheirs ? 'you' : 'them');
        }
      }
    }
  });

  // 4. Tempest (Chain Lightning): When paired with an ally on lane, shocks adjacent enemy lane for -4.
  lanes.forEach((lane, idx) => {
    if (lane.myCards.length >= 2 && lane.myCards.some(c => hasSkill(c, 'surge'))) {
      const adj = (idx + 1) % LANES;
      const adjLane = lanes[adj];
      if (adjLane.theirs.total > 0) {
        const total = Math.max(0, adjLane.theirs.total - 4);
        adjLane.theirs = { ...adjLane.theirs, total, steps: [...adjLane.theirs.steps, { key: 'surge', op: '-', value: 4, label: 'Chain Lightning', total }] };
        adjLane.winner = adjLane.mine.total !== adjLane.theirs.total
          ? (adjLane.mine.total > adjLane.theirs.total ? 'you' : 'them')
          : adjLane.rawMine === adjLane.rawTheirs ? null : (adjLane.rawMine > adjLane.rawTheirs ? 'you' : 'them');
      }
    }
    if (lane.theirCards.length >= 2 && lane.theirCards.some(c => hasSkill(c, 'surge'))) {
      const adj = (idx + 1) % LANES;
      const adjLane = lanes[adj];
      if (adjLane.mine.total > 0) {
        const total = Math.max(0, adjLane.mine.total - 4);
        adjLane.mine = { ...adjLane.mine, total, steps: [...adjLane.mine.steps, { key: 'surge', op: '-', value: 4, label: 'Chain Lightning', total }] };
        adjLane.winner = adjLane.mine.total !== adjLane.theirs.total
          ? (adjLane.mine.total > adjLane.theirs.total ? 'you' : 'them')
          : adjLane.rawMine === adjLane.rawTheirs ? null : (adjLane.rawMine > adjLane.rawTheirs ? 'you' : 'them');
      }
    }
  });

  // 5. Chronos (Temporal Surge): If an allied lane is losing by 6 or fewer, grants +6 rewind surge.
  const youHasChrono = lanes.some(l => l.myCards.some(c => hasSkill(c, 'timewarp')));
  if (youHasChrono) {
    const clutchable = lanes.find(l => l.winner === 'them' && (l.theirs.total - l.mine.total) <= 6);
    if (clutchable) {
      const total = clutchable.mine.total + 6;
      clutchable.mine = { ...clutchable.mine, total, steps: [...clutchable.mine.steps, { key: 'timewarp', op: '+', value: 6, label: 'Temporal Surge', total }] };
      clutchable.winner = clutchable.mine.total !== clutchable.theirs.total
        ? (clutchable.mine.total > clutchable.theirs.total ? 'you' : 'them')
        : clutchable.rawMine === clutchable.rawTheirs ? null : (clutchable.rawMine > clutchable.rawTheirs ? 'you' : 'them');
    }
  }
  const themHasChrono = lanes.some(l => l.theirCards.some(c => hasSkill(c, 'timewarp')));
  if (themHasChrono) {
    const clutchable = lanes.find(l => l.winner === 'you' && (l.mine.total - l.theirs.total) <= 6);
    if (clutchable) {
      const total = clutchable.theirs.total + 6;
      clutchable.theirs = { ...clutchable.theirs, total, steps: [...clutchable.theirs.steps, { key: 'timewarp', op: '+', value: 6, label: 'Temporal Surge', total }] };
      clutchable.winner = clutchable.mine.total !== clutchable.theirs.total
        ? (clutchable.mine.total > clutchable.theirs.total ? 'you' : 'them')
        : clutchable.rawMine === clutchable.rawTheirs ? null : (clutchable.rawMine > clutchable.rawTheirs ? 'you' : 'them');
    }
  }

  // 6. Valkyrie (Divine Blessing): If an allied lane is trailing by 10 or fewer, grants +8 to that lane, or +4 to self.
  const youValk = lanes.find(l => l.myCards.some(c => hasSkill(c, 'ascendance')));
  if (youValk) {
    const needyLane = lanes.find(l => l !== youValk && l.winner === 'them' && (l.theirs.total - l.mine.total) <= 10);
    const targetLane = needyLane ?? youValk;
    const bonus = needyLane ? 8 : 4;
    const total = targetLane.mine.total + bonus;
    targetLane.mine = { ...targetLane.mine, total, steps: [...targetLane.mine.steps, { key: 'ascendance', op: '+', value: bonus, label: 'Divine Blessing', total }] };
    targetLane.winner = targetLane.mine.total !== targetLane.theirs.total
      ? (targetLane.mine.total > targetLane.theirs.total ? 'you' : 'them')
      : targetLane.rawMine === targetLane.rawTheirs ? null : (targetLane.rawMine > targetLane.rawTheirs ? 'you' : 'them');
  }
  const themValk = lanes.find(l => l.theirCards.some(c => hasSkill(c, 'ascendance')));
  if (themValk) {
    const needyLane = lanes.find(l => l !== themValk && l.winner === 'you' && (l.mine.total - l.theirs.total) <= 10);
    const targetLane = needyLane ?? themValk;
    const bonus = needyLane ? 8 : 4;
    const total = targetLane.theirs.total + bonus;
    targetLane.theirs = { ...targetLane.theirs, total, steps: [...targetLane.theirs.steps, { key: 'ascendance', op: '+', value: bonus, label: 'Divine Blessing', total }] };
    targetLane.winner = targetLane.mine.total !== targetLane.theirs.total
      ? (targetLane.mine.total > targetLane.theirs.total ? 'you' : 'them')
      : targetLane.rawMine === targetLane.rawTheirs ? null : (targetLane.rawMine > targetLane.rawTheirs ? 'you' : 'them');
  }

  // 7. Overdrive (+0.2x): Boost all other lanes when lane is won
  const youMultBoosts = lanes.map((l) => (l.winner === 'you' && l.myCards.some(c => hasSkill(c, 'overdrive')) ? 0.2 : 0));
  const themMultBoosts = lanes.map((l) => (l.winner === 'them' && l.theirCards.some(c => hasSkill(c, 'overdrive')) ? 0.2 : 0));
  const totalYouBoost = youMultBoosts.reduce((a, b) => a + b, 0);
  const totalThemBoost = themMultBoosts.reduce((a, b) => a + b, 0);

  if (totalYouBoost > 0 || totalThemBoost > 0) {
    lanes = lanes.map((lane, index) => {
      let { mine, theirs, rawMine, rawTheirs } = lane;
      const youBoost = youMultBoosts.filter((_, idx) => idx !== index).reduce((a, b) => a + b, 0);
      if (youBoost > 0 && mine.total > 0) {
        const mult = Number((1 + youBoost).toFixed(1));
        const total = Math.round(mine.total * mult);
        mine = { ...mine, total, steps: [...mine.steps, { key: 'overdrive', op: '×', value: mult, label: 'Momentum', total }] };
      }
      const themBoost = themMultBoosts.filter((_, idx) => idx !== index).reduce((a, b) => a + b, 0);
      if (themBoost > 0 && theirs.total > 0) {
        const mult = Number((1 + themBoost).toFixed(1));
        const total = Math.round(theirs.total * mult);
        theirs = { ...theirs, total, steps: [...theirs.steps, { key: 'overdrive', op: '×', value: mult, label: 'Momentum', total }] };
      }
      const winner = mine.total !== theirs.total
        ? (mine.total > theirs.total ? 'you' : 'them')
        : rawMine === rawTheirs ? null : (rawMine > rawTheirs ? 'you' : 'them');
      return { ...lane, mine, theirs, winner, rawMine, rawTheirs };
    });
  }

  const youWon = lanes.filter(lane => lane.winner === 'you').length;
  const themWon = lanes.filter(lane => lane.winner === 'them').length;
  const youTotal = lanes.reduce((sum, lane) => sum + lane.mine.total, 0);
  const themTotal = lanes.reduce((sum, lane) => sum + lane.theirs.total, 0);
  const winner = youWon !== themWon ? (youWon > themWon ? 'you' : 'them') : (youTotal >= themTotal ? 'you' : 'them');
  return { lanes, youWon, themWon, youTotal, themTotal, winner, displacements, velocityMoves, youSlots, themSlots };
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
