import { useSyncExternalStore } from 'react';
import { assetPath } from '../../shared/src/lib/utils';

// Match music: one track, heard only during matches. The match intro starts it at
// 0:17 and fades it in over a second so the beat drop (0:18) lands as the lineups
// finish rising; once the intro ends it settles to a quiet bed under the match,
// and it fades out when the match is over.
//
// It plays through Web Audio from a decoded buffer rather than an <audio> element:
// the host doesn't answer range requests, and without them an <audio> element
// can't jump to 0:17. A buffer starts at any offset, to the sample.
//
// "Video Game" by AtlasAudio, from Pixabay (credited in Club settings and the README).

// Kept in public/audio, not public/assets: that folder belongs to the shared repo.
const SRC = '/audio/atlasaudio-video-game.mp3';
const VOLUME_KEY = 'vfl-music-volume';
// Levels before the player's volume: the intro is the loud moment, the match a bed.
const INTRO_LEVEL = 0.55;
const BED_LEVEL = 0.16;
const DEFAULT_VOLUME = 0.8;
export const DROP_AT = 18;

let context = null;
let gain = null;
let buffer = null;
let loading = null;
let source = null;
let mode = 'off'; // 'off' | 'intro' | 'bed'
// Off on every load: the player turns it on each visit, and a refresh resets it.
let on = false;
let volume = readVolume();
const listeners = new Set();

function readVolume() {
  try {
    const raw = globalThis.localStorage?.getItem(VOLUME_KEY);
    const stored = Number(raw);
    return raw !== null && raw !== undefined && Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function audio() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!context) {
    context = new AudioContext();
    gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) context.suspend().catch(() => null);
      else if (mode !== 'off') context.resume().catch(() => null);
    });
  }
  return context;
}

function levelFor(which) {
  if (!on || which === 'off') return 0;
  return (which === 'intro' ? INTRO_LEVEL : BED_LEVEL) * volume;
}

// Glide to the current mode's level. setTargetAtTime never clicks.
function glide(seconds) {
  if (!gain) return;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.setTargetAtTime(levelFor(mode), now, Math.max(0.01, seconds / 4));
}

/** Fetch and decode the track ahead of the first match. Safe to call often. */
export function preloadMusic() {
  const ctx = audio();
  if (!ctx) return Promise.resolve(null);
  if (!loading) {
    loading = fetch(assetPath(SRC))
      .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('music'))))
      .then(bytes => ctx.decodeAudioData(bytes))
      .then((decoded) => { buffer = decoded; return decoded; })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

/**
 * The match intro: start at `DROP_AT - 1` and fade in over one second, so the
 * drop lands one second after this call. If the track is still loading, it starts
 * the moment it's ready, at the offset it would have reached by then.
 */
export function startMatchMusic() {
  const ctx = audio();
  if (!ctx) return;
  ctx.resume().catch(() => null);
  const cuedAt = ctx.currentTime;
  mode = 'intro';
  const begin = (decoded) => {
    if (!decoded || mode === 'off') return;
    try { source?.stop(); } catch { /* already stopped */ }
    const now = ctx.currentTime;
    const late = Math.max(0, now - cuedAt);
    const next = ctx.createBufferSource();
    next.buffer = decoded;
    next.loop = true;
    next.connect(gain);
    next.start(now, (DROP_AT - 1 + late) % decoded.duration);
    source = next;
    // Full level exactly at the drop (or straight away, if loading ate the fade).
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(levelFor('intro'), Math.max(now + 0.05, cuedAt + 1));
  };
  if (buffer) begin(buffer);
  else preloadMusic().then(begin);
}

/** The intro is over: settle under the match. */
export function settleMatchMusic() {
  if (mode !== 'intro') return;
  mode = 'bed';
  glide(1.4);
}

/** The match is over or left: fade out, then stop. */
export function stopMatchMusic() {
  if (mode === 'off' || !context) return;
  mode = 'off';
  glide(0.8);
  const ending = source;
  source = null;
  setTimeout(() => { try { ending?.stop(); } catch { /* already stopped */ } }, 1000);
}

function changed() {
  listeners.forEach(listener => listener());
}

export function setMusic(next) {
  on = next;
  glide(0.3);
  changed();
}

export function setMusicVolume(next) {
  volume = Math.min(1, Math.max(0, next));
  try { globalThis.localStorage?.setItem(VOLUME_KEY, String(volume)); } catch { /* this visit only */ }
  glide(0.15);
  changed();
}

let snapshot = { on, volume };
function read() {
  if (snapshot.on !== on || snapshot.volume !== volume) snapshot = { on, volume };
  return snapshot;
}

/** { on, volume } for the settings controls. */
export function useMusic() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read,
    read,
  );
}
