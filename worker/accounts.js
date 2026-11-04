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
    'GET /api/auth/discord/callback': () => finishSignIn(request, url, env, fetcher, now()),
    'POST /api/auth/logout': () => logout(request, url, env, origins),
    'GET /api/me': () => me(request, env, now()),
    'GET /api/club-save': () => readClubSave(request, env, now()),
    'PUT /api/club-save': () => writeClubSave(request, origins, env, now()),
    'DELETE /api/club-save': () => deleteClubSave(request, origins, env, now()),
    'DELETE /api/account': () => deleteAccount(request, url, env, now(), origins),
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

async function currentUser(request, env, at) {
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
    env.ACCOUNTS.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.ACCOUNTS.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json({ ok: true }, 200, [cookie(url, SESSION_COOKIE, '', { maxAge: 0, path: '/' })]);
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
