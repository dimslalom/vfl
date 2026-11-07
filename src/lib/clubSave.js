import { rewardDefaults } from '../engine/club/economy.js';

export const CLUB_SAVE_KEY = 'vfl-club-save';
export const STORY_SAVE_KEY = 'vfl-story-save';
export const ACTIVE_SLOT_KEY = 'vfl-active-slot';
export const SAVE_SLOTS = ['club', 'story'];
const VERSION = 2;

export function saveKeyForSlot(slot = 'club') {
  return slot === 'story' ? STORY_SAVE_KEY : CLUB_SAVE_KEY;
}

// Version 1 saves had one kind of pack and no chips to pick, tapes or open packs.
function upgrade(state) {
  if (state?.v === 1) return { ...rewardDefaults(), ...state, v: VERSION };
  return state;
}

/** Returns false when the device refused the write, so the game can say so. */
export function saveClubSlot(slot, state, storage = localStorage) {
  try {
    storage.setItem(saveKeyForSlot(slot), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function saveClub(state, storage = localStorage) {
  return saveClubSlot('club', state, storage);
}

/** `damaged` means a save exists but can't be used, which is not the same as none. */
export function loadClubSlot(slot = 'club', storage = localStorage) {
  try {
    const raw = storage.getItem(saveKeyForSlot(slot));
    if (raw === null) return { state: null, damaged: false };
    const state = upgrade(JSON.parse(raw));
    return state?.v === VERSION ? { state, damaged: false } : { state: null, damaged: true };
  } catch {
    return { state: null, damaged: true };
  }
}

export function loadClub(storage = localStorage) {
  return loadClubSlot('club', storage);
}

export function clearClubSlot(slot = 'club', storage = localStorage) {
  try {
    storage.removeItem(saveKeyForSlot(slot));
  } catch { /* nothing to clear */ }
}

export function clearClub(storage = localStorage) {
  clearClubSlot('club', storage);
}

export function loadActiveSlot(storage = localStorage) {
  try {
    return storage.getItem(ACTIVE_SLOT_KEY) === 'story' ? 'story' : 'club';
  } catch {
    return 'club';
  }
}

export function saveActiveSlot(slot, storage = localStorage) {
  try {
    storage.setItem(ACTIVE_SLOT_KEY, slot === 'story' ? 'story' : 'club');
    return true;
  } catch {
    return false;
  }
}
