import { useSyncExternalStore } from 'react';
import { assetPath } from '../../shared/src/lib/utils';

// Background music: one looping track, quiet under the game's sounds. Browsers
// won't play sound before the player interacts, so it starts on the first tap or
// key press. It fades in and out, pauses while the tab is hidden, and the choice
// to have it on or off is kept on this device.
//
// "Video Game" by AtlasAudio, from Pixabay (credited in Club settings and the README).

const KEY = 'vfl-music';
// Kept in public/audio, not public/assets: that folder belongs to the shared repo.
const SRC = '/audio/atlasaudio-video-game.mp3';
const VOLUME = 0.28;
const FADE_IN_MS = 1600;
const FADE_OUT_MS = 450;
const CUE_DIP_MS = 120;

let element = null;
let fading = 0;
let unlocked = false;
let on = readPref();
const listeners = new Set();

function readPref() {
  try { return globalThis.localStorage?.getItem(KEY) !== 'off'; } catch { return true; }
}

function track() {
  if (!element && typeof Audio !== 'undefined') {
    element = new Audio(assetPath(SRC));
    element.loop = true;
    element.preload = 'auto';
    element.volume = 0;
  }
  return element;
}

function fadeTo(target, ms, then) {
  const audio = track();
  if (!audio) return;
  cancelAnimationFrame(fading);
  if (ms <= 0) {
    audio.volume = target;
    then?.();
    return;
  }
  const from = audio.volume;
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, Math.max(0, (now - start) / ms));
    audio.volume = from + (target - from) * k;
    if (k < 1) fading = requestAnimationFrame(step);
    else then?.();
  };
  fading = requestAnimationFrame(step);
}

function play() {
  const audio = track();
  if (!audio || !unlocked || !on || document.hidden) return;
  audio.play().then(() => fadeTo(VOLUME, FADE_IN_MS)).catch(() => null);
}

function pause(ms = FADE_OUT_MS) {
  const audio = track();
  if (!audio || audio.paused) return;
  fadeTo(0, ms, () => audio.pause());
}

/**
 * Jump the music to `at` seconds, fading in over `fadeMs` so it's at full level
 * exactly `fadeMs` later. The match intro uses this to land the track's beat drop
 * (0:18) as the lineups finish rising. Whatever was playing dips out first.
 */
export function cueMusic(at, fadeMs) {
  const audio = track();
  if (!audio || !on || document.hidden) return;
  unlocked = true; // only ever called from a tap (Play)
  // The dip takes time too, so jump that much further in and fade that much
  // shorter: the cued moment still lands exactly `fadeMs` after the call.
  const dip = audio.paused ? 0 : CUE_DIP_MS;
  const jump = () => {
    try { audio.currentTime = at + dip / 1000; } catch { /* not seekable yet: plays from where it is */ }
    audio.play().then(() => fadeTo(VOLUME, Math.max(0, fadeMs - dip))).catch(() => null);
  };
  if (dip) {
    fadeTo(0, dip, jump);
  } else {
    audio.volume = 0;
    jump();
  }
}

export function musicOn() {
  return on;
}

export function setMusic(next) {
  on = next;
  try { globalThis.localStorage?.setItem(KEY, next ? 'on' : 'off'); } catch { /* private window: on for this visit only */ }
  if (next) play();
  else pause();
  listeners.forEach(listener => listener());
}

export function useMusic() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    musicOn,
    musicOn,
  );
}

/** Start the music on the first tap or key press, and follow the tab's visibility. Call once. */
export function startMusic() {
  if (typeof window === 'undefined') return () => {};
  const unlock = () => {
    unlocked = true;
    play();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  const visibility = () => (document.hidden ? pause(0) : play());
  if (!unlocked) {
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    document.removeEventListener('visibilitychange', visibility);
  };
}
