import { rewardDefaults } from '../engine/club/economy.js';

export const CLUB_SAVE_KEY = 'vfl-club-save';
const VERSION = 2;

// Version 1 saves had one kind of pack and no chips to pick, tapes or open packs.
function upgrade(state) {
  if (state?.v === 1) return { ...rewardDefaults(), ...state, v: VERSION };
  return state;
}

/** Returns false when the device refused the write, so the game can say so. */
export function saveClub(state, storage = localStorage) {
  try {
    storage.setItem(CLUB_SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** `damaged` means a save exists but can't be used, which is not the same as none. */
export function loadClub(storage = localStorage) {
  try {
    const raw = storage.getItem(CLUB_SAVE_KEY);
    if (raw === null) return { state: null, damaged: false };
    const state = upgrade(JSON.parse(raw));
    return state?.v === VERSION ? { state, damaged: false } : { state: null, damaged: true };
  } catch {
    return { state: null, damaged: true };
  }
}

export function clearClub(storage = localStorage) {
  try {
    storage.removeItem(CLUB_SAVE_KEY);
  } catch { /* nothing to clear */ }
}
