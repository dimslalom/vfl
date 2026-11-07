// The evo skills' sounds, built the way the glass shatter and lane win are
// (src/lib/sfx.js): every cue is a few physical layers (an impact, a body, a
// tail of scattered detail) instead of a tone. Metal rings at inharmonic
// partials, fire is noise and crackle, air is a filter sweeping through noise
// while it pans past. A short room is shared so cues sit in one space.

import { playUiSound } from '../../shared/src/lib/gameAudio.js';
import { playSample } from './samples.js';

// Tuned to the live cues' level (their impacts peak around 0.2 after the bus).
const EVO_GAIN = 0.24;

let context = null;
let bus = null;
let room = null;
let noise = null;

function audio() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!context) {
    context = new AudioContext();
    const comp = context.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.connect(context.destination);
    bus = context.createGain();
    bus.gain.value = 0.7;
    bus.connect(comp);
    // A small arena: a second and a bit of diffuse, darkening decay.
    const length = Math.floor(context.sampleRate * 1.3);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * (1 - t) ** 3.2 * (i < 400 ? i / 400 : 1);
      }
    }
    const verb = context.createConvolver();
    verb.buffer = impulse;
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    room = context.createGain();
    room.gain.value = 0.5;
    room.connect(verb).connect(tone).connect(bus);
    noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') context.resume().catch(() => null);
  return context;
}

// A node into the mix: panned, dry to the bus and `wet` of it to the room.
function out(ctx, node, pan = 0, wet = 0.2) {
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(panner).connect(bus);
  if (wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    panner.connect(send).connect(room);
  }
  return panner;
}

function env(gain, at, peak, attack, hold, decay) {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  if (hold) gain.gain.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + decay);
}

/** Filtered noise; the filter (and pan) can travel, for whooshes and suction. */
function hiss(ctx, at, { type = 'bandpass', freq = 1200, to = freq, q = 1, peak = 0.1, attack = 0.004, hold = 0, decay = 0.2, pan = 0, panTo = pan, wet = 0.2 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const span = attack + hold + decay;
  filter.frequency.setValueAtTime(freq, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + span);
  const gain = ctx.createGain();
  env(gain, at, peak, attack, hold, decay);
  const panner = out(ctx, src.connect(filter).connect(gain), pan, wet);
  if (panTo !== pan) panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panTo)), at + span);
  src.start(at, Math.random() * 0.8, span + 0.05);
}

/** A struck body: sine partials at the given ratios, each with its own life. */
function strike(ctx, at, { freq, partials, peak = 0.08, decay = 0.6, glide = 1, pan = 0, wet = 0.25 }) {
  for (const [ratio, level, life] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * ratio, at);
    if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * ratio * glide, at + decay * life);
    const gain = ctx.createGain();
    env(gain, at, peak * level, 0.002, 0, decay * life);
    out(ctx, osc.connect(gain), pan, wet);
    osc.start(at);
    osc.stop(at + decay * life + 0.05);
  }
}

// Partials of real things struck, from modal tables: a steel plate, a heavy bell,
// a glass sliver, a wooden-cased clock tick.
const STEEL = [[1, 1, 1], [2.76, 0.6, 0.7], [5.4, 0.35, 0.45], [8.93, 0.2, 0.3]];
const BELL = [[0.5, 0.6, 1.2], [1, 1, 1], [1.19, 0.45, 0.8], [1.5, 0.35, 0.7], [2, 0.3, 0.5], [2.74, 0.18, 0.35]];
const GLASS = [[1, 1, 1], [2.76, 0.45, 0.6]];
const WOOD = [[1, 1, 1], [2.57, 0.4, 0.4], [4.1, 0.2, 0.25]];

/** A low body blow: a sine falling in pitch, the weight under an impact. */
function thump(ctx, at, { from = 140, to = 45, peak = 0.22, decay = 0.2, wet = 0.08 }) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + decay);
  const gain = ctx.createGain();
  env(gain, at, peak, 0.003, 0, decay);
  out(ctx, osc.connect(gain), 0, wet);
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

/** A voiced tone through a moving lowpass: engines, drones, tape. */
function voice(ctx, at, { type = 'sawtooth', from, to = from, cutoff = 900, cutoffTo = cutoff, q = 2, peak = 0.05, attack = 0.02, hold = 0, decay = 0.3, pan = 0, wet = 0.2, drive = false, detune = 0 }) {
  const span = attack + hold + decay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + span);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(cutoff, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutoffTo), at + span);
  let chain = osc.connect(filter);
  if (drive) {
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) curve[i] = Math.tanh(((i / 128) - 1) * 3);
    shaper.curve = curve;
    chain = chain.connect(shaper);
  }
  const gain = ctx.createGain();
  env(gain, at, peak, attack, hold, decay);
  out(ctx, chain.connect(gain), pan, wet);
  osc.start(at);
  osc.stop(at + span + 0.05);
}

/** Fire and grit: many tiny bright bursts, scattered in time and across the field. */
function crackle(ctx, at, { count = 12, span = 0.4, freq = 3000, peak = 0.04, spread = 1, rand }) {
  for (let i = 0; i < count; i += 1) {
    const r = rand();
    hiss(ctx, at + r * r * span, { type: 'bandpass', freq: freq * (0.6 + rand() * 0.9), q: 2.5, peak: peak * (0.4 + rand() * 0.6), attack: 0.001, decay: 0.008 + rand() * 0.02, pan: (rand() - 0.5) * spread, wet: 0.1 });
  }
}

function seeded(seed) {
  let state = (seed * 2654435761 + 7) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ── the cues ────────────────────────────────────────────────────────────────

const CUES = {
  // Ironclad: a steel plate set down on the lane, ringing low, with a scrape.
  ironclad_ready(ctx, t) {
    thump(ctx, t, { from: 110, to: 38, peak: 0.24, decay: 0.28 });
    strike(ctx, t + 0.005, { freq: 168, partials: STEEL, peak: 0.07, decay: 1.1, wet: 0.3 });
    hiss(ctx, t, { type: 'bandpass', freq: 900, to: 500, q: 1.4, peak: 0.06, attack: 0.01, decay: 0.16 });
  },
  // A chip glances off the plate: a high clang, a ricochet whine, sparks.
  ironclad_block(ctx, t, rand) {
    strike(ctx, t, { freq: 410, partials: STEEL, peak: 0.08, decay: 0.7, pan: -0.2, wet: 0.3 });
    hiss(ctx, t, { type: 'highpass', freq: 3500, q: 0.7, peak: 0.12, decay: 0.03 });
    voice(ctx, t + 0.03, { type: 'sine', from: 2600, to: 1100, cutoff: 6000, peak: 0.025, attack: 0.005, decay: 0.32, pan: -0.2, panTo: 0.6, wet: 0.35 });
    for (let i = 0; i < 6; i += 1) strike(ctx, t + 0.04 + rand() * 0.2, { freq: 3000 + rand() * 3500, partials: GLASS, peak: 0.018, decay: 0.08, pan: (rand() - 0.5) * 1.4, wet: 0.15 });
  },
  // Lurk: smoke breathing out around the card.
  lurk_ready(ctx, t) {
    hiss(ctx, t, { type: 'lowpass', freq: 500, to: 1600, q: 0.7, peak: 0.07, attack: 0.25, decay: 0.7, pan: -0.3, panTo: 0.3, wet: 0.35 });
    voice(ctx, t, { type: 'sine', from: 72, to: 64, cutoff: 400, peak: 0.05, attack: 0.2, decay: 0.6, wet: 0.1 });
  },
  // The smoke tears away and the card is there: a rising rush and a hard cut.
  lurk_reveal(ctx, t) {
    hiss(ctx, t, { type: 'highpass', freq: 300, to: 5200, q: 0.6, peak: 0.09, attack: 0.22, decay: 0.05, pan: 0.4, panTo: -0.2, wet: 0.3 });
    hiss(ctx, t + 0.27, { type: 'highpass', freq: 4200, q: 0.8, peak: 0.16, decay: 0.03 });
    thump(ctx, t + 0.27, { from: 160, to: 52, peak: 0.2, decay: 0.16 });
    strike(ctx, t + 0.28, { freq: 880, partials: GLASS, peak: 0.03, decay: 0.3, wet: 0.4 });
  },
  // Velocity: something fast passing close, left to right.
  velocity_ready(ctx, t) {
    hiss(ctx, t, { type: 'bandpass', freq: 600, to: 2800, q: 1.6, peak: 0.08, attack: 0.16, decay: 0.16, pan: -0.8, panTo: 0.8, wet: 0.2 });
    voice(ctx, t + 0.05, { type: 'triangle', from: 380, to: 900, cutoff: 3000, peak: 0.015, attack: 0.1, decay: 0.15, pan: -0.5, panTo: 0.6 });
  },
  // The dash: a doppler rush, the landing skid, then the run's cost as a sigh down.
  velocity_dash(ctx, t, rand) {
    hiss(ctx, t, { type: 'bandpass', freq: 500, to: 3400, q: 1.4, peak: 0.12, attack: 0.18, decay: 0.08, pan: -0.9, panTo: 0.7, wet: 0.2 });
    hiss(ctx, t + 0.26, { type: 'bandpass', freq: 1400, to: 700, q: 3, peak: 0.07, attack: 0.005, decay: 0.24, pan: 0.7 });
    thump(ctx, t + 0.26, { from: 150, to: 50, peak: 0.18, decay: 0.15 });
    crackle(ctx, t + 0.26, { count: 8, span: 0.2, freq: 2400, peak: 0.03, rand });
    voice(ctx, t + 0.42, { type: 'sine', from: 330, to: 140, cutoff: 1200, peak: 0.03, attack: 0.02, decay: 0.4, wet: 0.3 });
  },
  // Combustion: a strike, the whoomph of catching, embers popping.
  combustion_ready(ctx, t, rand) {
    hiss(ctx, t, { type: 'highpass', freq: 2600, q: 0.8, peak: 0.12, decay: 0.05 });
    hiss(ctx, t + 0.03, { type: 'lowpass', freq: 200, to: 1100, q: 0.8, peak: 0.12, attack: 0.08, decay: 0.45, wet: 0.25 });
    thump(ctx, t + 0.04, { from: 90, to: 40, peak: 0.12, decay: 0.3 });
    crackle(ctx, t + 0.08, { count: 14, span: 0.6, freq: 2800, peak: 0.035, rand });
  },
  // The fuel burns down: a sizzle and a falling hum.
  combustion_fuel(ctx, t, rand) {
    hiss(ctx, t, { type: 'bandpass', freq: 4000, to: 1800, q: 1.2, peak: 0.05, attack: 0.02, decay: 0.4 });
    voice(ctx, t, { type: 'sawtooth', from: 180, to: 70, cutoff: 600, cutoffTo: 200, peak: 0.03, attack: 0.02, decay: 0.45, wet: 0.15 });
    crackle(ctx, t, { count: 8, span: 0.35, freq: 3200, peak: 0.025, rand });
  },
  // The flare: launched with a rising rush, landing in a fiery blast.
  combustion_flare(ctx, t, rand) {
    hiss(ctx, t, { type: 'bandpass', freq: 300, to: 2200, q: 1, peak: 0.08, attack: 0.3, decay: 0.04, pan: -0.4, panTo: 0.4, wet: 0.25 });
    const hit = t + 0.36;
    thump(ctx, hit, { from: 120, to: 32, peak: 0.28, decay: 0.45 });
    hiss(ctx, hit, { type: 'lowpass', freq: 3000, to: 300, q: 0.7, peak: 0.16, attack: 0.004, decay: 0.6, wet: 0.35, pan: 0.4 });
    crackle(ctx, hit + 0.05, { count: 18, span: 0.7, freq: 2600, peak: 0.035, rand });
  },
  // Phase: a low beating hum, two tones not quite together, and air pulled inward.
  phase_ready(ctx, t) {
    voice(ctx, t, { type: 'sine', from: 55, cutoff: 300, peak: 0.07, attack: 0.15, hold: 0.2, decay: 0.5, wet: 0.2 });
    voice(ctx, t, { type: 'sine', from: 57.5, cutoff: 300, peak: 0.06, attack: 0.15, hold: 0.2, decay: 0.5, wet: 0.2 });
    hiss(ctx, t, { type: 'bandpass', freq: 2400, to: 400, q: 1.2, peak: 0.05, attack: 0.5, decay: 0.03, wet: 0.4 });
  },
  // The rift swallows a card: a long inhale that stops dead, a drop, a bent ring.
  phase_rift(ctx, t) {
    hiss(ctx, t, { type: 'bandpass', freq: 4200, to: 180, q: 1.1, peak: 0.12, attack: 0.38, decay: 0.02, pan: 0.3, panTo: -0.3, wet: 0.4 });
    thump(ctx, t + 0.4, { from: 90, to: 28, peak: 0.26, decay: 0.5 });
    strike(ctx, t + 0.41, { freq: 620, partials: GLASS, peak: 0.04, decay: 0.9, glide: 0.55, wet: 0.5 });
  },
  // Tempest: thunder far off, and a breath of rain.
  surge_ready(ctx, t) {
    hiss(ctx, t, { type: 'lowpass', freq: 160, to: 90, q: 0.7, peak: 0.16, attack: 0.08, hold: 0.15, decay: 0.8, wet: 0.4 });
    hiss(ctx, t + 0.1, { type: 'highpass', freq: 5000, q: 0.5, peak: 0.025, attack: 0.15, decay: 0.4, wet: 0.2 });
  },
  // Chain lightning: the crack, an electric buzz, branches spitting, thunder after.
  surge_chain(ctx, t, rand) {
    hiss(ctx, t, { type: 'highpass', freq: 2000, q: 0.5, peak: 0.22, decay: 0.05 });
    const osc = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 92;
    mod.frequency.value = 37;
    depth.gain.value = 260;
    mod.connect(depth).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 1800;
    lp.Q.value = 0.8;
    const gain = ctx.createGain();
    env(gain, t, 0.07, 0.002, 0.06, 0.3);
    out(ctx, osc.connect(lp).connect(gain), 0, 0.25);
    osc.start(t);
    mod.start(t);
    osc.stop(t + 0.45);
    mod.stop(t + 0.45);
    crackle(ctx, t + 0.02, { count: 16, span: 0.35, freq: 4200, peak: 0.05, rand });
    hiss(ctx, t + 0.18, { type: 'lowpass', freq: 220, to: 70, q: 0.6, peak: 0.2, attack: 0.05, hold: 0.1, decay: 1.1, wet: 0.45 });
  },
  // Valkyrie: air under wings and a high, held choir.
  ascendance_ready(ctx, t) {
    hiss(ctx, t, { type: 'lowpass', freq: 300, to: 900, q: 0.6, peak: 0.06, attack: 0.06, decay: 0.25 });
    [587.33, 739.99, 880, 1174.66].forEach((freq, i) => {
      voice(ctx, t + 0.05 + i * 0.04, { type: 'sine', from: freq, cutoff: 4000, peak: 0.014, attack: 0.18, hold: 0.15, decay: 0.6, pan: (i - 1.5) * 0.3, wet: 0.5, detune: (i % 2 ? 6 : -6) });
    });
  },
  // She rises: two wingbeats, a swelling chord, and the landing bloom.
  ascendance_rise(ctx, t) {
    [0, 0.2].forEach((d) => {
      hiss(ctx, t + d, { type: 'lowpass', freq: 350, to: 1200, q: 0.6, peak: 0.12, attack: 0.03, decay: 0.14, wet: 0.2 });
      thump(ctx, t + d, { from: 80, to: 50, peak: 0.08, decay: 0.12 });
    });
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      voice(ctx, t + 0.3 + i * 0.05, { type: 'triangle', from: freq, cutoff: 3500, peak: 0.02, attack: 0.25, hold: 0.1, decay: 0.7, pan: (i - 1.5) * 0.3, wet: 0.55 });
    });
    strike(ctx, t + 0.7, { freq: 880, partials: BELL, peak: 0.05, decay: 1.6, wet: 0.5 });
  },
  // Sovereign: a heavy seal pressed down, a low bell, the court's chord.
  dominion_ready(ctx, t) {
    thump(ctx, t, { from: 120, to: 40, peak: 0.24, decay: 0.24 });
    hiss(ctx, t, { type: 'bandpass', freq: 700, to: 350, q: 1.2, peak: 0.08, decay: 0.08 });
    strike(ctx, t + 0.01, { freq: 196, partials: BELL, peak: 0.06, decay: 1.8, wet: 0.45 });
  },
  // The decree voids a chip: the stamp slams and the bell answers in fifths.
  dominion_seal(ctx, t, rand) {
    thump(ctx, t, { from: 150, to: 36, peak: 0.3, decay: 0.3 });
    hiss(ctx, t, { type: 'bandpass', freq: 1200, to: 500, q: 1, peak: 0.14, decay: 0.07 });
    strike(ctx, t + 0.01, { freq: 130.8, partials: BELL, peak: 0.07, decay: 2, wet: 0.5 });
    strike(ctx, t + 0.09, { freq: 196, partials: BELL, peak: 0.04, decay: 1.6, pan: 0.3, wet: 0.5 });
    for (let i = 0; i < 4; i += 1) strike(ctx, t + 0.15 + rand() * 0.3, { freq: 2600 + rand() * 2400, partials: GLASS, peak: 0.012, decay: 0.2, pan: (rand() - 0.5) * 1.2, wet: 0.4 });
  },
  // Singularity: gravity as sound, a slow low wobble and air swirling round it.
  black_hole_ready(ctx, t) {
    voice(ctx, t, { type: 'sine', from: 46, to: 38, cutoff: 200, peak: 0.1, attack: 0.2, hold: 0.2, decay: 0.6, wet: 0.2 });
    hiss(ctx, t, { type: 'bandpass', freq: 1600, to: 300, q: 4, peak: 0.05, attack: 0.3, decay: 0.5, pan: -0.6, panTo: 0.6, wet: 0.4 });
  },
  // The pull: a long draw that spins across the field, the fall, the implosion.
  black_hole_pull(ctx, t) {
    hiss(ctx, t, { type: 'bandpass', freq: 3200, to: 140, q: 2, peak: 0.13, attack: 0.5, decay: 0.03, pan: 0.8, panTo: -0.8, wet: 0.45 });
    voice(ctx, t, { type: 'sine', from: 120, to: 30, cutoff: 400, peak: 0.12, attack: 0.3, decay: 0.3, wet: 0.2 });
    const hit = t + 0.55;
    thump(ctx, hit, { from: 70, to: 24, peak: 0.32, decay: 0.6 });
    strike(ctx, hit, { freq: 300, partials: BELL, peak: 0.04, decay: 1.2, glide: 0.5, wet: 0.5 });
  },
  // Overdrive: an engine revving up, or running out of breath.
  overdrive_surge(ctx, t) {
    voice(ctx, t, { type: 'sawtooth', from: 70, to: 230, cutoff: 300, cutoffTo: 2600, q: 4, peak: 0.07, attack: 0.04, hold: 0.15, decay: 0.25, drive: true, wet: 0.2 });
    voice(ctx, t, { type: 'square', from: 35, to: 115, cutoff: 200, cutoffTo: 900, peak: 0.04, attack: 0.04, hold: 0.15, decay: 0.25, drive: true });
    thump(ctx, t + 0.42, { from: 120, to: 40, peak: 0.18, decay: 0.2 });
  },
  overdrive_tilt(ctx, t) {
    voice(ctx, t, { type: 'sawtooth', from: 210, to: 48, cutoff: 1800, cutoffTo: 160, q: 3, peak: 0.07, attack: 0.02, hold: 0.1, decay: 0.55, drive: true, wet: 0.25 });
    hiss(ctx, t, { type: 'lowpass', freq: 1200, to: 150, q: 0.7, peak: 0.05, attack: 0.02, decay: 0.6 });
  },
  // Chronos: a clock's tick and tock in a wooden case, and a small bell.
  timewarp_ready(ctx, t) {
    for (let i = 0; i < 4; i += 1) {
      strike(ctx, t + i * 0.16, { freq: i % 2 ? 1900 : 2300, partials: WOOD, peak: 0.05, decay: 0.06, pan: i % 2 ? 0.2 : -0.2, wet: 0.25 });
      hiss(ctx, t + i * 0.16, { type: 'highpass', freq: 5000, q: 1, peak: 0.03, decay: 0.012 });
    }
    strike(ctx, t + 0.66, { freq: 1046.5, partials: BELL, peak: 0.025, decay: 1.2, wet: 0.5 });
  },
  // The rewind: a reversed swell, ticks running backward and slowing, tape
  // dragging down to a stop, then the hour bell that starts the map again.
  timewarp_rewind(ctx, t) {
    hiss(ctx, t, { type: 'highpass', freq: 2500, to: 6000, q: 0.5, peak: 0.12, attack: 1.1, decay: 0.03, wet: 0.5 });
    for (let i = 0; i < 12; i += 1) {
      const d = 0.06 + (i / 12) ** 1.6 * 1.1;
      strike(ctx, t + d, { freq: 2600 - i * 90, partials: WOOD, peak: 0.04, decay: 0.05, pan: i % 2 ? 0.25 : -0.25, wet: 0.3 });
    }
    voice(ctx, t + 0.2, { type: 'sawtooth', from: 520, to: 55, cutoff: 2400, cutoffTo: 200, q: 2, peak: 0.04, attack: 0.05, hold: 0.4, decay: 0.5, wet: 0.35 });
    thump(ctx, t + 1.15, { from: 100, to: 30, peak: 0.3, decay: 0.6 });
    strike(ctx, t + 1.16, { freq: 130.8, partials: BELL, peak: 0.08, decay: 2.4, wet: 0.6 });
  },
  // Spent: the dial stops with a clunk and its glass cracks.
  timewarp_spent(ctx, t, rand) {
    strike(ctx, t, { freq: 700, partials: WOOD, peak: 0.07, decay: 0.12, wet: 0.2 });
    thump(ctx, t, { from: 130, to: 50, peak: 0.12, decay: 0.12 });
    hiss(ctx, t + 0.05, { type: 'highpass', freq: 3600, q: 0.7, peak: 0.1, decay: 0.03 });
    for (let i = 0; i < 6; i += 1) strike(ctx, t + 0.06 + rand() * 0.12, { freq: 3000 + rand() * 3500, partials: GLASS, peak: 0.02, decay: 0.08, pan: (rand() - 0.5) * 0.8, wet: 0.2 });
  },
};

/**
 * A skill coming alive: the evo skills' own layered cue where there is one,
 * otherwise the shared engine's stinger for the older skills.
 */
export function playSkillSound(skill) {
  if (CUES[`${skill}_ready`]) playEvoSound(`${skill}_ready`);
  else if (CUES[skill]) playEvoSound(skill);
  else playUiSound(`skill_${skill}`);
}

/** Whether `key` (a skill and event, e.g. 'surge_chain') has a sound here. */
export function hasEvoSound(key) {
  return Boolean(CUES[key]);
}

/** Plays one evo cue. `seed` varies the scattered detail so repeats don't sound cloned. */
export function playEvoSound(key, seed = 0) {
  const cue = CUES[key];
  if (!cue) return;
  // The SuperCollider render (scripts/sfx/evo.scd) when it's loaded; the live synth below otherwise.
  if (playSample(key, { gain: EVO_GAIN, detune: 0.025 })) return;
  const ctx = audio();
  if (!ctx) return;
  cue(ctx, ctx.currentTime + 0.01, seeded(seed + key.length * 31));
}
