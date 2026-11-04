// VFL's own procedural sounds, beside the shared engine's (shared/src/lib/gameAudio.js,
// which lives in the cards-val repo). Same approach: Web Audio, no sound files.
// The context is made on first use, which is always after the player has tapped.

let context = null;
let bus = null;
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
    // A little under the shared engine's cues, so a break is felt, not blared.
    const level = context.createGain();
    level.gain.value = 0.7;
    level.connect(comp);
    bus = level;
    // One second of white noise, reused by every burst.
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') context.resume().catch(() => null);
  return context;
}

function envelope(ctx, gainNode, at, peak, attack, decay) {
  gainNode.gain.setValueAtTime(0.0001, at);
  gainNode.gain.exponentialRampToValueAtTime(peak, at + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function burst(ctx, at, { type, freq, q = 1, peak, attack = 0.002, decay, pan = 0 }) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  envelope(ctx, gain, at, peak, attack, decay);
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  source.connect(filter).connect(gain).connect(panner).connect(bus);
  source.start(at, Math.random() * 0.5, attack + decay + 0.05);
}

function ping(ctx, at, { freq, peak, decay, pan = 0 }) {
  // A glass sliver rings at two inharmonic partials, the upper one dying first.
  for (const [ratio, level, life] of [[1, 1, 1], [2.76, 0.45, 0.6]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const gain = ctx.createGain();
    envelope(ctx, gain, at, peak * level, 0.001, decay * life);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(gain).connect(panner).connect(bus);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

/**
 * A pane of glass breaking: a dull impact, a sharp crack, the burst of the break,
 * then slivers tinkling down for a third of a second, scattered left to right.
 * `seed` varies the slivers so three lanes breaking in a row don't sound cloned.
 */
export function playGlassShatter(seed = 0) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  let state = (seed * 2654435761 + 1) >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  // Impact: a short low thump under everything.
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150, t);
  thump.frequency.exponentialRampToValueAtTime(48, t + 0.14);
  const thumpGain = ctx.createGain();
  envelope(ctx, thumpGain, t, 0.22, 0.003, 0.16);
  thump.connect(thumpGain).connect(bus);
  thump.start(t);
  thump.stop(t + 0.2);

  // Crack: the first bright snap.
  burst(ctx, t, { type: 'highpass', freq: 3200, q: 0.7, peak: 0.24, decay: 0.035 });
  // Break: the body of shattering glass, bright and quickly gone.
  burst(ctx, t + 0.012, { type: 'bandpass', freq: 4600, q: 0.9, peak: 0.2, attack: 0.004, decay: 0.32 });
  burst(ctx, t + 0.02, { type: 'bandpass', freq: 2100, q: 1.1, peak: 0.08, attack: 0.006, decay: 0.2 });

  // Slivers: many short rings, most of them early, a few trailing.
  for (let i = 0; i < 16; i += 1) {
    const r = rand();
    const delay = 0.03 + r * r * 0.38;
    ping(ctx, t + delay, {
      freq: 2400 + rand() * 5600,
      peak: 0.045 * (1 - delay),
      decay: 0.05 + rand() * 0.14,
      pan: (rand() - 0.5) * 1.3,
    });
  }
  // And the grit of small pieces settling.
  for (let i = 0; i < 5; i += 1) {
    const delay = 0.12 + rand() * 0.28;
    burst(ctx, t + delay, { type: 'highpass', freq: 5200, q: 0.8, peak: 0.03, decay: 0.03, pan: (rand() - 0.5) * 1.2 });
  }
}

function bell(ctx, at, { freq, peak, decay, pan = 0 }) {
  // A struck bell: the fundamental, a bright octave and a shimmering fifth above.
  for (const [ratio, level, life] of [[1, 1, 1], [2, 0.5, 0.7], [3.01, 0.22, 0.45]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const gain = ctx.createGain();
    envelope(ctx, gain, at, peak * level, 0.004, decay * life);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(gain).connect(panner).connect(bus);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

/**
 * A lane won: energy charging up the border, a bright shockwave whoosh, then a
 * major-chord bell bloom that rings out. The losing lane's opposite: rising and whole.
 * `seed` (the lane index) lifts the chord a step per lane, so wins climb.
 */
export function playLaneWin(seed = 0) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  const root = 523.25 * 2 ** ((seed % 3) * 2 / 12); // C5, D5, E5

  // Charge: a quick sawtooth sweep up through a closing lowpass.
  const sweep = ctx.createOscillator();
  sweep.type = 'sawtooth';
  sweep.frequency.setValueAtTime(root / 4, t);
  sweep.frequency.exponentialRampToValueAtTime(root, t + 0.16);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.exponentialRampToValueAtTime(5000, t + 0.16);
  const sweepGain = ctx.createGain();
  envelope(ctx, sweepGain, t, 0.07, 0.12, 0.08);
  sweep.connect(lp).connect(sweepGain).connect(bus);
  sweep.start(t);
  sweep.stop(t + 0.25);

  // Shockwave: an airy whoosh as the border flashes.
  const hit = t + 0.16;
  burst(ctx, hit, { type: 'bandpass', freq: 1800, q: 0.6, peak: 0.1, attack: 0.01, decay: 0.28 });

  // Bloom: root, third, fifth, octave, struck in a fast roll, spread across the field.
  [1, 1.26, 1.5, 2].forEach((ratio, i) => {
    bell(ctx, hit + i * 0.035, { freq: root * ratio, peak: 0.09 - i * 0.012, decay: 0.9 - i * 0.1, pan: (i - 1.5) * 0.35 });
  });
  // Sparkle: a few high glints trailing the chord.
  for (let i = 0; i < 4; i += 1) {
    ping(ctx, hit + 0.12 + i * 0.06, { freq: root * 4 * [1, 1.5, 1.26, 2][i], peak: 0.025, decay: 0.18, pan: (i % 2 ? 1 : -1) * 0.5 });
  }
}
