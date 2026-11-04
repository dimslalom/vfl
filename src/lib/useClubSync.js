import { useEffect, useRef, useState } from 'react';
import {
  decideSync, deleteAccount, dropClubSave, fingerprint, loadSyncRecord, pullClubSave, pushClubSave, refreshAccount,
  saveSyncRecord, signOut, useAccount,
} from './account';

const PUSH_DELAY_MS = 1200;

function remember(userId, updatedAt, local) {
  saveSyncRecord({ userId, updatedAt, local: fingerprint(local) });
}

/** True when the device already told the account about exactly this club. */
function alreadySynced(userId, save) {
  const record = loadSyncRecord();
  return record?.userId === userId && record.local === fingerprint(save);
}

/**
 * Keeps the Clubs save in step with the signed-in account. The device save stays
 * the source of truth while playing; the account gets a copy shortly after each
 * change and on leaving the page. On load, it settles which club wins (see
 * decideSync) and holds a `conflict` for the player to resolve when both moved.
 */
export default function useClubSync({ state, setState, isValid }) {
  const account = useAccount();
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState(null);
  const stateRef = useRef(state);
  const isValidRef = useRef(isValid);
  useEffect(() => { stateRef.current = state; isValidRef.current = isValid; });
  const userId = account.status === 'signedIn' ? account.user.id : null;

  useEffect(() => {
    let live = true;
    (async () => {
      const current = await refreshAccount();
      if (!live || current.status !== 'signedIn') return;
      let pulled;
      try { pulled = await pullClubSave(); } catch { return; } // can't read the account: never overwrite it blind
      if (!live) return;
      const id = current.user.id;
      const cloud = pulled.save && isValidRef.current(pulled.save) ? pulled.save : null;
      const local = stateRef.current;
      const action = decideSync({ local, cloud, cloudUpdatedAt: pulled.updatedAt, record: loadSyncRecord(), userId: id });
      if (action === 'choose') { setConflict({ local, cloud, updatedAt: pulled.updatedAt }); return; }
      if (action === 'adopt') { setState(cloud); remember(id, pulled.updatedAt, cloud); }
      if (action === 'same') remember(id, pulled.updatedAt, local);
      if (action === 'push') {
        const at = await pushClubSave(local);
        if (at != null) remember(id, at, local);
      }
      if (live) setReady(true);
    })();
    return () => { live = false; };
  }, [setState]);

  // Each change goes up after a short pause, and at once if the page is closing.
  useEffect(() => {
    if (!ready || !userId || !state || alreadySynced(userId, state)) return undefined;
    const send = keepalive => pushClubSave(state, { keepalive }).then(at => { if (at != null) remember(userId, at, state); });
    const timer = setTimeout(() => send(false), PUSH_DELAY_MS);
    const flush = () => { clearTimeout(timer); send(true); };
    window.addEventListener('pagehide', flush);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', flush); };
  }, [state, ready, userId]);

  return {
    account,
    conflict,
    async keepDevice() {
      const { local } = conflict;
      setConflict(null);
      const at = await pushClubSave(local);
      if (at != null) remember(userId, at, local);
      setReady(true);
    },
    keepAccount() {
      setState(conflict.cloud);
      remember(userId, conflict.updatedAt, conflict.cloud);
      setConflict(null);
      setReady(true);
    },
    /** The club was abandoned or lost: the account forgets it too. */
    async forget() {
      saveSyncRecord(null);
      if (userId) await dropClubSave();
    },
    async signOut() {
      await signOut();
    },
    async deleteAccount() {
      await deleteAccount();
      saveSyncRecord(null);
    },
  };
}
