import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSync, fingerprint, getAccount, pushClubSave, refreshAccount } from '../src/lib/account.js';

const club = (week, name = 'Night Shift') => ({ v: 2, name, week });
const record = (userId, updatedAt, local) => ({ userId, updatedAt, local: fingerprint(local) });

test('with one side empty, the other side wins without asking', () => {
  assert.equal(decideSync({ local: null, cloud: null }), 'none');
  assert.equal(decideSync({ local: club(1), cloud: null }), 'push');
  assert.equal(decideSync({ local: null, cloud: club(1), cloudUpdatedAt: 5 }), 'adopt');
  assert.equal(decideSync({ local: club(3), cloud: club(3), cloudUpdatedAt: 5 }), 'same');
});

test('two different clubs that never synced on this device: the player picks', () => {
  assert.equal(decideSync({ local: club(1, 'Guest club'), cloud: club(4), cloudUpdatedAt: 5, record: null, userId: 'u1' }), 'choose');
  // A record from another account on this device doesn't count.
  assert.equal(decideSync({ local: club(2), cloud: club(4), cloudUpdatedAt: 5, record: record('u2', 5, club(2)), userId: 'u1' }), 'choose');
});

test('the tab closed before the last upload: this device just catches the account up', () => {
  const synced = club(2);
  const decision = decideSync({ local: club(3), cloud: synced, cloudUpdatedAt: 5, record: record('u1', 5, synced), userId: 'u1' });
  assert.equal(decision, 'push');
});

test('played on another device since: this device takes the account club', () => {
  const synced = club(2);
  const decision = decideSync({ local: synced, cloud: club(4), cloudUpdatedAt: 9, record: record('u1', 5, synced), userId: 'u1' });
  assert.equal(decision, 'adopt');
});

test('played on both devices since they last agreed: the player picks', () => {
  const decision = decideSync({ local: club(3), cloud: club(4), cloudUpdatedAt: 9, record: record('u1', 5, club(2)), userId: 'u1' });
  assert.equal(decision, 'choose');
});

test('the fingerprint changes with the club', () => {
  assert.equal(fingerprint(club(1)), fingerprint(club(1)));
  assert.notEqual(fingerprint(club(1)), fingerprint(club(2)));
});

const reply = (body, { status = 200, type = 'application/json' } = {}) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type } });

test('the account reads signed in, signed out, or unavailable without a Worker', async () => {
  await refreshAccount(reply({ user: { id: 'u1', name: 'Kozzy', avatar: null } }));
  assert.equal(getAccount().status, 'signedIn');
  assert.equal(getAccount().user.name, 'Kozzy');
  await refreshAccount(reply({ user: null }));
  assert.equal(getAccount().status, 'signedOut');
  // Plain vite dev answers /api/me with the app's HTML.
  await refreshAccount(reply('<!doctype html>', { type: 'text/html' }));
  assert.equal(getAccount().status, 'unavailable');
  await refreshAccount(async () => { throw new Error('offline'); });
  assert.equal(getAccount().status, 'unavailable');
});

test('an upload reports the stored version, or null when it did not land', async () => {
  assert.equal(await pushClubSave(club(1), { fetcher: reply({ updatedAt: 42 }) }), 42);
  assert.equal(await pushClubSave(club(1), { fetcher: reply({ error: 'signed_out' }, { status: 401 }) }), null);
  assert.equal(await pushClubSave(club(1), { fetcher: async () => { throw new Error('offline'); } }), null);
});
