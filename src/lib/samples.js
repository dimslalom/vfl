// Pre-rendered cues (scripts/sfx: render.py for UI, evo.scd in SuperCollider for evo),
// served from public/sfx. They load in the background at import; until a file is
// decoded, or if it fails, callers fall back to their live Web Audio synth.

const steps = (name, n) => Array.from({ length: n }, (_, i) => `${name}_${i}`);
export const UI_SAMPLES = [
  'select', 'drop', 'flip', 'deal', 'sign', 'reveal',
  // scripts/sfx/scoring.scd: pitched cues have one file per step of their scale
  ...steps('score', 9), ...steps('score_opp', 7), ...steps('combo', 4), ...steps('lane_win', 2),
  'match_join', 'tactic_mult_lo', 'tactic_mult_hi', 'lane_loss', 'flawless', 'round_win', 'round_loss', 'series_win', 'series_loss',
];
export const EVO_SAMPLES = [
  'ironclad_ready', 'ironclad_block', 'lurk_ready', 'lurk_reveal', 'velocity_ready', 'velocity_dash',
  'combustion_ready', 'combustion_fuel', 'combustion_flare', 'phase_ready', 'phase_rift',
  'surge_ready', 'surge_chain', 'ascendance_ready', 'ascendance_rise', 'dominion_ready', 'dominion_seal',
  'black_hole_ready', 'black_hole_pull', 'overdrive_surge', 'overdrive_tilt',
  'timewarp_ready', 'timewarp_rewind', 'timewarp_spent',
];

const buffers = new Map();
let context = null;
let bus = null;

if (typeof window !== 'undefined' && window.OfflineAudioContext) {
  // An offline context decodes without a user gesture; AudioBuffers work in any context.
  const decoder = new window.OfflineAudioContext(2, 1, 48000);
  const base = import.meta.env.BASE_URL ?? '/';
  for (const name of [...UI_SAMPLES, ...EVO_SAMPLES]) {
    fetch(`${base}sfx/${name}.mp3`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(data => decoder.decodeAudioData(data))
      .then(buffer => buffers.set(name, buffer))
      .catch(() => null);
  }
}

function audio() {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!context) {
    context = new AudioContext();
    bus = context.createDynamicsCompressor();
    bus.threshold.value = -14;
    bus.ratio.value = 3;
    bus.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume().catch(() => null);
  return context;
}

/**
 * Plays a rendered cue. Returns false when it isn't loaded, so the caller can synth it.
 * `detune` is a +/- fraction of random pitch so repeats don't sound cloned.
 */
export function playSample(name, { gain = 0.25, pan = 0, detune = 0.02 } = {}) {
  const buffer = buffers.get(name);
  if (!buffer) return false;
  const ctx = audio();
  if (!ctx) return false;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1 + (Math.random() * 2 - 1) * detune;
  const level = ctx.createGain();
  level.gain.value = gain;
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(level).connect(panner).connect(bus);
  source.start();
  return true;
}
