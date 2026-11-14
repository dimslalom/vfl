// A live 1v1 Club series on the map board, run by the server. Pure, like
// multiplayer.js: the Duel Durable Object stores the state and calls these.
// Each map: both sides place blind, both placements reveal, both IGLs rotate
// blind, then the server resolves. A side that runs out of time keeps what it
// has (no placement: the AI places for it, without chips); a side that has been
// gone too long is played by the AI for the rest of the series.
import { mulberry32, pickN } from '../../shared/src/engine/perfectRun.js';
import { STAT_KEYS } from '../../shared/src/data/statFields.js';
import {
  BOARD_SKILLS, LANES, SQUAD_SIZE, bestPlacement, bestRotate, isLegalPlacement, isLegalRotation,
  resolveBoard, seriesWinner,
} from './board/board.js';
import { MAP_LANES } from './board/mapLanes.js';
import { MAP_NAMES, TACTICS, mapCardsForYear, npcTacticChoices } from './endless/seriesCards.js';

export const INTRO_MS = 8_000;
export const PLACE_MS = 45_000;
export const REVEAL_MS = 3_000;
export const ROTATE_MS = 15_000;
// Between maps: the playback, the verdict, then the next map deals when both
// clubs are ready or this runs out. The place clock starts at the deal.
export const BETWEEN_MS = 30_000;
export const RECONNECT_MS = 30_000;
export const DUEL_TTL_MS = 2 * 60 * 60 * 1000;
export const BEST_OF = [3, 5];
const MAX_CHIPS = LANES;

export class DuelError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** The series' maps: the same draw the board's own pickSeriesMaps makes. */
export function seriesMaps(seed, bestOf) {
  const cards = mapCardsForYear(seed, 1);
  return pickN(mulberry32(seed), MAP_NAMES, bestOf).map(name => cards.find(card => card.name === name));
}

/** One map's three lanes, as the board scores them. */
export function laneMaps(map) {
  return MAP_LANES[map.name].map(lane => ({ ...lane, image: map.image, agents: map.agents }));
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(value) || 0)));
const shortText = (value, max = 40) => (typeof value === 'string' ? value.slice(0, max) : null);

/**
 * A squad a client sent, rebuilt on the server's own card data: the card's
 * identity, specialties and art come from cards.json, only the trained numbers
 * and learned skills come from the client, and those are clamped.
 */
export function sanitizeRoster(raw, cards) {
  if (!Array.isArray(raw) || raw.length !== SQUAD_SIZE) throw new DuelError('invalid_squad', 'A squad is five players.');
  const lookup = new Map(cards.map(card => [card.id, card]));
  const seen = new Set();
  return raw.map((sent) => {
    const base = lookup.get(sent?.id);
    if (!base || seen.has(base.id)) throw new DuelError('invalid_squad', 'Unknown or repeated player.');
    seen.add(base.id);
    const learned = Array.isArray(sent.learned) ? [...new Set(sent.learned.filter(key => key in BOARD_SKILLS))].slice(0, 6) : [];
    return {
      ...base,
      rating: clamp(sent.rating ?? base.rating, 1, 130),
      stats: Object.fromEntries(STAT_KEYS.map(key => [key, clamp(sent.stats?.[key] ?? base.stats?.[key], 0, 150)])),
      tier: shortText(sent.tier, 16) ?? base.tier,
      palette: shortText(sent.palette, 16) ?? base.palette,
      learned,
      evoTheme: shortText(sent.evoTheme),
      evoLevel: Number.isInteger(sent.evoLevel) ? clamp(sent.evoLevel, 0, 10) : null,
      evoBadge: shortText(sent.evoBadge),
    };
  });
}

/** A club's face: name, crest and tone, trimmed. */
function sanitizeClub(club) {
  return {
    name: shortText(club?.name, 24)?.trim() || 'Club',
    // Parts crests are saved as codes up to 160 characters (crestKit CREST_CODE_MAX).
    crest: shortText(club?.crest, 160) ?? null,
    tone: Number.isInteger(club?.tone) ? String(club.tone) : shortText(club?.tone, 24) ?? null,
  };
}

function sanitizeChips(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CHIPS) throw new DuelError('invalid_chips', 'Too many chips.');
  const lanes = new Set();
  return raw.map((chip) => {
    const lane = chip?.lane;
    const key = chip?.card?.key;
    if (!Number.isInteger(lane) || lane < 0 || lane >= LANES || lanes.has(lane)) throw new DuelError('invalid_chips', 'One chip per lane.');
    if (!TACTICS[key]) throw new DuelError('invalid_chips', 'Unknown chip.');
    lanes.add(lane);
    return { lane, card: { key, uid: shortText(String(chip.card.uid ?? key), 48), source: 'owned' } };
  });
}

function seat(id, club, roster, now) {
  return { id, ...sanitizeClub(club), roster, connected: false, goneAt: now, ai: false };
}

/**
 * A ranked series from the queue: always Bo3, each seat tied to its account.
 * A `cpu` seat is a real club's five the AI plays from the first move; it is
 * always there and always ready.
 */
export function createRankedDuel({ code, seats, seed, cards, now }) {
  const state = createDuel({ code, hostId: seats[0].id, club: seats[0].club, squad: seats[0].squad, bestOf: 3, seed, cards, now });
  state.ranked = true;
  state.seats[0].userId = seats[0].userId;
  const second = seat(seats[1].id, seats[1].club, sanitizeRoster(seats[1].squad, cards), now);
  if (seats[1].cpu) Object.assign(second, { cpu: true, ai: true, connected: true, goneAt: null });
  else second.userId = seats[1].userId;
  state.seats.push(second);
  return state;
}

/** Who played a finished ranked series, for the rating update. */
export function rankedOutcome(state) {
  if (!state.ranked || state.phase !== 'done' || state.rated) return null;
  return state.seats.map((s, index) => ({ userId: s.userId ?? null, cpu: Boolean(s.cpu), won: state.winner === index }));
}

export function createDuel({ code, hostId, club, squad, bestOf, seed, cards, now }) {
  if (!BEST_OF.includes(bestOf)) throw new DuelError('invalid_settings', 'Choose Bo3 or Bo5.');
  const maps = seriesMaps(seed, bestOf);
  return {
    code,
    seed,
    bestOf,
    mapNames: maps.map(map => map.name),
    phase: 'waiting',
    version: 1,
    seats: [seat(hostId, club, sanitizeRoster(squad, cards), now)],
    round: 0,
    score: [0, 0],
    rounds: [],
    board: null,
    between: null,
    winner: null,
    createdAt: now,
    lastActiveAt: now,
  };
}

export function joinDuel(state, { id, club, squad, cards, now }) {
  if (state.seats.some(s => s.id === id)) return state;
  if (state.seats.length >= 2 || state.phase !== 'waiting') throw new DuelError('duel_full', 'This match already has two clubs.');
  state.seats.push(seat(id, club, sanitizeRoster(squad, cards), now));
  touch(state, now);
  return state;
}

function touch(state, now) {
  state.version += 1;
  state.lastActiveAt = now;
}

function seatIndex(state, id) {
  const index = state.seats.findIndex(s => s.id === id);
  if (index < 0) throw new DuelError('unauthorized', 'Not in this match.');
  return index;
}

function dealRound(state, now, delay) {
  state.board = {
    phase: 'place',
    placed: [null, null],
    rotated: [null, null],
    deadlineAt: now + delay + PLACE_MS,
  };
  state.phase = 'place';
}

/** Connection changes; a full house starts the series. */
export function setPresence(state, id, connected, now) {
  const index = state.seats.findIndex(s => s.id === id);
  if (index < 0) return { changed: false };
  const s = state.seats[index];
  s.connected = connected;
  s.goneAt = connected ? null : now;
  if (connected) s.ai = false;
  if (state.phase === 'waiting' && state.seats.length === 2 && state.seats.every(x => x.connected)) {
    dealRound(state, now, INTRO_MS);
  }
  touch(state, now);
  return { changed: true };
}

function rngFor(state, salt) {
  return mulberry32((state.seed + state.round * 7919 + salt) >>> 0);
}

/** The AI's board for a side: a seat it plays gets its own chips, a timeout none. */
function aiPlacement(state, index, withChips) {
  const maps = laneMaps(seriesMaps(state.seed, state.bestOf)[state.round]);
  const roster = state.seats[index].roster;
  const map = seriesMaps(state.seed, state.bestOf)[state.round];
  const chips = withChips ? npcTacticChoices(rngFor(state, 101 + index), roster, map) : [];
  const plan = bestPlacement({ roster, maps, tactics: chips, rng: rngFor(state, 1 + index) });
  return { slots: plan.slots, tactics: plan.tactics.map(chip => ({ lane: chip.lane, card: { key: chip.card.key, uid: chip.card.uid, source: 'igl' } })) };
}

function aiRotation(state, index) {
  const maps = laneMaps(seriesMaps(state.seed, state.bestOf)[state.round]);
  const other = 1 - index;
  const side = i => ({ roster: state.seats[i].roster, slots: state.board.placed[i].slots, tactics: state.board.placed[i].tactics });
  return bestRotate({ you: side(index), them: side(other), maps });
}

function reveal(state, now) {
  state.board.phase = 'rotate';
  state.board.deadlineAt = now + REVEAL_MS + ROTATE_MS;
  state.phase = 'rotate';
}

/** Mirrors a resolved board, so the second seat reads it as "you". */
export function flipResult(result) {
  const side = value => (value === 'you' ? 'them' : value === 'them' ? 'you' : value);
  const flipSide = item => ({ ...item, side: side(item.side) });
  return {
    ...result,
    lanes: result.lanes.map(lane => ({
      ...lane,
      mine: lane.theirs,
      theirs: lane.mine,
      winner: side(lane.winner),
      rawMine: lane.rawTheirs,
      rawTheirs: lane.rawMine,
      myCards: lane.theirCards,
      theirCards: lane.myCards,
    })),
    youWon: result.themWon,
    themWon: result.youWon,
    youTotal: result.themTotal,
    themTotal: result.youTotal,
    winner: side(result.winner),
    displacements: result.displacements.map(flipSide),
    velocityMoves: result.velocityMoves.map(flipSide),
    effects: result.effects.map(flipSide),
    youSlots: result.themSlots,
    themSlots: result.youSlots,
  };
}

function resolveRound(state, now) {
  const map = seriesMaps(state.seed, state.bestOf)[state.round];
  const maps = laneMaps(map);
  const side = i => ({ roster: state.seats[i].roster, slots: state.board.rotated[i], tactics: state.board.placed[i].tactics });
  const result = resolveBoard({ maps, you: side(0), them: side(1) });
  const winnerIndex = result.winner === 'you' ? 0 : 1;
  state.score[winnerIndex] += 1;
  state.rounds.push({
    map: map.name,
    winner: winnerIndex,
    placed: state.board.placed,
    rotated: state.board.rotated,
    result,
  });
  const champion = seriesWinner(state.bestOf, state.score[0], state.score[1]);
  if (champion) {
    state.winner = champion === 'you' ? 0 : 1;
    state.phase = 'done';
    state.board = null;
    return;
  }
  state.round += 1;
  state.board = null;
  state.phase = 'between';
  state.between = { deadlineAt: now + BETWEEN_MS, ready: state.seats.map(s => s.ai) };
}

function startNext(state, now) {
  state.between = null;
  dealRound(state, now, 0);
}

function settle(state, now) {
  const b = state.board;
  if (!b) return;
  if (b.phase === 'place' && b.placed.every(Boolean)) reveal(state, now);
  if (state.board?.phase === 'rotate' && state.board.rotated.every(Boolean)) resolveRound(state, now);
}

export function applyDuelCommand(state, id, command, now) {
  const index = seatIndex(state, id);
  const payload = command?.payload ?? {};
  switch (command?.type) {
    case 'place': {
      const b = state.board;
      if (state.phase !== 'place' || !b) throw new DuelError('wrong_phase', 'Not placing now.');
      if (payload.round !== state.round) throw new DuelError('wrong_round', 'That map is over.');
      if (b.placed[index]) return { duplicate: true };
      const slots = payload.slots;
      if (!Array.isArray(slots) || slots.length !== SQUAD_SIZE || !isLegalPlacement(slots, state.seats[index].roster)) {
        throw new DuelError('illegal_placement', 'That board isn’t legal.');
      }
      b.placed[index] = { slots: [...slots], tactics: sanitizeChips(payload.tactics) };
      break;
    }
    case 'rotate': {
      const b = state.board;
      if (state.phase !== 'rotate' || !b) throw new DuelError('wrong_phase', 'Not rotating now.');
      if (payload.round !== state.round) throw new DuelError('wrong_round', 'That map is over.');
      if (b.rotated[index]) return { duplicate: true };
      const slots = payload.slots;
      if (!Array.isArray(slots) || slots.length !== SQUAD_SIZE || !isLegalRotation(b.placed[index].slots, slots, state.seats[index].roster)) {
        throw new DuelError('illegal_rotation', 'That rotate isn’t legal.');
      }
      b.rotated[index] = [...slots];
      break;
    }
    case 'ready': {
      if (state.phase !== 'between') return { duplicate: true };
      if (payload.round !== state.round) throw new DuelError('wrong_round', 'That map is over.');
      if (state.between.ready[index]) return { duplicate: true };
      state.between.ready[index] = true;
      if (state.between.ready.every(Boolean)) startNext(state, now);
      break;
    }
    case 'forfeit': {
      if (state.phase === 'done') return { duplicate: true };
      if (state.phase === 'waiting') throw new DuelError('wrong_phase', 'The match hasn’t started.');
      state.winner = 1 - index;
      state.forfeit = index;
      state.phase = 'done';
      state.board = null;
      state.between = null;
      break;
    }
    default:
      throw new DuelError('invalid_command', 'Unknown command.');
  }
  settle(state, now);
  touch(state, now);
  return { duplicate: false };
}

/**
 * Time passing: deadlines fill what's missing, and a seat gone longer than
 * RECONNECT_MS is handed to the AI, which then answers at once.
 */
export function advanceDuel(state, now) {
  let changed = false;
  for (const s of state.seats) {
    if (!s.connected && !s.ai && s.goneAt != null && now - s.goneAt >= RECONNECT_MS && state.phase !== 'waiting') {
      s.ai = true;
      changed = true;
    }
  }
  if (state.phase === 'between') {
    state.seats.forEach((s, i) => { if (s.ai) state.between.ready[i] = true; });
    if (now >= state.between.deadlineAt || state.between.ready.every(Boolean)) {
      startNext(state, now);
      changed = true;
    }
  }
  // Loops so an all-AI step (a seat gone, the other submitted) runs to the next human decision.
  for (let guard = 0; guard < 4 && state.board; guard += 1) {
    const b = state.board;
    const late = now >= b.deadlineAt;
    let acted = false;
    for (let i = 0; i < 2; i += 1) {
      const isAi = state.seats[i].ai;
      if (b.phase === 'place' && !b.placed[i] && (isAi || late)) {
        b.placed[i] = aiPlacement(state, i, isAi);
        acted = true;
      } else if (b.phase === 'rotate' && !b.rotated[i] && (isAi || late)) {
        b.rotated[i] = isAi ? aiRotation(state, i) : [...b.placed[i].slots];
        acted = true;
      }
    }
    if (!acted) break;
    settle(state, now);
    changed = true;
  }
  if (changed) touch(state, now);
  return { changed };
}

export function nextDuelAlarm(state) {
  const deadline = state.between?.deadlineAt ?? state.board?.deadlineAt;
  if (deadline) {
    const gone = state.seats.filter(s => !s.connected && !s.ai && s.goneAt != null).map(s => s.goneAt + RECONNECT_MS);
    return Math.min(deadline, ...gone);
  }
  return state.lastActiveAt + DUEL_TTL_MS;
}

/**
 * What one seat may see: its own submissions, the other side's only once both
 * are in, and every resolved map from its own side of the table.
 */
export function duelSnapshot(state, viewerId, now) {
  const me = state.seats.findIndex(s => s.id === viewerId);
  const you = me < 0 ? 0 : me;
  const them = 1 - you;
  const view = result => (you === 0 ? result : flipResult(result));
  const b = state.board;
  const club = s => s && { name: s.name, crest: s.crest, tone: s.tone, roster: s.roster, connected: s.connected, ai: s.ai, cpu: Boolean(s.cpu) };
  // Every finished map from this seat's side, so a client a few maps behind
  // (a tab left in the background) can play each one back in turn.
  const history = state.rounds.map((r, index) => ({
    index,
    map: r.map,
    won: r.winner === you,
    yourPlan: r.placed[you],
    theirPlan: r.placed[them],
    yourRotate: r.rotated[you],
    theirRotate: r.rotated[them],
    result: view(r.result),
  }));
  return {
    code: state.code,
    version: state.version,
    serverNow: now,
    phase: state.phase,
    bestOf: state.bestOf,
    seed: state.seed,
    mapNames: state.mapNames,
    round: state.round,
    score: { you: state.score[you], them: state.score[them] },
    you: club(state.seats[you]),
    them: club(state.seats[them]) ?? null,
    host: me === 0,
    ranked: Boolean(state.ranked),
    // This seat's rating change, once the server has written it.
    rating: state.rated?.[you] ?? null,
    board: b && {
      phase: b.phase,
      deadlineAt: b.deadlineAt,
      youPlaced: Boolean(b.placed[you]),
      themPlaced: Boolean(b.placed[them]),
      youRotated: Boolean(b.rotated[you]),
      themRotated: Boolean(b.rotated[them]),
      // Your own board, so a timeout the server filled can be shown to you.
      yourPlan: b.placed[you],
      // Theirs, only once both are locked: the reveal.
      theirPlan: b.phase === 'rotate' ? b.placed[them] : null,
    },
    between: state.between && {
      deadlineAt: state.between.deadlineAt,
      youReady: state.between.ready[you],
      themReady: state.between.ready[them],
    },
    history,
    last: history.at(-1) ?? null,
    winner: state.winner == null ? null : state.winner === you ? 'you' : 'them',
    forfeit: state.forfeit == null ? null : state.forfeit === you ? 'you' : 'them',
  };
}
