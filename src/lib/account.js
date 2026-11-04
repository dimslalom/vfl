import { useSyncExternalStore } from 'react';

// The VFL account on the client: who is signed in (Discord, optional) and the
// Clubs cloud save. The Worker owns the session in an HttpOnly cookie, so this
// file never sees a token. Without the Worker (plain `vite` dev) /api/me isn't
// JSON, the account reads as unavailable and the sign-in button stays hidden.

let account = { status: 'unknown', user: null };
const listeners = new Set();

function set(next) {
  account = next;
  listeners.forEach(listener => listener());
}

export function getAccount() {
  return account;
}

export function useAccount() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getAccount,
    getAccount,
  );
}

async function api(path, { method = 'GET', body, fetcher = fetch } = {}) {
  const response = await fetcher(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!(response.headers.get('Content-Type') ?? '').includes('application/json')) throw new Error('no_api');
  return { status: response.status, data: await response.json() };
}

export async function refreshAccount(fetcher) {
  try {
    const { status, data } = await api('/api/me', { fetcher });
    if (status !== 200) throw new Error('no_api');
    set(data.user ? { status: 'signedIn', user: data.user } : { status: 'signedOut', user: null });
  } catch {
    set({ status: 'unavailable', user: null });
  }
  return account;
}

/** A plain link: sign-in is a full-page trip to Discord and back. */
export function signInHref(next = '/club') {
  return `/api/auth/discord?next=${encodeURIComponent(next)}`;
}

export async function signOut(fetcher) {
  try { await api('/api/auth/logout', { method: 'POST', fetcher }); } catch { /* the cookie may already be gone */ }
  set({ status: 'signedOut', user: null });
}

export async function deleteAccount(fetcher) {
  const { status } = await api('/api/account', { method: 'DELETE', fetcher });
  if (status !== 200) throw new Error('delete_failed');
  set({ status: 'signedOut', user: null });
}

/** The account's club as `{ save, updatedAt }` (save is null when it has none). Throws when the cloud can't be read. */
export async function pullClubSave(fetcher) {
  const { status, data } = await api('/api/club-save', { fetcher });
  if (status !== 200) throw new Error('pull_failed');
  return { save: data.save, updatedAt: data.updatedAt };
}

/** Returns the stored version's `updatedAt`, or null when the write didn't land. */
export async function pushClubSave(save, { fetcher, keepalive = false } = {}) {
  try {
    const response = await (fetcher ?? fetch)('/api/club-save', {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save }),
    });
    if (response.status !== 200) return null;
    return (await response.json()).updatedAt ?? null;
  } catch {
    return null;
  }
}

export async function dropClubSave(fetcher) {
  try { await api('/api/club-save', { method: 'DELETE', fetcher }); } catch { /* next push replaces it anyway */ }
}

// ── which club wins on sign-in ──────────────────────────────────────────────

const SYNC_KEY = 'vfl-club-synced';

/** A short fingerprint of a save, so the device can tell whether it changed since the last sync. */
export function fingerprint(save) {
  const text = JSON.stringify(save ?? null);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `${text.length}:${hash.toString(36)}`;
}

/** What this device last agreed with the account: whose, which cloud version, and what the device held. */
export function loadSyncRecord(storage = globalThis.localStorage) {
  try {
    const record = JSON.parse(storage?.getItem(SYNC_KEY) ?? 'null');
    return record && typeof record.userId === 'string' ? record : null;
  } catch {
    return null;
  }
}

export function saveSyncRecord(record, storage = globalThis.localStorage) {
  try {
    if (record) storage?.setItem(SYNC_KEY, JSON.stringify(record));
    else storage?.removeItem(SYNC_KEY);
  } catch { /* private window: worst case is one extra "which club" question */ }
}

/**
 * What to do with the device club and the account club on sign-in. Never merges.
 * - 'none': neither has a club. 'same': they already match.
 * - 'push': the account has nothing new, so the device's club goes up.
 * - 'adopt': the account moved on elsewhere and the device didn't, so take the account's.
 * - 'choose': both changed since they last agreed (or never agreed), so the player picks.
 */
export function decideSync({ local, cloud, cloudUpdatedAt, record, userId }) {
  if (!local && !cloud) return 'none';
  if (!cloud) return 'push';
  if (!local) return 'adopt';
  if (fingerprint(local) === fingerprint(cloud)) return 'same';
  const known = record?.userId === userId ? record : null;
  if (!known) return 'choose';
  const cloudMoved = cloudUpdatedAt !== known.updatedAt;
  const localMoved = fingerprint(local) !== known.local;
  if (!cloudMoved) return 'push';
  return localMoved ? 'choose' : 'adopt';
}
