import { DurableObject } from 'cloudflare:workers';
import cards from '../shared/src/data/cards.json';
import { DAILY_BOARD_START_MS, DAILY_SCORE_MAX } from '../src/lib/dailyRules.js';
import {
  GameError,
  LOBBY_TTL_MS,
  addCompetitor,
  addSpectator,
  advanceDeadlines,
  applyCommand,
  createLobbyState,
  migrateLobbyState,
  nextAlarmAt,
  publicSnapshot,
  setConnection,
} from '../src/engine/multiplayer.js';
import {
  DuelError,
  advanceDuel,
  applyDuelCommand,
  createDuel,
  createRankedDuel,
  duelSnapshot,
  joinDuel,
  nextDuelAlarm,
  rankedOutcome,
  setPresence,
} from '../src/engine/duel.js';
import { handleAccounts } from './accounts.js';
import { handleRanked, rateSeries } from './ranked.js';

export { Matchmaker } from './ranked.js';

const APP_PREFIX = '';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_JSON_BODY_BYTES = 32 * 1024;
const MAX_WEBSOCKET_MESSAGE_BYTES = 16 * 1024;

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'request failed',
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return errorResponse(error);
    }
  },
};

async function handleRequest(request, env) {
    const url = new URL(request.url);

    // Discord sign-in and the Clubs cloud save (worker/accounts.js).
    const accountResponse = await handleAccounts(request, env);
    if (accountResponse) return withSecurityHeaders(accountResponse);
    const rankedResponse = await handleRanked(request, env);
    if (rankedResponse) return withSecurityHeaders(rankedResponse);

    if (url.pathname === `${APP_PREFIX}/api/lobbies` && request.method === 'POST') {
      const body = await readJson(request);
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const stub = env.LOBBIES.get(env.LOBBIES.idFromName(code));
        const response = await stub.fetch('https://lobby.internal/create', {
          method: 'POST',
          body: JSON.stringify({ ...body, code }),
        });
        if (response.status !== 409) return response;
      }
      return json({ error: 'code_generation_failed', message: 'Could not allocate a lobby code.' }, 503);
    }

    // ── Live Club duels (one Duel Durable Object per match code) ─────────────
    if (url.pathname === '/api/duels' && request.method === 'POST') {
      const body = await readJson(request);
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const stub = env.DUELS.get(env.DUELS.idFromName(code));
        const response = await stub.fetch('https://duel.internal/create', { method: 'POST', body: JSON.stringify({ ...body, code }) });
        if (response.status !== 409) return response;
      }
      return json({ error: 'code_generation_failed', message: 'Could not allocate a match code.' }, 503);
    }
    const duelJoin = url.pathname.match(/^\/api\/duels\/([A-Z2-9]{6})\/join$/);
    if (duelJoin && request.method === 'POST') {
      const stub = env.DUELS.get(env.DUELS.idFromName(duelJoin[1]));
      return stub.fetch('https://duel.internal/join', { method: 'POST', body: JSON.stringify(await readJson(request)) });
    }
    const duelWs = url.pathname.match(/^\/ws\/duel\/([A-Z2-9]{6})$/);
    if (duelWs) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'upgrade_required' }, 426);
      const stub = env.DUELS.get(env.DUELS.idFromName(duelWs[1]));
      const internal = new URL('https://duel.internal/connect');
      internal.searchParams.set('token', url.searchParams.get('token') ?? '');
      return stub.fetch(new Request(internal, request));
    }

    const joinMatch = url.pathname.match(/^\/api\/lobbies\/([A-Z2-9]{6})\/join$/);
    if (joinMatch && request.method === 'POST') {
      const stub = env.LOBBIES.get(env.LOBBIES.idFromName(joinMatch[1]));
      return stub.fetch('https://lobby.internal/join', { method: 'POST', body: JSON.stringify(await readJson(request)) });
    }

    const wsMatch = url.pathname.match(/^\/ws\/([A-Z2-9]{6})$/);
    if (wsMatch) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'upgrade_required' }, 426);
      const stub = env.LOBBIES.get(env.LOBBIES.idFromName(wsMatch[1]));
      const internal = new URL('https://lobby.internal/connect');
      internal.searchParams.set('token', url.searchParams.get('token') ?? '');
      return stub.fetch(new Request(internal, request));
    }

    // ── Daily-challenge leaderboard (D1) ────────────────────────────────────

    if (url.pathname === `${APP_PREFIX}/api/daily-scores` && request.method === 'POST') {
      const body = await readJson(request).catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json({ error: 'invalid_submission' }, 400);
      }
      const date = String(body.date ?? '');
      const clientId = String(body.clientId ?? '');
      const squadName = String(body.squadName ?? '').trim().replace(/\s+/g, ' ');
      const score = body.score;
      if (!isSubmissionDate(date)
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)
          || !squadName || squadName.length > 28
          || !Number.isInteger(score) || score < 0 || score > DAILY_SCORE_MAX) {
        return json({ error: 'invalid_submission' }, 400);
      }
      // UNIQUE(date, client_id) + OR IGNORE = atomic once-per-day gate.
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO daily_scores (date, client_id, squad_name, score, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(date, clientId, squadName, score, Date.now()).run();
      return json({ accepted: result.meta.changes > 0 });
    }

    if (url.pathname === `${APP_PREFIX}/api/leaderboard/daily` && request.method === 'GET') {
      const date = url.searchParams.get('date') ?? '';
      if (!isValidDateKey(date)) return json({ error: 'invalid_date' }, 400);
      const { results } = await env.DB.prepare(
        `SELECT client_id, squad_name, score FROM daily_scores
         WHERE date = ? ORDER BY score DESC, created_at ASC LIMIT 50`,
      ).bind(date).all();
      return json({
        rows: results.map(r => ({ clientId: r.client_id, squadName: r.squad_name, score: r.score })),
      });
    }

    if (url.pathname === `${APP_PREFIX}/api/leaderboard/overall` && request.method === 'GET') {
      // Best single day per client; SQLite's bare-column rule pulls
      // squad_name from the same row as MAX(score). Scores from before the
      // Daily became one year were uncapped, so they stay out of this board.
      const { results } = await env.DB.prepare(
        `SELECT client_id, squad_name, MAX(score) AS best, COUNT(*) AS days
         FROM daily_scores WHERE created_at >= ?
         GROUP BY client_id ORDER BY best DESC LIMIT 50`,
      ).bind(DAILY_BOARD_START_MS).all();
      return json({
        rows: results.map(r => ({ clientId: r.client_id, squadName: r.squad_name, best: r.best, days: r.days })),
      });
    }

    if (!url.pathname.startsWith(`${APP_PREFIX}/`) && url.pathname !== APP_PREFIX) return new Response('Not found', { status: 404 });
    if (request.method === 'GET' && request.headers.get('Accept')?.includes('text/html') && url.pathname !== `${APP_PREFIX}/index.html`) {
      const fallback = new URL(`${APP_PREFIX}/`, url.origin);
      return withSecurityHeaders(await env.ASSETS.fetch(new Request(fallback, request)));
    }
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return withSecurityHeaders(assetResponse);
    if (request.method !== 'GET' || !request.headers.get('Accept')?.includes('text/html')) {
      return withSecurityHeaders(assetResponse);
    }
    const fallback = new URL(`${APP_PREFIX}/`, url.origin);
    return withSecurityHeaders(await env.ASSETS.fetch(new Request(fallback, request)));
}

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.game = null;
    this.auth = null;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(['game', 'auth']);
      const storedGame = stored.get('game') ?? null;
      const previousRulesVersion = storedGame?.rulesVersion ?? 1;
      this.game = migrateLobbyState(storedGame);
      this.auth = stored.get('auth') ?? { competitors: {}, spectators: {} };
      if (this.game && previousRulesVersion < this.game.rulesVersion) {
        await ctx.storage.put('game', this.game);
        const at = nextAlarmAt(this.game);
        if (at) await ctx.storage.setAlarm(Math.max(at, Date.now() + 1));
      }
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    try {
      if (url.pathname === '/create' && request.method === 'POST') return this.create(await readJson(request));
      if (url.pathname === '/join' && request.method === 'POST') return this.join(await readJson(request));
      if (url.pathname === '/connect') return this.connect(request, url.searchParams.get('token') ?? '');
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async create(body) {
    if (this.game) return json({ error: 'lobby_exists' }, 409);
    const now = Date.now();
    const competitorId = crypto.randomUUID();
    const sessionToken = randomToken();
    this.game = createLobbyState({
      code: body.code,
      hostId: competitorId,
      squadName: body.squadName,
      settings: body.settings,
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      now,
    });
    this.auth.competitors[competitorId] = await hashToken(sessionToken);
    await this.persistAndSchedule();
    return json({ lobbyCode: body.code, competitorId, sessionToken });
  }

  async join(body) {
    if (!this.game) return json({ error: 'lobby_not_found', message: 'Lobby not found.' }, 404);
    if (body.sessionToken) {
      const identity = await this.authenticate(body.sessionToken);
      if (identity) return json({ lobbyCode: this.game.code, ...identity, sessionToken: body.sessionToken, reconnected: true });
    }
    const now = Date.now();
    const sessionToken = randomToken();
    if (this.game.phase === 'lobby') {
      const competitorId = crypto.randomUUID();
      addCompetitor(this.game, { id: competitorId, squadName: body.squadName, now });
      this.auth.competitors[competitorId] = await hashToken(sessionToken);
      await this.persistAndSchedule();
      return json({ lobbyCode: this.game.code, competitorId, sessionToken, role: 'competitor' });
    }
    const spectatorId = crypto.randomUUID();
    addSpectator(this.game, { id: spectatorId, now });
    this.auth.spectators[spectatorId] = await hashToken(sessionToken);
    await this.persistAndSchedule();
    return json({ lobbyCode: this.game.code, spectatorId, sessionToken, role: 'spectator' });
  }

  async connect(request, token) {
    if (!this.game) return json({ error: 'lobby_not_found' }, 404);
    const identity = await this.authenticate(token);
    if (!identity) return json({ error: 'invalid_session' }, 401);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(identity);
    setConnection(this.game, identity.participantId, true, Date.now());
    await this.persistAndSchedule();
    server.send(JSON.stringify({ type: 'snapshot', snapshot: this.snapshotFor(identity) }));
    this.broadcast({ type: 'presence' }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.ready;
    const identity = ws.deserializeAttachment();
    try {
      const size = typeof message === 'string'
        ? new TextEncoder().encode(message).byteLength
        : message.byteLength;
      if (size > MAX_WEBSOCKET_MESSAGE_BYTES) {
        throw new GameError('invalid_command', 'Command is too large.');
      }
      const command = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
      const result = applyCommand(this.game, identity.participantId, command, cards, Date.now());
      if (!result.duplicate && command.type === 'kick_player') {
        delete this.auth.competitors[command.payload?.competitorId];
        for (const socket of this.ctx.getWebSockets()) {
          if (socket.deserializeAttachment()?.participantId === command.payload?.competitorId) socket.close(4001, 'Removed by host');
        }
      }
      if (!result.duplicate) await this.persistAndSchedule();
      this.broadcast({ type: 'state_patch', version: this.game.version, events: result.events });
    } catch (error) {
      if (!(error instanceof GameError)) {
        console.error(JSON.stringify({
          message: 'websocket command failed',
          error: error instanceof Error ? error.message : String(error),
        }));
      }
      ws.send(JSON.stringify({
        type: 'command_rejected',
        code: error.code ?? 'invalid_command',
        message: error instanceof GameError ? error.message : 'Invalid command.',
        snapshot: this.snapshotFor(identity),
      }));
    }
  }

  async webSocketClose(ws) {
    await this.ready;
    const identity = ws.deserializeAttachment();
    if (identity && !this.hasOtherSocket(identity.participantId, ws)) {
      setConnection(this.game, identity.participantId, false, Date.now());
      await this.persistAndSchedule();
      this.broadcast({ type: 'presence' });
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    await this.ready;
    if (!this.game) return;
    const now = Date.now();
    const noSockets = this.ctx.getWebSockets().length === 0;
    const noGameDeadline = !this.game.draft?.deadlineAt && !this.game.pendingTransition?.deadlineAt
      && !this.game.consolation?.deadlineAt && !this.game.seriesPrep?.deadlineAt;
    if (noSockets && noGameDeadline && now - this.game.lastActiveAt >= LOBBY_TTL_MS) {
      await this.ctx.storage.deleteAll();
      this.game = null;
      this.auth = { competitors: {}, spectators: {} };
      return;
    }
    const result = advanceDeadlines(this.game, cards, now);
    if (result.changed) {
      await this.persistAndSchedule();
      this.broadcast({ type: 'state_patch', version: this.game.version, events: result.events });
    } else {
      await this.scheduleAlarm();
    }
  }

  async authenticate(token) {
    if (!token) return null;
    const hash = await hashToken(token);
    for (const [participantId, stored] of Object.entries(this.auth.competitors)) {
      if (await timingSafeHashEqual(stored, hash)) return { participantId, role: 'competitor' };
    }
    for (const [participantId, stored] of Object.entries(this.auth.spectators)) {
      if (await timingSafeHashEqual(stored, hash)) return { participantId, role: 'spectator' };
    }
    return null;
  }

  hasOtherSocket(participantId, closingSocket) {
    return this.ctx.getWebSockets().some(socket => socket !== closingSocket && socket.deserializeAttachment()?.participantId === participantId);
  }

  snapshotFor(identity) {
    return publicSnapshot(this.game, Date.now(), identity?.participantId ?? null);
  }

  // Each socket gets its own snapshot, because a squad's hand and picks are
  // private until the series resolves.
  broadcast(payload, except = null) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try {
        socket.send(JSON.stringify({ ...payload, snapshot: this.snapshotFor(socket.deserializeAttachment()) }));
      } catch { /* stale sockets are cleaned up by the runtime */ }
    }
  }

  async persistAndSchedule() {
    await this.ctx.storage.put({ game: this.game, auth: this.auth });
    await this.scheduleAlarm();
  }

  async scheduleAlarm() {
    const at = this.game && nextAlarmAt(this.game);
    if (at) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 1));
    else await this.ctx.storage.deleteAlarm();
  }
}

/**
 * One live Club duel: two seats, a hashed token each, and the series state from
 * src/engine/duel.js. Same shell as Lobby (hibernating sockets, an alarm for
 * deadlines, a snapshot per socket), its own two-player game.
 */
export class Duel extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.duel = null;
    this.auth = {};
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(['duel', 'auth']);
      this.duel = stored.get('duel') ?? null;
      this.auth = stored.get('auth') ?? {};
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    try {
      if (url.pathname === '/create' && request.method === 'POST') return await this.create(await readJson(request));
      if (url.pathname === '/create-ranked' && request.method === 'POST') return await this.createRanked(await readJson(request));
      if (url.pathname === '/join' && request.method === 'POST') return await this.join(await readJson(request));
      if (url.pathname === '/connect') return await this.connect(request, url.searchParams.get('token') ?? '');
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      return duelErrorResponse(error);
    }
  }

  async create(body) {
    if (this.duel) return json({ error: 'duel_exists' }, 409);
    const seatId = crypto.randomUUID();
    const sessionToken = randomToken();
    this.duel = createDuel({
      code: body.code,
      hostId: seatId,
      club: body.club,
      squad: body.squad,
      bestOf: Number(body.bestOf),
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      cards,
      now: Date.now(),
    });
    this.auth[seatId] = await hashToken(sessionToken);
    await this.save();
    return json({ code: body.code, seatId, sessionToken, bestOf: this.duel.bestOf });
  }

  // From the Matchmaker only (it is not routed from outside): both seats known.
  async createRanked(body) {
    if (this.duel) return json({ error: 'duel_exists' }, 409);
    this.duel = createRankedDuel({ code: body.code, seats: body.seats, seed: crypto.getRandomValues(new Uint32Array(1))[0], cards, now: Date.now() });
    const tokens = {};
    for (const seat of body.seats.filter(s => !s.cpu)) {
      tokens[seat.id] = randomToken();
      this.auth[seat.id] = await hashToken(tokens[seat.id]);
    }
    await this.save();
    return json({ code: body.code, tokens });
  }

  async join(body) {
    if (!this.duel) return json({ error: 'duel_not_found', message: 'No match with that code.' }, 404);
    if (body.sessionToken) {
      const seatId = await this.authenticate(body.sessionToken);
      if (seatId) return json({ code: this.duel.code, seatId, sessionToken: body.sessionToken, bestOf: this.duel.bestOf, reconnected: true });
    }
    const seatId = crypto.randomUUID();
    const sessionToken = randomToken();
    joinDuel(this.duel, { id: seatId, club: body.club, squad: body.squad, cards, now: Date.now() });
    this.auth[seatId] = await hashToken(sessionToken);
    await this.save();
    this.broadcast();
    return json({ code: this.duel.code, seatId, sessionToken, bestOf: this.duel.bestOf });
  }

  async connect(request, token) {
    if (!this.duel) return json({ error: 'duel_not_found' }, 404);
    const seatId = await this.authenticate(token);
    if (!seatId) return json({ error: 'invalid_session' }, 401);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seatId });
    setPresence(this.duel, seatId, true, Date.now());
    advanceDuel(this.duel, Date.now());
    await this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.ready;
    const { seatId } = ws.deserializeAttachment() ?? {};
    try {
      const size = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
      if (size > MAX_WEBSOCKET_MESSAGE_BYTES) throw new DuelError('invalid_command', 'Command is too large.');
      const command = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
      if (command.type === 'sync') {
        ws.send(JSON.stringify({ type: 'snapshot', snapshot: duelSnapshot(this.duel, seatId, Date.now()) }));
        return;
      }
      const now = Date.now();
      const result = applyDuelCommand(this.duel, seatId, command, now);
      // A seat the AI plays answers straight away.
      advanceDuel(this.duel, now);
      if (!result.duplicate) await this.save();
      this.broadcast();
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'rejected',
        code: error.code ?? 'invalid_command',
        message: error instanceof DuelError ? error.message : 'Invalid command.',
        snapshot: duelSnapshot(this.duel, seatId, Date.now()),
      }));
    }
  }

  async webSocketClose(ws) {
    await this.ready;
    const { seatId } = ws.deserializeAttachment() ?? {};
    const others = this.ctx.getWebSockets().some(socket => socket !== ws && socket.deserializeAttachment()?.seatId === seatId);
    if (this.duel && seatId && !others) {
      setPresence(this.duel, seatId, false, Date.now());
      await this.save();
      this.broadcast();
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    await this.ready;
    if (!this.duel) return;
    const now = Date.now();
    if (!this.duel.board && this.ctx.getWebSockets().length === 0 && now >= nextDuelAlarm(this.duel)) {
      await this.ctx.storage.deleteAll();
      this.duel = null;
      this.auth = {};
      return;
    }
    const { changed } = advanceDuel(this.duel, now);
    await this.save();
    if (changed) this.broadcast();
  }

  async authenticate(token) {
    if (!token) return null;
    const hash = await hashToken(token);
    for (const [seatId, stored] of Object.entries(this.auth)) {
      if (await timingSafeHashEqual(stored, hash)) return seatId;
    }
    return null;
  }

  broadcast() {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ type: 'snapshot', snapshot: duelSnapshot(this.duel, socket.deserializeAttachment()?.seatId, now) }));
      } catch { /* stale sockets are cleaned up by the runtime */ }
    }
  }

  async save() {
    // A ranked series that just ended writes both ratings once, before anyone sees the result.
    const outcome = rankedOutcome(this.duel);
    if (outcome && this.env.ACCOUNTS) {
      try {
        this.duel.rated = await rateSeries(this.env.ACCOUNTS, outcome, Date.now());
      } catch (error) {
        console.error(JSON.stringify({ message: 'rating write failed', error: error instanceof Error ? error.message : String(error) }));
      }
    }
    await this.ctx.storage.put({ duel: this.duel, auth: this.auth });
    await this.ctx.storage.setAlarm(Math.max(nextDuelAlarm(this.duel), Date.now() + 1));
  }
}

function duelErrorResponse(error) {
  if (error instanceof DuelError) {
    const status = error.code === 'duel_full' ? 409 : error.code === 'unauthorized' ? 403 : 400;
    return json({ error: error.code, message: error.message }, status);
  }
  return errorResponse(error);
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function timingSafeHashEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(left))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(right))),
  ]);
  return crypto.subtle.timingSafeEqual(leftDigest, rightDigest);
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new GameError('payload_too_large', 'Request body is too large.');
  }
  if (!request.body) throw new GameError('invalid_json', 'Expected a JSON request body.');

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new GameError('payload_too_large', 'Request body is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof GameError) throw error;
    throw new GameError('invalid_json', 'Expected a JSON request body.');
  }
}

function errorResponse(error) {
  const isGameError = error instanceof GameError;
  const status = error?.code === 'payload_too_large' ? 413
    : error?.code === 'unauthorized' ? 403
    : error?.code?.includes('not_found') ? 404
    : isGameError ? 400
    : 500;
  return json({
    error: isGameError ? error.code : 'internal_error',
    message: isGameError ? error.message : 'Internal server error.',
  }, status);
}

function isValidDateKey(value) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isSubmissionDate(value, now = Date.now()) {
  if (!isValidDateKey(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const submitted = Date.UTC(year, month - 1, day);
  const current = new Date(now);
  const utcToday = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  // The client uses its local calendar day. A one-day UTC allowance covers
  // every timezone without permitting arbitrary historical/future entries.
  return Math.abs(submitted - utcToday) <= 24 * 60 * 60 * 1000;
}

function json(body, status = 200) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  applySecurityHeaders(secured.headers);
  return secured;
}

function applySecurityHeaders(headers) {
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://cdn.discordapp.com",
    "connect-src 'self' ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '));
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
}
