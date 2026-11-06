import { useSyncExternalStore } from 'react';

// Ambient arena broadcast: muffled VCT match audio that runs quietly behind
// the club hub and management screens (squad, inventory, train, vault, league).
//
// Like match music, it routes through the Web Audio API: a MediaElementAudioSource
// passes through a BiquadFilter (lowpass at ~380Hz) to roll off all high frequencies
// (gunfire snap, caster sibilance), leaving only the warm, muffled sub-bass rumble
// of an arena crowd and distant commentary through stadium walls.

const VOLUME_KEY = 'vfl-ambient-volume';
const ENABLED_KEY = 'vfl-ambient-on';
const DEFAULT_VOLUME = 0.7;
const MAX_BED_LEVEL = 0.18; // Sits quietly under UI sounds

let context = null;
let filter = null;
let gain = null;
let currentVideo = null;
let mediaSource = null;
let on = readEnabled();
let volume = readVolume();
let suspendedByVisibility = false;
const listeners = new Set();

function readEnabled() {
  try {
    const raw = globalThis.localStorage?.getItem(ENABLED_KEY);
    return raw !== null && raw !== undefined ? raw === 'true' : true;
  } catch {
    return true;
  }
}

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
    filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380; // Cuts harsh treble, passes deep rumble
    filter.Q.value = 0.8;

    gain = context.createGain();
    gain.gain.value = 0;

    filter.connect(gain);
    gain.connect(context.destination);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (context.state === 'running') {
          context.suspend().catch(() => null);
          suspendedByVisibility = true;
        }
      } else if (suspendedByVisibility) {
        suspendedByVisibility = false;
        if (on) context.resume().catch(() => null);
      }
    });
  }
  return context;
}

function targetLevel() {
  if (!on) return 0;
  return MAX_BED_LEVEL * volume;
}

function glide(seconds) {
  if (!gain || !context) return;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.setTargetAtTime(targetLevel(), now, Math.max(0.01, seconds / 4));
}

/**
 * Connect a <video> element to the muffled Web Audio graph.
 * Safely handles reuse and browser autoplay unlocking.
 */
export function attachAmbientVideo(video) {
  if (!video || typeof window === 'undefined') return;
  const ctx = audio();
  if (!ctx) return;

  if (currentVideo !== video) {
    currentVideo = video;
    try {
      mediaSource = ctx.createMediaElementSource(video);
      mediaSource.connect(filter);
    } catch {
      // In case element was already connected to this or another source
    }
  }

  // Unmute the HTML media element so its audio flows into the Web Audio graph
  video.muted = false;
  if (ctx.state === 'suspended' && on) {
    ctx.resume().catch(() => null);
  }
  glide(0.8);
}

/**
 * Detach or fade out ambient video audio (e.g. when leaving to a match).
 */
export function detachAmbientVideo() {
  if (!gain || !context) return;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.setTargetAtTime(0, now, 0.1);
}

function changed() {
  listeners.forEach(listener => listener());
}

export function setAmbientOn(next) {
  on = next;
  try { globalThis.localStorage?.setItem(ENABLED_KEY, String(on)); } catch { /* ignore */ }
  const ctx = audio();
  if (on && ctx?.state === 'suspended') {
    ctx.resume().catch(() => null);
  }
  glide(0.25);
  changed();
}

export function setAmbientVolume(next) {
  volume = Math.min(1, Math.max(0, next));
  try { globalThis.localStorage?.setItem(VOLUME_KEY, String(volume)); } catch { /* ignore */ }
  glide(0.12);
  changed();
}

let snapshot = { on, volume };
function read() {
  if (snapshot.on !== on || snapshot.volume !== volume) snapshot = { on, volume };
  return snapshot;
}

/** Hook for UI components to read and react to ambient audio settings. */
export function useAmbientAudio() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read,
    read,
  );
}
