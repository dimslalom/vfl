// Ranked Clubs: the queue (one Matchmaker Durable Object) and the rating rows.
//   GET    /api/rating              your rating, rank and form ({ rating: null } signed out)
//   POST   /api/match/queue         join the queue with { club, squad }: { ticket }
//   GET    /api/match/ticket/:id    { status: 'waiting', waitedMs } or { status: 'matched', ... }
//   DELETE /api/match/ticket/:id    leave the queue
// Queueing needs Discord sign-in. A match is a ranked Duel object; a ticket that
// waits CPU_AFTER_MS gets a real club's five, played by the AI, instead.
import { DurableObject } from 'cloudflare:workers';
import cards from '../shared/src/data/cards.json';
import { freshRating, rankFor, settleRanked, utcDay } from '../src/engine/club/rating.js';
import { DuelError, sanitizeRoster } from '../src/engine/duel.js';
import { dueForCpu, findPairs, idleTickets } from '../src/engine/matchmaking.js';
import { currentUser } from './accounts.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STARTERS = 5;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ── rating rows ─────────────────────────────────────────────────────────────

export async function loadRating(db, userId) {
  const row = await db.prepare('SELECT rating, games, wins, form, first_win_day FROM club_rating WHERE user_id = ?').bind(userId).first();
  return row ? { rating: row.rating, games: row.games, wins: row.wins, form: row.form, firstWinDay: row.first_win_day } : freshRating();
}

async function saveRating(db, userId, row, at) {
  await db.prepare(
    `INSERT INTO club_rating (user_id, rating, games, wins, form, first_win_day, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, games = excluded.games, wins = excluded.wins,
       form = excluded.form, first_win_day = excluded.first_win_day, updated_at = excluded.updated_at`,
  ).bind(userId, row.rating, row.games, row.wins, row.form, row.firstWinDay, at).run();
}

/**
 * Writes a finished ranked series: every human seat settles against the other
 * seat's rating from before the series (null for the CPU). Returns each seat's
 * change, in seat order, for the result screen.
 */
export async function rateSeries(db, outcome, now) {
  const day = utcDay(now);
  const before = await Promise.all(outcome.map(s => (s.userId ? loadRating(db, s.userId) : null)));
  return Promise.all(outcome.map(async (s, index) => {
    if (!s.userId) return null;
    const other = outcome[1 - index];
    const opponent = other.cpu ? null : before[1 - index]?.rating ?? null;
    const { row, delta, firstWin } = settleRanked(before[index], { won: s.won, opponent, day });
    await saveRating(db, s.userId, row, now);
    return { before: before[index].rating, after: row.rating, delta, firstWin, rank: rankFor(row.rating).name, form: row.form };
  }));
}

function publicRating(row, now) {
  return { ...row, rank: rankFor(row.rating), firstWinReady: row.firstWinDay !== utcDay(now) };
}

// ── routes ──────────────────────────────────────────────────────────────────

export async function handleRanked(request, env) {
  const url = new URL(request.url);
  const ticketMatch = url.pathname.match(/^\/api\/match\/ticket\/([0-9a-f-]{36})$/);
  const isQueue = url.pathname === '/api/match/queue' && request.method === 'POST';
  const isRating = url.pathname === '/api/rating' && request.method === 'GET';
  if (!isQueue && !isRating && !ticketMatch) return null;
  if (!env.ACCOUNTS) return json({ error: 'accounts_unavailable' }, 503);
  const now = Date.now();
  const user = await currentUser(request, env, now);
  if (isRating) return json({ rating: user ? publicRating(await loadRating(env.ACCOUNTS, user.id), now) : null });
  if (!user) return json({ error: 'signed_out', message: 'Sign in with Discord to play ranked.' }, 401);
  const queue = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
  if (isQueue) {
    const body = await request.json().catch(() => null);
    const rating = await loadRating(env.ACCOUNTS, user.id);
    return queue.fetch('https://queue.internal/enqueue', { method: 'POST', body: JSON.stringify({ userId: user.id, rating: rating.rating, club: body?.club, squad: body?.squad }) });
  }
  const verb = request.method === 'DELETE' ? 'cancel' : 'poll';
  return queue.fetch(`https://queue.internal/${verb}`, { method: 'POST', body: JSON.stringify({ id: ticketMatch[1], userId: user.id }) });
}

// ── the queue ───────────────────────────────────────────────────────────────

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

const average = roster => roster.reduce((sum, card) => sum + card.rating, 0) / roster.length;

/**
 * Every ranked ticket in one place. Polling drives it: each poll drops tabs that
 * stopped polling, pairs who it can, and gives the CPU to whoever waited long
 * enough. ponytail: one global object; shard by region if the queue gets busy.
 */
export class Matchmaker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.tickets = new Map();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      for (const ticket of (await ctx.storage.get('tickets')) ?? []) this.tickets.set(ticket.id, ticket);
    });
  }

  async fetch(request) {
    await this.ready;
    const verb = new URL(request.url).pathname.slice(1);
    const body = await request.json();
    const now = Date.now();
    try {
      if (verb === 'enqueue') return json({ ticket: await this.enqueue(body, now) });
      const ticket = this.tickets.get(body.id);
      if (!ticket || ticket.userId !== body.userId) return json({ error: 'ticket_not_found' }, 404);
      if (verb === 'cancel') {
        this.tickets.delete(ticket.id);
        await this.persist();
        return json({ ok: true });
      }
      ticket.polledAt = now;
      await this.step(now);
      if (!ticket.match) return json({ status: 'waiting', waitedMs: now - ticket.enqueuedAt });
      // Handed over once: the seat's token lives in the tab from here on.
      this.tickets.delete(ticket.id);
      await this.persist();
      return json({ status: 'matched', ...ticket.match });
    } catch (error) {
      if (error instanceof DuelError) return json({ error: error.code, message: error.message }, 400);
      throw error;
    }
  }

  async enqueue({ userId, rating, club, squad }, now) {
    // One ticket per account: queueing again replaces the old one.
    for (const old of this.tickets.values()) if (old.userId === userId && !old.match) this.tickets.delete(old.id);
    const roster = sanitizeRoster(Array.isArray(squad) ? squad.slice(0, STARTERS) : squad, cards);
    const ticket = { id: crypto.randomUUID(), userId, rating, power: average(roster), club, squad: roster, enqueuedAt: now, polledAt: now, match: null };
    this.tickets.set(ticket.id, ticket);
    await this.persist();
    return { id: ticket.id };
  }

  async step(now) {
    for (const ticket of idleTickets([...this.tickets.values()], now)) this.tickets.delete(ticket.id);
    const all = [...this.tickets.values()];
    for (const [a, b] of findPairs(all, now)) await this.startDuel([a, b], null);
    for (const ticket of dueForCpu([...this.tickets.values()], now)) await this.startDuel([ticket], await this.cpuClub(ticket));
    await this.persist();
  }

  /** A real club near this one's power from the global table, or a pickup five. */
  async cpuClub(ticket) {
    const { results } = await this.env.ACCOUNTS.prepare(
      `SELECT club_name, crest, tone, power, card_ids FROM club_leaderboard
       WHERE (user_id IS NULL OR user_id != ?) AND card_ids IS NOT NULL
       ORDER BY ABS(power - ?) LIMIT 8`,
    ).bind(ticket.userId, Math.round(ticket.power)).all().catch(() => ({ results: [] }));
    const lookup = new Map(cards.map(card => [card.id, card]));
    const clubs = (results ?? [])
      .map(row => ({ club: { name: row.club_name, crest: row.crest, tone: row.tone }, squad: JSON.parse(row.card_ids).slice(0, STARTERS).map(id => lookup.get(id)).filter(Boolean) }))
      .filter(club => club.squad.length === STARTERS && new Set(club.squad.map(card => card.id)).size === STARTERS);
    if (clubs.length) return clubs[Math.floor(Math.random() * clubs.length)];
    // No table yet (a fresh deploy): five pros around the same rating.
    const near = cards
      .filter(card => card.stats && card.role)
      .map(card => ({ card, gap: Math.abs(card.rating - ticket.power) + Math.random() * 3 }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, STARTERS)
      .map(item => item.card);
    return { club: { name: 'Pickup Five', crest: null, tone: null }, squad: near };
  }

  async startDuel(humans, cpu) {
    const seats = humans.map(t => ({ id: crypto.randomUUID(), userId: t.userId, club: t.club, squad: t.squad }));
    if (cpu) seats.push({ id: 'cpu', cpu: true, club: cpu.club, squad: cpu.squad });
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode();
      const stub = this.env.DUELS.get(this.env.DUELS.idFromName(code));
      const response = await stub.fetch('https://duel.internal/create-ranked', { method: 'POST', body: JSON.stringify({ code, seats }) });
      if (response.status === 409) continue;
      const created = await response.json();
      if (!response.ok) throw new DuelError(created.error ?? 'queue_failed', created.message ?? 'Could not start the match.');
      humans.forEach((ticket, index) => {
        ticket.match = { code, seatId: seats[index].id, sessionToken: created.tokens[seats[index].id], bestOf: 3, cpu: Boolean(cpu) };
      });
      return;
    }
    throw new DuelError('code_generation_failed', 'Could not allocate a match code.');
  }

  persist() {
    return this.ctx.storage.put('tickets', [...this.tickets.values()]);
  }
}
