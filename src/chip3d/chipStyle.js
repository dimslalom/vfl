// Med-fi switch between the two chip faces and the two in-game hints, so the
// owner can compare them in the real game. `?chipface=glyph|code` and
// `?chiphint=tag|coach` on any URL set it; the chip codex has buttons too.
// Remembered on this device only. Delete once one of each is picked.

import { useSyncExternalStore } from 'react';

export const FACES = ['code', 'glyph'];
export const HINTS = ['tag', 'coach'];

const KEY = 'vfl-chip-style';
const listeners = new Set();

function read() {
  let saved;
  try { saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    if (FACES.includes(params.get('chipface'))) saved.face = params.get('chipface');
    if (HINTS.includes(params.get('chiphint'))) saved.hint = params.get('chiphint');
  } catch { /* no location outside the browser */ }
  return { face: FACES.includes(saved.face) ? saved.face : FACES[0], hint: HINTS.includes(saved.hint) ? saved.hint : HINTS[0] };
}

let current = read();

export function chipStyle() {
  return current;
}

export function setChipStyle(next) {
  current = { ...current, ...next };
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(current)); } catch { /* private window */ }
  listeners.forEach(listener => listener(current));
}

export function subscribeChipStyle(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChipStyle() {
  return useSyncExternalStore(subscribeChipStyle, chipStyle, chipStyle);
}
