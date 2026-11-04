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
