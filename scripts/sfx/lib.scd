// Shared building blocks for the SuperCollider cue scripts (evo.scd, scoring.scd).
// Load with: (thisProcess.nowExecutingPath.dirname +/+ "lib.scd").load;

~steel = [[1, 2.41, 3.87, 5.33, 7.1], [1, 0.6, 0.4, 0.25, 0.12], [1, 0.55, 0.35, 0.2, 0.1]];
~glass = [[1, 2.76, 5.4, 8.9], [1, 0.5, 0.25, 0.1], [1, 0.5, 0.3, 0.15]];
~bell = [[0.5, 1, 1.19, 1.56, 2, 2.51, 3.01], [0.7, 1, 0.5, 0.35, 0.6, 0.2, 0.15], [1.2, 1, 0.7, 0.5, 0.45, 0.3, 0.2]];
~wood = [[1, 2.57, 4.6, 6.9], [1, 0.45, 0.2, 0.08], [1, 0.5, 0.25, 0.12]];

// delay d, attack a, release r (exponential-ish curve), optional hold
~e = { |d, a, r, hold = 0| EnvGen.ar(Env([0, 0, 1, 1, 0], [d.max(1e-4), a, hold, r], [0, 3, 0, -6])) };
// exponential glide from->to starting at d
~g = { |from, to, d, dur| EnvGen.ar(Env([from, from, to], [d.max(1e-4), dur], \exp)) };

// pitch-dropping saturated sub + a tiny click of contact
~thump = { |d, from, to, dec, amp = 1|
	var body = (SinOsc.ar(~g.(from * Rand(0.97, 1.03), to, d, dec * 0.6)) * 1.8).tanh * ~e.(d, 0.002, dec);
	var click = BPF.ar(WhiteNoise.ar, Rand(1000, 1600), 1.2) * ~e.(d, 0.0004, 0.006);
	Pan2.ar((body + (click * 0.6)) * amp, 0)
};

// swept, slightly grainy pink noise; kind: \bp \hp \lp; pans p0->p1
~hiss = { |kind, d, f0, f1, rq, a, r, amp = 1, p0 = 0, p1, hold = 0|
	var dur = a + hold + r;
	var f = ~g.(f0 * Rand(0.93, 1.07), f1, d, dur);
	var n = PinkNoise.ar * (1 + (LFNoise1.ar(Rand(25, 60)) * 0.35));
	var s = switch(kind,
		\bp, { BPF.ar(n, f, rq) * (rq.reciprocal.sqrt) },
		\hp, { RHPF.ar(n, f, rq) },
		\lp, { RLPF.ar(n, f, rq) });
	Pan2.ar(s * ~e.(d, a, r, hold) * amp, EnvGen.ar(Env([p0, p0, p1 ? p0], [d.max(1e-4), dur])))
};

// struck object: modal bank excited by a short noise burst; glide bends pitch
~strike = { |d, freq, set, dec, amp = 1, pan = 0, glide = 1|
	var ex = (WhiteNoise.ar * ~e.(d, 0.0003, 0.003)) + (Impulse.ar(0) * 0);
	var f = ~g.(freq * Rand(0.985, 1.015), freq * glide, d, dec);
	var s = DynKlank.ar(`[set[0] * Rand(0.995, 1.005), set[1], set[2] * dec], DelayN.ar(ex, 0.01, Rand(0, 0.002)), f);
	Pan2.ar(LeakDC.ar(s) * amp * 0.05, pan)
};

// embers / sparks / ticks: random pops, each its own pitch and place
~crackle = { |d, span, density, freq, amp = 1, ring = 0.02|
	var gate = ~e.(d, 0.01, span * 0.6, span * 0.3);
	var trig = Dust.ar(density) * gate;
	var s = Ringz.ar(trig, TExpRand.ar(freq * 0.6, freq * 1.8, trig), ring * TRand.ar(0.5, 1.5, trig));
	Pan2.ar(s * amp * 0.3, TRand.ar(-0.8, 0.8, trig))
};

// held tone: detuned pair through a resonant lowpass that can sweep
~tone = { |d, osc, from, to, cut0, cut1, a, r, amp = 1, hold = 0, rq = 0.7, pan = 0, drive = false|
	var dur = a + hold + r;
	var f = ~g.(from, to ? from, d, dur);
	var s = Mix(osc.ar(f * [Rand(0.996, 0.999), Rand(1.001, 1.004)])) * 0.5;
	s = RLPF.ar(s, ~g.(cut0, cut1 ? cut0, d, dur), rq);
	if(drive) { s = (s * 3).tanh * 0.5 };
	Pan2.ar(s * ~e.(d, a, r, hold) * amp, pan)
};

// shared arena: stereo reverb, DC/rumble cleanup, safety limiter
~master = { |s, wet = 0.3, room = 0.7|
	s = FreeVerb2.ar(s[0], s[1], wet * 0.35, room.min(0.45), 0.7); // dry-forward: short, damped room
	Limiter.ar(HPF.ar(LeakDC.ar(s), 28), 0.95)
};

// arena crowd wash: bands of noise each swelling on its own, spread wide
~crowd = { |d, dur, amp = 1, lo = 500, hi = 2600|
	var bands = { BPF.ar(PinkNoise.ar, ExpRand(lo, hi), 0.45) * LFNoise1.kr(Rand(2, 7)).range(0.3, 1) } ! 6;
	Splay.ar(bands) * ~e.(d, dur * 0.35, dur * 0.65) * amp * 2
};

// Renders [[name, seconds, graphFunc], ...] to dir/<name>.wav, one NRT pass each, then quits.
~render = { |cues, dir|
	var opts = ServerOptions.new.numOutputBusChannels_(2).numInputBusChannels_(0).sampleRate_(48000).memSize_(65536);
	File.mkdir(dir);
Routine({
	cues.do { |c|
		var name = c[0], dur = c[1], cond = Condition.new;
		var def = SynthDef(name, { Out.ar(0, SynthDef.wrap(c[2])) });
		Score([
			[0, [\d_recv, def.asBytes]],
			[0, [\s_new, name, 1000, 0, 0]],
			[dur, [\c_set, 0, 0]]
		]).recordNRT(nil, dir +/+ name ++ ".wav", sampleRate: 48000, headerFormat: "WAV",
			sampleFormat: "int24", options: opts, duration: dur, action: { cond.unhang });
		cond.hang;
		("rendered " ++ name).postln;
	};
	0.exit;
}).play(AppClock);
};
