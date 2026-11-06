import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleAccounts, readCookie, safeNext } from '../worker/accounts.js';

const ORIGIN = 'https://vctfantasy.dimas.works';
const MIGRATIONS_DIR = new URL('../worker/migrations/accounts/', import.meta.url);
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));

// A D1-shaped wrapper over real SQLite, so the routes run the migration's schema.
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration);
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return {
    prepare: sql => statement(sql),
    batch: async list => { for (const item of list) await item.run(); },
    count: table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
  };
}

function discord(profile = { id: '42', username: 'kozzy', global_name: 'Kozzy', avatar: 'abc' }) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/api/oauth2/token')) return Response.json({ access_token: 'discord-token' });
    if (String(url).endsWith('/api/users/@me')) return Response.json(profile);
    return new Response('no', { status: 404 });
  };
  return { fetcher, calls };
}

const env = (db = d1()) => ({ ACCOUNTS: db, DISCORD_CLIENT_ID: 'client-id', DISCORD_CLIENT_SECRET: 'client-secret' });

function request(path, { method = 'GET', cookie, origin, body } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (origin) headers.set('Origin', origin);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const cookieValue = (response, name) => {
  const match = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  return match ? match.split(';')[0].slice(name.length + 1) : null;
};

async function signIn(environment, { next = '/club', profile, now } = {}) {
  const { fetcher, calls } = discord(profile);
  const start = await handleAccounts(request(`/api/auth/discord?next=${encodeURIComponent(next)}`), environment);
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = cookieValue(start, 'vfl_oauth');
  const done = await handleAccounts(
    request(`/api/auth/discord/callback?code=the-code&state=${state}`, { cookie: `vfl_oauth=${stateCookie}` }),
    environment,
    { fetcher, now },
  );
  return { start, done, calls, session: cookieValue(done, 'vfl_session') };
}

test('only same-site paths may follow sign-in', () => {
  assert.equal(safeNext('/club'), '/club');
  assert.equal(safeNext('/lab/landing?x=1'), '/lab/landing?x=1');
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '', null, `/${'a'.repeat(300)}`]) assert.equal(safeNext(bad), '/club');
});

test('cookies are read by exact name', () => {
  const req = request('/', { cookie: 'a=1; vfl_session=tok; vfl_sessionx=no' });
  assert.equal(readCookie(req, 'vfl_session'), 'tok');
  assert.equal(readCookie(req, 'missing'), null);
});

test('other routes fall through, and a missing database or secret says so', async () => {
  assert.equal(await handleAccounts(request('/api/lobbies', { method: 'POST' }), env()), null);
  assert.equal((await handleAccounts(request('/api/me'), {})).status, 503);
  assert.equal((await handleAccounts(request('/api/auth/discord'), { ACCOUNTS: d1() })).status, 503);
});

test('sign-in sends the player to Discord asking for identify only', async () => {
  const response = await handleAccounts(request('/api/auth/discord?next=//evil.example'), env());
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  assert.equal(location.origin + location.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(location.searchParams.get('client_id'), 'client-id');
  assert.equal(location.searchParams.get('scope'), 'identify');
  assert.equal(location.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth/discord/callback`);
  const setCookie = response.headers.getSetCookie()[0];
  assert.match(setCookie, /^vfl_oauth=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.ok(cookieValue(response, 'vfl_oauth').endsWith(encodeURIComponent('/club')), 'unsafe next was replaced');
});

test('a full sign-in creates one user and a session, and me reports them', async () => {
  const environment = env();
  const { done, calls, session } = await signIn(environment, { next: '/club' });
  assert.equal(done.status, 302);
  assert.equal(done.headers.get('Location'), `${ORIGIN}/club`);
  assert.ok(session);
  const tokenCall = new URLSearchParams(calls[0].init.body);
  assert.equal(tokenCall.get('client_secret'), 'client-secret');
  assert.equal(tokenCall.get('redirect_uri'), `${ORIGIN}/api/auth/discord/callback`);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer discord-token');

  const meResponse = await (await handleAccounts(request('/api/me', { cookie: `vfl_session=${session}` }), environment)).json();
  assert.equal(meResponse.user.name, 'Kozzy');
  assert.equal(meResponse.user.avatar, 'https://cdn.discordapp.com/avatars/42/abc.png?size=64');

  await signIn(environment, { profile: { id: '42', username: 'kozzy', global_name: 'New name', avatar: null } });
  assert.equal(environment.ACCOUNTS.count('users'), 1, 'the same Discord account is one user');
  assert.equal(environment.ACCOUNTS.count('sessions'), 2);
});

test('a wrong or missing state, or a cancel, never signs anyone in', async () => {
  const environment = env();
  const { fetcher } = discord();
  const forged = await handleAccounts(request('/api/auth/discord/callback?code=c&state=forged', { cookie: 'vfl_oauth=real.%2Fclub' }), environment, { fetcher });
  assert.equal(new URL(forged.headers.get('Location')).searchParams.get('signin'), 'failed');
  assert.equal(cookieValue(forged, 'vfl_session'), null);
  const noCookie = await handleAccounts(request('/api/auth/discord/callback?code=c&state=x'), environment, { fetcher });
  assert.equal(new URL(noCookie.headers.get('Location')).searchParams.get('signin'), 'failed');
  const cancelled = await handleAccounts(request('/api/auth/discord/callback?error=access_denied', { cookie: 'vfl_oauth=s.%2Fclub' }), environment, { fetcher });
  assert.equal(new URL(cancelled.headers.get('Location')).searchParams.get('signin'), 'cancelled');
  assert.equal(environment.ACCOUNTS.count('users'), 0);
});

test('the club save round-trips, and writes need the game origin', async () => {
  const environment = env();
  const { session } = await signIn(environment);
  const cookie = `vfl_session=${session}`;
  const empty = await (await handleAccounts(request('/api/club-save', { cookie }), environment)).json();
  assert.deepEqual(empty, { save: null, updatedAt: null });

  const save = { v: 2, name: 'Night Shift', year: 1 };
  assert.equal((await handleAccounts(request('/api/club-save', { method: 'PUT', cookie, body: { save } }), environment)).status, 403);
  assert.equal((await handleAccounts(request('/api/club-save', { method: 'PUT', cookie, origin: 'https://evil.example', body: { save } }), environment)).status, 403);
  const put = await handleAccounts(request('/api/club-save', { method: 'PUT', cookie, origin: ORIGIN, body: { save } }), environment, { now: () => 1000 });
  assert.deepEqual(await put.json(), { updatedAt: 1000 });
  const stored = await (await handleAccounts(request('/api/club-save', { cookie }), environment)).json();
  assert.deepEqual(stored, { save, updatedAt: 1000 });

  assert.equal((await handleAccounts(request('/api/club-save', { method: 'PUT', cookie, origin: ORIGIN, body: { save: { name: 'no version' } } }), environment)).status, 400);
  const huge = { v: 2, blob: 'x'.repeat(300 * 1024) };
  assert.equal((await handleAccounts(request('/api/club-save', { method: 'PUT', cookie, origin: ORIGIN, body: { save: huge } }), environment)).status, 413);

  assert.equal((await handleAccounts(request('/api/club-save', { method: 'DELETE', cookie, origin: ORIGIN }), environment)).status, 200);
  assert.equal(environment.ACCOUNTS.count('club_saves'), 0);
});

test('signed out reads and writes are refused', async () => {
  const environment = env();
  assert.equal((await handleAccounts(request('/api/club-save'), environment)).status, 401);
  assert.equal((await handleAccounts(request('/api/club-save', { method: 'PUT', origin: ORIGIN, body: { save: { v: 2 } } }), environment)).status, 401);
  assert.deepEqual(await (await handleAccounts(request('/api/me', { cookie: 'vfl_session=made-up' }), environment)).json(), { user: null });
});

test('an expired session is dropped', async () => {
  const environment = env();
  const { session } = await signIn(environment, { now: () => 0 });
  const later = 31 * 24 * 60 * 60 * 1000;
  const response = await handleAccounts(request('/api/me', { cookie: `vfl_session=${session}` }), environment, { now: () => later });
  assert.deepEqual(await response.json(), { user: null });
  assert.equal(environment.ACCOUNTS.count('sessions'), 0);
});

test('sign out ends the session; delete account removes everything', async () => {
  const environment = env();
  const first = await signIn(environment);
  const logout = await handleAccounts(request('/api/auth/logout', { method: 'POST', cookie: `vfl_session=${first.session}`, origin: ORIGIN }), environment);
  assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);
  assert.equal(environment.ACCOUNTS.count('sessions'), 0);

  const { session } = await signIn(environment);
  const cookie = `vfl_session=${session}`;
  await handleAccounts(request('/api/club-save', { method: 'PUT', cookie, origin: ORIGIN, body: { save: { v: 2 } } }), environment);
  assert.equal((await handleAccounts(request('/api/account', { method: 'DELETE', cookie }), environment)).status, 403);
  assert.equal((await handleAccounts(request('/api/account', { method: 'DELETE', cookie, origin: ORIGIN }), environment)).status, 200);
  for (const table of ['users', 'sessions', 'club_saves', 'club_leaderboard']) assert.equal(environment.ACCOUNTS.count(table), 0, table);
});

test('club leaderboard accepts guest and signed-in scores, and ranks by score and power', async () => {
  const environment = env();

  // Guest club submission
  const guestRes = await handleAccounts(request('/api/leaderboard/club', {
    method: 'POST',
    origin: ORIGIN,
    body: {
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Guest Stars',
      crest: 'slash',
      tone: 'crimson',
      score: 1500,
      power: 80,
      w: 8,
      l: 4,
      starCardId: 'card-1',
      cardIds: ['card-1', 'card-2'],
    },
  }), environment);
  assert.equal(guestRes.status, 200);

  // Signed-in user submission
  const { session } = await signIn(environment, { profile: { id: '99', username: 'pro_gamer', global_name: 'Pro', avatar: null } });
  const userRes = await handleAccounts(request('/api/leaderboard/club', {
    method: 'POST',
    cookie: `vfl_session=${session}`,
    origin: ORIGIN,
    body: {
      name: 'Champion Club',
      crest: 'laurel',
      tone: 'gold',
      score: 2500,
      power: 85,
      w: 12,
      l: 2,
      starCardId: 'card-pro',
      cardIds: ['card-pro', 'card-3'],
    },
  }), environment);
  assert.equal(userRes.status, 200);

  // Read leaderboard
  const listRes = await handleAccounts(request('/api/leaderboard/global'), environment);
  assert.equal(listRes.status, 200);
  const data = await listRes.json();
  assert.equal(data.rows.length, 2);
  assert.equal(data.rows[0].name, 'Champion Club');
  assert.equal(data.rows[0].pos, 1);
  assert.equal(data.rows[1].name, 'Guest Stars');
  assert.equal(data.rows[1].pos, 2);

  // Cross-origin write rejected
  const fakeRes = await handleAccounts(request('/api/leaderboard/club', {
    method: 'POST',
    origin: 'https://evil.site',
    body: { clientId: '550e8400-e29b-41d4-a716-446655440000', name: 'Fake' },
  }), environment);
  assert.equal(fakeRes.status, 403);
});

test('local dev can name its own origin for the redirect and the write check', async () => {
  const local = { ...env(), AUTH_ORIGIN: 'http://localhost:8787' };
  const start = await handleAccounts(request('/api/auth/discord'), local);
  assert.equal(new URL(start.headers.get('Location')).searchParams.get('redirect_uri'), 'http://localhost:8787/api/auth/discord/callback');
  assert.doesNotMatch(start.headers.getSetCookie()[0], /Secure/, 'plain http cannot keep a Secure cookie');
  const { session } = await signIn(local);
  const cookie = `vfl_session=${session}`;
  const put = await handleAccounts(request('/api/club-save', { method: 'PUT', cookie, origin: 'http://localhost:8787', body: { save: { v: 2 } } }), local);
  assert.equal(put.status, 200);
});

test('a server error during sign-in sends the player back with a notice', async () => {
  const broken = { ...env(), ACCOUNTS: { prepare() { throw new Error('D1_ERROR: no such table: users'); } } };
  const { done } = await signIn(broken);
  assert.equal(done.status, 302);
  assert.equal(new URL(done.headers.get('Location')).searchParams.get('signin'), 'failed');
});
