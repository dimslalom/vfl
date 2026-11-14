// VFL accounts: optional Discord sign-in, shared by every VFL product, plus the
// Clubs cloud save. Kept out of index.js (which imports cloudflare:workers) so
// node tests can drive it against a real SQLite copy of the schema.
//
// Routes (all under /api, same origin as the game):
//   GET    /api/auth/discord           start sign-in (top-level navigation)
//   GET    /api/auth/discord/callback  Discord sends the player back here
//   POST   /api/auth/logout            end this session
//   GET    /api/me                     { user } or { user: null }
//   GET    /api/club-save              this account's club, or { save: null }
//   PUT    /api/club-save              replace it with { save }
//   DELETE /api/club-save              remove it (club abandoned or sacked)
//   DELETE /api/account                delete the account and everything in it
//   POST   /api/leaderboard/club       submit or update club on the leaderboard
//   GET    /api/leaderboard/global     read global club standings

const SESSION_COOKIE = 'vfl_session';
const STATE_COOKIE = 'vfl_oauth';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const STATE_SECONDS = 600;
const MAX_SAVE_BYTES = 256 * 1024;
const DISCORD = 'https://discord.com';
const DEFAULT_NEXT = '/club';

/** Returns a Response for an account route, or null so the caller carries on. */
export async function handleAccounts(request, env, { fetcher = fetch, now = Date.now } = {}) {
  // `wrangler dev` rewrites the host to the custom domain, so local sign-in sets
  // AUTH_ORIGIN=http://localhost:8787 in .dev.vars. Production leaves it unset.
  const seen = new URL(request.url);
  const url = new URL(`${seen.pathname}${seen.search}`, env.AUTH_ORIGIN || seen.origin);
  // Writes must carry the game's Origin. `wrangler dev` rewrites that header to
  // the custom domain too, so the host the Worker saw also counts.
  const origins = [url.origin, seen.origin];
  const route = `${request.method} ${url.pathname}`;
  const routes = {
    'GET /api/auth/discord': () => startSignIn(url, env),
    'GET /api/auth/discord/callback': () => finishSignIn(request, url, env, fetcher, now()).catch((error) => {
      // A player mid-sign-in lands back on the game with a notice, never on raw JSON.
      console.error(JSON.stringify({ message: 'sign-in failed', error: error instanceof Error ? error.message : String(error) }));
      const target = new URL(DEFAULT_NEXT, url.origin);
      target.searchParams.set('signin', 'failed');
      return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
    }),
    'POST /api/auth/logout': () => logout(request, url, env, origins),
    'GET /api/me': () => me(request, env, now()),
    'GET /api/club-save': () => readClubSave(request, env, now()),
    'PUT /api/club-save': () => writeClubSave(request, origins, env, now()),
    'DELETE /api/club-save': () => deleteClubSave(request, origins, env, now()),
    'DELETE /api/account': () => deleteAccount(request, url, env, now(), origins),
    'POST /api/leaderboard/club': () => writeClubLeaderboard(request, origins, env, now()),
    'GET /api/leaderboard/global': () => readGlobalLeaderboard(request, url, env, now()),
  };
  const handler = routes[route];
  if (!handler) return null;
  if (!env.ACCOUNTS) return json({ error: 'accounts_unavailable' }, 503);
  return handler();
}

// ── sign-in ─────────────────────────────────────────────────────────────────

function redirectUri(url) {
  return `${url.origin}/api/auth/discord/callback`;
}

/** Only a same-site path may follow sign-in, never another host. */
export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return DEFAULT_NEXT;
  return value.length > 200 ? DEFAULT_NEXT : value;
}

function startSignIn(url, env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return json({ error: 'signin_unavailable' }, 503);
  const state = randomToken();
  const next = safeNext(url.searchParams.get('next'));
  const authorize = new URL(`${DISCORD}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri(url),
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none',
  }).toString();
  const headers = new Headers({ Location: authorize.toString(), 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(url, STATE_COOKIE, `${state}.${encodeURIComponent(next)}`, { maxAge: STATE_SECONDS, path: '/api/auth' }));
  return new Response(null, { status: 302, headers });
}

async function finishSignIn(request, url, env, fetcher, at) {
  const [state, nextRaw] = (readCookie(request, STATE_COOKIE) ?? '').split('.');
  const next = safeNext(nextRaw ? decodeURIComponent(nextRaw) : DEFAULT_NEXT);
  const back = (result, extra = []) => {
    const target = new URL(next, url.origin);
    if (result) target.searchParams.set('signin', result);
    const headers = new Headers({ Location: target.toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie(url, STATE_COOKIE, '', { maxAge: 0, path: '/api/auth' }));
    for (const value of extra) headers.append('Set-Cookie', value);
    return new Response(null, { status: 302, headers });
  };

  if (url.searchParams.get('error')) return back('cancelled');
  const code = url.searchParams.get('code');
  const returned = url.searchParams.get('state');
  if (!code || !state || !returned || !(await sameSecret(state, returned))) return back('failed');

  const token = await fetcher(`${DISCORD}/api/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(url),
    }).toString(),
  });
  if (!token.ok) return back('failed');
  const { access_token: accessToken } = await token.json();
  const profile = await fetcher(`${DISCORD}/api/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!profile.ok) return back('failed');
  const discord = await profile.json();
  if (!discord?.id) return back('failed');

  const userId = await upsertUser(env.ACCOUNTS, discord, at);
  const sessionToken = randomToken();
  await env.ACCOUNTS.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hashToken(sessionToken), userId, at, at + SESSION_MS).run();
  return back(null, [cookie(url, SESSION_COOKIE, sessionToken, { maxAge: SESSION_MS / 1000, path: '/' })]);
}

async function upsertUser(db, discord, at) {
  const name = String(discord.global_name || discord.username || 'Player').slice(0, 64);
  const avatar = typeof discord.avatar === 'string' ? discord.avatar : null;
  const existing = await db.prepare('SELECT id FROM users WHERE discord_id = ?').bind(String(discord.id)).first();
  if (existing) {
    await db.prepare('UPDATE users SET username = ?, avatar = ?, updated_at = ? WHERE id = ?').bind(name, avatar, at, existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users (id, discord_id, username, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, String(discord.id), name, avatar, at, at).run();
  return id;
}

// ── sessions ────────────────────────────────────────────────────────────────

export async function currentUser(request, env, at) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const hash = await hashToken(token);
  const row = await env.ACCOUNTS.prepare(
    `SELECT users.id, users.discord_id, users.username, users.avatar, sessions.expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?`,
  ).bind(hash).first();
  if (!row) return null;
  if (row.expires_at <= at) {
    await env.ACCOUNTS.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  return { ...row, hash };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=64` : null,
  };
}

async function me(request, env, at) {
  const user = await currentUser(request, env, at);
  return json({ user: user ? publicUser(user) : null });
}

async function logout(request, url, env, origins) {
  if (!sameOrigin(request, origins)) return json({ error: 'forbidden' }, 403);
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.ACCOUNTS.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  return json({ ok: true }, 200, [cookie(url, SESSION_COOKIE, '', { maxAge: 0, path: '/' })]);
}

async function deleteAccount(request, url, env, at, origins) {
  if (!sameOrigin(request, origins)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env, at);
  if (!user) return json({ error: 'signed_out' }, 401);
  await env.ACCOUNTS.batch([
    env.ACCOUNTS.prepare('DELETE FROM club_saves WHERE user_id = ?').bind(user.id),
    env.ACCOUNTS.prepare('DELETE FROM club_leaderboard WHERE user_id = ? OR id = ?').bind(user.id, user.id),
    env.ACCOUNTS.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.ACCOUNTS.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json({ ok: true }, 200, [cookie(url, SESSION_COOKIE, '', { maxAge: 0, path: '/' })]);
}

// ── Club leaderboard ────────────────────────────────────────────────────────

async function writeClubLeaderboard(request, origins, env, at) {
  if (!sameOrigin(request, origins)) return json({ error: 'forbidden' }, 403);
  const text = await readText(request, MAX_SAVE_BYTES);
  if (text === null) return json({ error: 'payload_too_large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_submission' }, 400);

  const user = await currentUser(request, env, at);
  const clientId = typeof body.clientId === 'string' && /^[0-9a-f-]{8,64}$/i.test(body.clientId.trim())
    ? body.clientId.trim()
    : null;
  const id = user ? user.id : clientId;
  if (!id) return json({ error: 'invalid_submission' }, 400);

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 32) : '';
  // Parts crests are saved as codes up to 160 characters; colourways as an index.
  const crest = typeof body.crest === 'string' ? body.crest.trim().slice(0, 160) : 'laurel';
  const tone = Number.isInteger(body.tone) && body.tone >= 0 && body.tone < 100 ? String(body.tone)
    : typeof body.tone === 'string' ? body.tone.trim().slice(0, 32) : 'sunset';
  const score = Number.isInteger(body.score) && body.score >= 0 ? Math.min(body.score, 10000000) : 0;
  const power = Number.isInteger(body.power) && body.power >= 0 ? Math.min(body.power, 150) : 80;
  const w = Number.isInteger(body.w) && body.w >= 0 ? Math.min(body.w, 1000) : 0;
  const l = Number.isInteger(body.l) && body.l >= 0 ? Math.min(body.l, 1000) : 0;
  const starCardId = typeof body.starCardId === 'string' ? body.starCardId.slice(0, 64) : null;
  const cardIds = Array.isArray(body.cardIds)
    ? body.cardIds.filter(item => typeof item === 'string').slice(0, 10)
    : [];

  if (!name) return json({ error: 'invalid_submission' }, 400);

  await env.ACCOUNTS.prepare(
    `INSERT INTO club_leaderboard (id, user_id, club_name, crest, tone, score, power, w, l, star_card_id, card_ids, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       club_name = excluded.club_name,
       crest = excluded.crest,
       tone = excluded.tone,
       score = excluded.score,
       power = excluded.power,
       w = excluded.w,
       l = excluded.l,
       star_card_id = excluded.star_card_id,
       card_ids = excluded.card_ids,
       updated_at = excluded.updated_at`,
  ).bind(
    id,
    user ? user.id : null,
    name,
    crest,
    tone,
    score,
    power,
    w,
    l,
    starCardId,
    JSON.stringify(cardIds),
    at,
  ).run();

  if (user && clientId && clientId !== user.id) {
    await env.ACCOUNTS.prepare('DELETE FROM club_leaderboard WHERE id = ?').bind(clientId).run();
  }

  return json({ ok: true, id });
}

async function readGlobalLeaderboard(request, url, env, at) {
  const user = await currentUser(request, env, at);
  const clientId = url.searchParams.get('clientId');
  const myId = user ? user.id : (clientId || null);

  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;

  const { results } = await env.ACCOUNTS.prepare(
    `SELECT id, user_id, club_name, crest, tone, score, power, w, l, star_card_id, card_ids, updated_at
     FROM club_leaderboard
     ORDER BY score DESC, power DESC, updated_at ASC
     LIMIT ?`,
  ).bind(limit).all();

  const rows = (results ?? []).map((r, index) => ({
    pos: index + 1,
    id: r.id,
    name: r.club_name,
    style: r.crest,
    tone: r.tone,
    score: r.score,
    power: r.power,
    w: r.w,
    l: r.l,
    starCardId: r.star_card_id,
    cardIds: r.card_ids ? JSON.parse(r.card_ids) : [],
    isYou: Boolean(myId && (r.id === myId || (r.user_id && user && r.user_id === user.id))),
  }));

  let userRow = null;
  const inList = rows.some(r => r.isYou);
  if (!inList && myId) {
    const caller = await env.ACCOUNTS.prepare(
      `SELECT id, user_id, club_name, crest, tone, score, power, w, l, star_card_id, card_ids, updated_at
       FROM club_leaderboard WHERE id = ? OR (user_id IS NOT NULL AND user_id = ?)`,
    ).bind(myId, myId).first();

    if (caller) {
      const ahead = await env.ACCOUNTS.prepare(
        `SELECT COUNT(*) AS n FROM club_leaderboard
         WHERE score > ? OR (score = ? AND power > ?) OR (score = ? AND power = ? AND updated_at < ?)`,
      ).bind(caller.score, caller.score, caller.power, caller.score, caller.power, caller.updated_at).first();

      userRow = {
        pos: (ahead?.n ?? 0) + 1,
        id: caller.id,
        name: caller.club_name,
        style: caller.crest,
        tone: caller.tone,
        score: caller.score,
        power: caller.power,
        w: caller.w,
        l: caller.l,
        starCardId: caller.star_card_id,
        cardIds: caller.card_ids ? JSON.parse(caller.card_ids) : [],
        isYou: true,
      };
    }
  }

  return json({ rows, userRow });
}

// ── Clubs save ──────────────────────────────────────────────────────────────

async function readClubSave(request, env, at) {
  const user = await currentUser(request, env, at);
  if (!user) return json({ error: 'signed_out' }, 401);
  const row = await env.ACCOUNTS.prepare('SELECT save, updated_at FROM club_saves WHERE user_id = ?').bind(user.id).first();
  return json(row ? { save: JSON.parse(row.save), updatedAt: row.updated_at } : { save: null, updatedAt: null });
}

async function writeClubSave(request, origins, env, at) {
  if (!sameOrigin(request, origins)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env, at);
  if (!user) return json({ error: 'signed_out' }, 401);
  const text = await readText(request, MAX_SAVE_BYTES);
  if (text === null) return json({ error: 'payload_too_large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid_json' }, 400); }
  const save = body?.save;
  if (!save || typeof save !== 'object' || Array.isArray(save) || !Number.isInteger(save.v)) return json({ error: 'invalid_save' }, 400);
  await env.ACCOUNTS.prepare(
    `INSERT INTO club_saves (user_id, save, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at`,
  ).bind(user.id, JSON.stringify(save), at).run();
  return json({ updatedAt: at });
}

async function deleteClubSave(request, origins, env, at) {
  if (!sameOrigin(request, origins)) return json({ error: 'forbidden' }, 403);
  const user = await currentUser(request, env, at);
  if (!user) return json({ error: 'signed_out' }, 401);
  await env.ACCOUNTS.prepare('DELETE FROM club_saves WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true });
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Writes must come from the game's own pages, so another site can't act for a signed-in player. */
function sameOrigin(request, origins) {
  const origin = request.headers.get('Origin');
  return Boolean(origin) && origins.includes(origin);
}

function cookie(url, name, value, { maxAge, path }) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=${path}; Max-Age=${Math.floor(maxAge)}; HttpOnly; SameSite=Lax${secure}`;
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

async function readText(request, limit) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).byteLength > limit ? null : text;
}

function json(body, status = 200, cookies = []) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(body), { status, headers });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Compares two strings without leaking where they differ. Node has no
// crypto.subtle.timingSafeEqual, so compare fixed-length digests byte by byte.
async function sameSecret(left, right) {
  const [a, b] = await Promise.all([hashToken(String(left)), hashToken(String(right))]);
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
