// Card-table preparation for Endless series.
//
// The public surface is deliberately data-first: React renders these objects
// as physical cards, while the match engine consumes the same activations as
// power deltas. There is no separate explanatory model that can drift away
// from what a card actually does.

import { getCardSpecialties } from '../../../shared/src/data/specialties.js';
import {
  currentRound, hashSeed, mulberry32, pickMaps, pickN, seedOf, simMap, teamSimulationPower,
} from '../../../shared/src/engine/perfectRun.js';

export const TACTIC_HAND_MAX = 7;
export const TACTIC_HAND_FLOOR = 2;
// A tactic prize pays out two cards at once, so banking one is worth the same
// trip through the reward screen as a player pack.
export const REWARD_TACTIC_PICKS = 2;
export const ENDLESS_POWER_DIVISOR = 85;

const ROLE_ORDER = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];

const MAP_ART = {
  Ascent:   { mark: 'A', hue: '#80a7bc', image: '/assets/maps/ascent.webp', agents: ['Sova', 'KAY/O', 'Omen'] },
  Bind:     { mark: 'B', hue: '#d89b62', image: '/assets/maps/bind.webp', agents: ['Raze', 'Brimstone', 'Viper'] },
  Haven:    { mark: 'H', hue: '#8da58b', image: '/assets/maps/haven.webp', agents: ['Breach', 'Sova', 'Omen'] },
  Lotus:    { mark: 'L', hue: '#b38b74', image: '/assets/maps/lotus.webp', agents: ['Raze', 'Fade', 'Viper'] },
  Split:    { mark: 'S', hue: '#bd8295', image: '/assets/maps/split.webp', agents: ['Raze', 'Cypher', 'Viper'] },
  Sunset:   { mark: 'U', hue: '#ce8068', image: '/assets/maps/sunset.webp', agents: ['Cypher', 'Breach', 'Omen'] },
  Icebox:   { mark: 'I', hue: '#75a8ca', image: '/assets/maps/icebox.webp', agents: ['Jett', 'Sage', 'Viper'] },
};

// Three learnable identities per place. A year changes exactly three active
// stickers; the other four cards stay put, so the meta moves without turning
// every year into a new ruleset.
const MAP_RULES = {
  Ascent: [
    { key: 'four-corners', label: 'FOUR CORNERS', roles: ROLE_ORDER, mode: 'coverage' },
    { key: 'mid-control', label: 'MID CONTROL', roles: ['Controller', 'Initiator'], mode: 'pair' },
    { key: 'anchor-points', label: 'ANCHOR POINTS', roles: ['Sentinel', 'Controller'], mode: 'pair' },
  ],
  Bind: [
    { key: 'fast-lanes', label: 'FAST LANES', roles: ['Duelist', 'Initiator'], mode: 'pair' },
    { key: 'hold-then-hit', label: 'HOLD / HIT', roles: ['Controller', 'Duelist'], mode: 'pair' },
    { key: 'closed-circuit', label: 'CLOSED CIRCUIT', roles: ['Sentinel', 'Initiator'], mode: 'pair' },
  ],
  Haven: [
    { key: 'three-sites', label: 'THREE SITES', roles: ROLE_ORDER, mode: 'coverage' },
    { key: 'long-reads', label: 'LONG READS', roles: ['Initiator', 'Sentinel'], mode: 'pair' },
    { key: 'late-rotation', label: 'LATE ROTATION', roles: ['Controller', 'Sentinel'], mode: 'pair' },
  ],
  Lotus: [
    { key: 'break-the-door', label: 'BREAK THE DOOR', roles: ['Duelist', 'Controller'], mode: 'pair' },
    { key: 'wide-net', label: 'WIDE NET', roles: ROLE_ORDER, mode: 'coverage' },
    { key: 'pressure-plates', label: 'PRESSURE PLATES', roles: ['Initiator', 'Duelist'], mode: 'pair' },
  ],
  Split: [
    { key: 'tight-lanes', label: 'TIGHT LANES', roles: ['Controller', 'Sentinel'], mode: 'pair' },
    { key: 'vertical-game', label: 'VERTICAL GAME', roles: ['Duelist', 'Controller'], mode: 'pair' },
    { key: 'information-tax', label: 'INFORMATION TAX', roles: ['Initiator', 'Sentinel'], mode: 'pair' },
  ],
  Sunset: [
    { key: 'open-mid', label: 'OPEN MID', roles: ['Duelist', 'Initiator'], mode: 'pair' },
    { key: 'trap-lines', label: 'TRAP LINES', roles: ['Sentinel', 'Controller'], mode: 'pair' },
    { key: 'split-second', label: 'SPLIT SECOND', roles: ['Initiator', 'Duelist'], mode: 'pair' },
  ],
  Icebox: [
    { key: 'long-sightlines', label: 'LONG SIGHTLINES', roles: ['Duelist', 'Sentinel'], mode: 'pair' },
    { key: 'utility-wall', label: 'UTILITY WALL', roles: ['Controller', 'Sentinel'], mode: 'pair' },
    { key: 'first-contact', label: 'FIRST CONTACT', roles: ['Duelist', 'Initiator'], mode: 'pair' },
  ],
};

export const MAP_NAMES = Object.keys(MAP_RULES);

function yearPatch(seed, year) {
  if (year <= 1) return [];
  const rng = mulberry32(hashSeed(`${seed}:map-patch:${year}`));
  return pickN(rng, MAP_NAMES, 3);
}

export function mapCardsForYear(seed, year) {
  const indexes = Object.fromEntries(MAP_NAMES.map(name => [name, 0]));
  let changed = [];
  for (let current = 2; current <= Math.max(1, year); current++) {
    const patch = yearPatch(seed, current);
    for (const name of patch) indexes[name] = (indexes[name] + 1) % MAP_RULES[name].length;
    if (current === year) changed = patch;
  }
  return MAP_NAMES.map(name => {
    const rule = MAP_RULES[name][indexes[name]];
    return {
      id: name.toLowerCase(), name, ...MAP_ART[name], ...rule,
      changed: changed.includes(name), year,
    };
  });
}

export function changedMapCards(seed, year) {
  return mapCardsForYear(seed, year).filter(card => card.changed);
}

function roleCount(roster, role) {
  return roster.filter(card => card.role === role).length;
}

function isMapSpecialist(card, map) {
  const agents = card.agents ?? [];
  return agents.length === 1 && map.agents.includes(agents[0]);
}

export function mapActivation(roster, map, mastery = 0) {
  if (!roster?.length || !map) return { bonus: 0, activeIds: [], roleHits: [], specialistIds: [] };
  const roleHits = map.roles.filter(role => roleCount(roster, role) > 0);
  const roleBonus = map.mode === 'coverage'
    ? (roleHits.length === ROLE_ORDER.length ? 2.4 : roleHits.length * 0.25)
    : Math.min(2.4, map.roles.reduce((sum, role) => sum + roleCount(roster, role) * 0.75, 0));
  const specialistIds = roster.filter(card => isMapSpecialist(card, map)).map(card => card.id);
  const masteryBonus = Math.min(1.8, Math.max(0, mastery) * 0.3);
  const activeIds = roster
    .filter(card => map.roles.includes(card.role) || specialistIds.includes(card.id))
    .map(card => card.id);
  return {
    bonus: roleBonus + specialistIds.length * 0.9 + masteryBonus,
    activeIds, roleHits, specialistIds, masteryBonus,
  };
}

export function gainMapMastery(mastery, mapName) {
  return { ...mastery, [mapName]: Math.min(6, (mastery?.[mapName] ?? 0) + 1) };
}

// Off-screen organizations still carry stable, run-specific mastery. The
// value is derived rather than stored for all ~160 orgs, keeping a solo save
// small while ensuring the same rival has the same practiced maps on reload.
export function rivalMapMastery(seed, orgId, mapName, year = 1) {
  const base = hashSeed(`${seed}:${orgId}:${mapName}:mastery`) % 4;
  const drift = hashSeed(`${seed}:${orgId}:${mapName}:year:${year}`) % 3;
  return Math.min(6, base + Math.floor(Math.max(0, year - 1) / 3) + (drift === 0 ? 1 : 0));
}

export function recentMapSelections(seed, orgId, year = 1, count = 3) {
  const rng = mulberry32(hashSeed(`${seed}:${orgId}:recent-maps:${year}`));
  return pickN(rng, MAP_NAMES, count);
}

// A tactic never adds power. It multiplies what the map gave you, so the same
// card can be weak in one squad and huge in another. `base` is the multiplier
// it brings alone and every other field adds to it, which is what roster fit
// is worth. Printed rules and keys stay fixed: a played card keeps its meaning.
export const TACTICS = {
  pocket: {
    key: 'pocket', name: 'POCKET STRAT', tier: 'common', tag: 'read',
    role: null, rule: 'IGL + MAP', base: 0.3,
  },
  hit: {
    key: 'hit', name: 'HIT THE SITE', tier: 'common', tag: 'tempo',
    role: 'Duelist', rule: '2× DLT', base: 0.1, perRole: 0.4,
  },
  layers: {
    key: 'layers', name: 'UTILITY LAYERS', tier: 'common', tag: 'structure',
    role: 'Controller', rule: 'CTL + INIT', base: 0.2, partner: 'Initiator', pair: 0.9,
  },
  retake: {
    key: 'retake', name: 'RETAKE PROTOCOL', tier: 'common', tag: 'structure',
    role: 'Sentinel', rule: 'SEN + CTL', base: 0.2, partner: 'Controller', pair: 0.9,
  },
  contact: {
    key: 'contact', name: 'CONTACT PLAY', tier: 'uncommon', tag: 'read',
    role: 'Initiator', rule: 'INIT → FLICK', base: 0.2, specialty: 'flick', specialtyBonus: 0.45,
  },
  flood: {
    key: 'flood', name: 'FLOOD THE GAP', tier: 'uncommon', tag: 'tempo',
    role: 'Duelist', rule: 'DLT + FLEX', base: 0.2, specialty: 'flex', specialtyBonus: 0.6,
  },
  defaults: {
    key: 'defaults', name: 'DEEP DEFAULT', tier: 'uncommon', tag: 'read',
    role: 'Sentinel', rule: '4 ROLES', base: 0.1, coverage: 1.1,
  },
  calling: {
    key: 'calling', name: 'SECOND CALL', tier: 'rare', tag: 'read',
    role: null, rule: 'MASTERMIND ×2', base: 0.2, specialty: 'mastermind', specialtyBonus: 1.2,
  },
  noRespect: {
    key: 'no-respect', name: 'NO RESPECT', tier: 'rare', tag: 'tempo',
    role: null, rule: 'FLICK LEADS', base: 0.2, specialty: 'flick', specialtyBonus: 0.8,
  },
  lockout: {
    key: 'lockout', name: 'LOCK THE MAP', tier: 'rare', tag: 'structure',
    role: null, rule: 'MAP RULE ×2', base: 0.1, mapMultiplier: 0.4,
  },
};

export const TACTIC_LIST = Object.values(TACTICS);

function hasSpec(card, key) {
  return getCardSpecialties(card).some(spec => spec.key === key);
}

export function tacticActivation(instance, roster, mapActivationResult = null) {
  const tactic = TACTICS[instance?.key];
  if (!tactic) return { mult: 1, activeIds: [], tag: null };
  const active = new Set();
  let mult = 1 + (tactic.base ?? 0);
  if (tactic.role) {
    const roleCards = roster.filter(card => card.role === tactic.role);
    roleCards.forEach(card => active.add(card.id));
    mult += roleCards.length * (tactic.perRole ?? 0.15);
  }
  if (tactic.partner && roster.some(card => card.role === tactic.role) && roster.some(card => card.role === tactic.partner)) {
    roster.filter(card => card.role === tactic.role || card.role === tactic.partner).forEach(card => active.add(card.id));
    mult += tactic.pair ?? 0;
  }
  if (tactic.coverage && new Set(roster.map(card => card.role)).size >= 4) {
    roster.forEach(card => active.add(card.id));
    mult += tactic.coverage;
  }
  if (tactic.specialty) {
    const specialists = roster.filter(card => hasSpec(card, tactic.specialty));
    specialists.forEach(card => active.add(card.id));
    mult += specialists.length * (tactic.specialtyBonus ?? 0);
  }
  if (tactic.mapMultiplier && mapActivationResult) mult += mapActivationResult.bonus * tactic.mapMultiplier;
  return { mult, activeIds: [...active], tag: tactic.tag, tactic };
}

// What a side takes into a map: the base every squad brings plus the map, times
// the tactic, then the counter on top. Every screen and every simulated series
// goes through here, so a number on a card is the number that plays.
export const BASE_EDGE = 2;
export const EDGE_SCALE = 10;

export function seriesEdge(mapResult, tacticResult = null, clash = 0) {
  return (BASE_EDGE + (mapResult?.bonus ?? 0)) * (tacticResult?.mult ?? 1) + clash;
}

// Edge as players read it: 62 rather than 6.2.
export function edgePoints(value) {
  return Math.round(value * EDGE_SCALE);
}

// The same sum, one beat at a time, for the reveal after a tactic is played.
export function edgeSteps(mapResult, tacticResult, clash = 0) {
  return [
    { key: 'base', value: edgePoints(BASE_EDGE), total: edgePoints(BASE_EDGE) },
    { key: 'map', value: edgePoints(mapResult?.bonus ?? 0), total: edgePoints(seriesEdge(mapResult)) },
    { key: 'tactic', value: tacticResult?.mult ?? 1, total: edgePoints(seriesEdge(mapResult, tacticResult)) },
    { key: 'clash', value: edgePoints(clash), total: edgePoints(seriesEdge(mapResult, tacticResult, clash)) },
  ];
}

const COUNTERS = { tempo: 'read', read: 'structure', structure: 'tempo' };

export function tacticClash(playerActivation, opponentActivation) {
  let player = 0;
  let opponent = 0;
  if (COUNTERS[playerActivation?.tag] === opponentActivation?.tag) player = 0.8;
  if (COUNTERS[opponentActivation?.tag] === playerActivation?.tag) opponent = 0.8;
  return { player, opponent };
}

function tacticInstance(rng, tactic, source) {
  return {
    uid: `${tactic.key}-${Math.floor(rng() * 0x7fffffff).toString(36)}`,
    key: tactic.key,
    source,
  };
}

export function createTacticInstance(rng, key, source = 'owned') {
  return tacticInstance(rng, TACTICS[key] ?? TACTICS.pocket, source);
}

function contextualTactics(roster, map) {
  const roles = new Set(roster.map(card => card.role));
  const specs = new Set(roster.flatMap(getCardSpecialties).map(spec => spec.key));
  const scored = TACTIC_LIST.map(tactic => {
    let score = tactic.tier === 'common' ? 3 : tactic.tier === 'uncommon' ? 1 : 0;
    if (!tactic.role || roles.has(tactic.role)) score += 3;
    if (tactic.partner && roles.has(tactic.partner)) score += 2;
    if (tactic.specialty && specs.has(tactic.specialty)) score += 3;
    if (map?.roles?.includes(tactic.role)) score += 2;
    return { tactic, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 5).map(row => row.tactic);
}

export function refillTacticHand(rng, hand, { roster, map }) {
  const next = [...(hand ?? [])].slice(0, TACTIC_HAND_MAX);
  const pool = contextualTactics(roster, map);
  while (next.length < TACTIC_HAND_FLOOR) {
    const tactic = pool[Math.floor(rng() * pool.length)] ?? TACTICS.pocket;
    next.push(tacticInstance(rng, tactic, 'igl'));
  }
  return next;
}

export function consumeTactic(hand, uid) {
  return (hand ?? []).filter(card => card.uid !== uid);
}

// A played call is only spent if it failed. Winning the map hands it back,
// so a strong run grows its bank instead of draining it; a lost map burns
// it, and the IGL's two-card floor stays the only safety net.
export function settleTactic(hand, card, won, max = TACTIC_HAND_MAX) {
  const current = hand ?? [];
  if (!won || !card || current.some(held => held.uid === card.uid)) return current;
  return [...current, card].slice(0, max);
}

// Adds as many `incoming` cards as fit under `max`; whatever doesn't fit is
// returned as `overflow`, for the reward screen's replace step to resolve one
// at a time. Pure so the reward flow can call it once flights land, and the
// tests can check fit/overflow without touching React state.
export function bankTactics(hand, incoming, max = TACTIC_HAND_MAX) {
  const current = hand ?? [];
  const room = Math.max(0, max - current.length);
  return {
    hand: [...current, ...incoming.slice(0, room)],
    overflow: incoming.slice(room),
  };
}

export function tacticBooster(rng, count = 3) {
  const weighted = [
    ...TACTIC_LIST.filter(card => card.tier === 'common'),
    ...TACTIC_LIST.filter(card => card.tier === 'common'),
    ...TACTIC_LIST.filter(card => card.tier === 'uncommon'),
    ...TACTIC_LIST.filter(card => card.tier === 'rare'),
  ];
  return Array.from({ length: count }, () => tacticInstance(rng, weighted[Math.floor(rng() * weighted.length)], 'owned'));
}

export function npcTacticChoices(rng, roster, map) {
  const pool = contextualTactics(roster, map);
  // NPC IGLs obey the same two-card floor as the player. They draw two
  // contextual calls and keep the one their five can activate most strongly;
  // no invisible bespoke AI bonus is needed.
  const choices = Array.from({ length: TACTIC_HAND_FLOOR }, () => (
    tacticInstance(rng, pool[Math.floor(rng() * Math.min(3, pool.length))] ?? TACTICS.pocket, 'igl')
  ));
  const mapResult = mapActivation(roster, map, 0);
  return choices.sort((a, b) => (
    tacticActivation(b, roster, mapResult).mult - tacticActivation(a, roster, mapResult).mult
  ) || a.key.localeCompare(b.key));
}

export function npcTactic(rng, roster, map) {
  return npcTacticChoices(rng, roster, map)[0];
}

// How many maps each side picks before the decider(s): one each in a Bo3,
// two each from a Bo5 up. Picks alternate, higher seed first, so a Bo5 runs
// A B A B and the fifth dealt map is the decider.
export function mapPicksPerSide(bestOf) {
  return bestOf >= 5 ? 2 : 1;
}

export function chooseNpcMap(maps, roster, masteryByName = {}) {
  return [...maps].sort((a, b) => (
    mapActivation(roster, b, masteryByName[b.name] ?? 0).bonus
    - mapActivation(roster, a, masteryByName[a.name] ?? 0).bonus
  ) || a.name.localeCompare(b.name))[0];
}

// Plays a series whose map order is already settled. Each side's tactic is
// asked for map by map, in A-then-B order, because npcTactic draws from the
// rng and a Daily or a lobby replay depends on that order staying fixed.
export function playCardSeries(rng, {
  teamA, teamB, bestOf, maps, masteryA, masteryB, tacticA, tacticB,
}) {
  const needed = Math.ceil(bestOf / 2);
  const played = [];
  let scoreA = 0;
  let scoreB = 0;

  for (const map of maps) {
    if (scoreA >= needed || scoreB >= needed) break;
    const mapA = mapActivation(teamA.roster, map, masteryA[map.name]);
    const mapB = mapActivation(teamB.roster, map, masteryB[map.name]);
    const cardA = tacticA(map);
    const cardB = tacticB(map);
    const activationA = tacticActivation(cardA, teamA.roster, mapA);
    const activationB = tacticActivation(cardB, teamB.roster, mapB);
    const clash = tacticClash(activationA, activationB);
    const result = simMap(
      rng,
      teamSimulationPower(teamA) + seriesEdge(mapA, activationA, clash.player),
      teamSimulationPower(teamB) + seriesEdge(mapB, activationB, clash.opponent),
      teamA.roster,
      teamB.roster,
      0,
      teamA.iglId ?? null,
      teamB.iglId ?? null,
      { powerDivisor: ENDLESS_POWER_DIVISOR },
    );
    played.push({ map: map.name, a: result.a, b: result.b, tacticA: cardA, tacticB: cardB });
    if (result.winA) scoreA += 1;
    else scoreB += 1;
  }

  return { maps: played, scoreA, scoreB, winner: scoreA > scoreB ? teamA.id : teamB.id };
}

// Resolve an off-screen Endless round with the same cards the player sees:
// seed decides first pick, both squads pick for roster fit, IGLs generate two
// contextual calls, and the same soft counter triangle modifies the map. The
// data is intentionally not stored on the bracket - the result is the durable
// state, while each map's preparation is consumed as it is played.
export function resolveEndlessNpcMatches(tour, rng, runSeed, year, yearMapByName) {
  const stage = currentRound(tour);
  for (const match of stage.matches) {
    if (match.winner) continue;
    const teamA = tour.teams[match.a];
    const teamB = tour.teams[match.b];
    const dealt = pickMaps(rng, match.bestOf).map(name => yearMapByName.get(name));
    const masteryA = Object.fromEntries(dealt.map(map => [map.name, rivalMapMastery(runSeed, teamA.id, map.name, year)]));
    const masteryB = Object.fromEntries(dealt.map(map => [map.name, rivalMapMastery(runSeed, teamB.id, map.name, year)]));
    const aPicksFirst = seedOf(tour, teamA.id) < seedOf(tour, teamB.id);
    const firstTeam = aPicksFirst ? teamA : teamB;
    const secondTeam = aPicksFirst ? teamB : teamA;
    const firstMastery = aPicksFirst ? masteryA : masteryB;
    const secondMastery = aPicksFirst ? masteryB : masteryA;
    // Same alternating draft the player gets: A B (A B), then the decider.
    const picks = [];
    for (let turn = 0; turn < mapPicksPerSide(match.bestOf) * 2; turn += 1) {
      const firstTurn = turn % 2 === 0;
      const pick = chooseNpcMap(
        dealt.filter(map => !picks.includes(map)),
        (firstTurn ? firstTeam : secondTeam).roster,
        firstTurn ? firstMastery : secondMastery,
      );
      if (!pick) break;
      picks.push(pick);
    }
    const maps = [...picks, ...dealt.filter(map => !picks.includes(map))];
    const result = playCardSeries(rng, {
      teamA, teamB, bestOf: match.bestOf, maps, masteryA, masteryB,
      tacticA: map => npcTactic(rng, teamA.roster, map),
      tacticB: map => npcTactic(rng, teamB.roster, map),
    });

    match.maps = result.maps.map(({ map, a, b }) => ({ map, a, b }));
    match.scoreA = result.scoreA;
    match.scoreB = result.scoreB;
    match.winner = result.winner;
  }
}

// Lobby picks are made in secret, so two squads can want the same map. The
// higher seed's list is read first on each turn; a side whose next pick has
// gone takes its next choice, then `fallback` once its list runs out.
export function mergeMapPicks(dealt, firstPicks, secondPicks, perSide, fallback) {
  const taken = [];
  const remaining = () => dealt.filter(map => !taken.includes(map));
  for (let turn = 0; turn < perSide * 2; turn += 1) {
    const list = turn % 2 === 0 ? firstPicks : secondPicks;
    const pick = (list ?? [])
      .map(name => remaining().find(map => map.name === name))
      .find(Boolean) ?? fallback(remaining(), turn % 2 === 0);
    if (!pick) break;
    taken.push(pick);
  }
  return [...taken, ...remaining()];
}
