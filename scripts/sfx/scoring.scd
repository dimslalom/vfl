// Scoring cues: the card attack on the bar (score / score_opp), chips and combos,
// lane verdicts and the round/series stingers. Same notes and timing as the shared
// synth (shared/src/lib/gameAudio.js) so the climbs still read, but built from
// layers: contact transient, mallet/brass body, short room.
// Run: /Applications/SuperCollider.app/Contents/MacOS/sclang scripts/sfx/scoring.scd
// Out: scripts/sfx/out/scoring/<cue>.wav. Pitched cues render one file per step.

(
var dir = thisProcess.nowExecutingPath.dirname +/+ "out/scoring";
var cues = List.new, marimba, brass, fmStab, spin;
(thisProcess.nowExecutingPath.dirname +/+ "lib.scd").load;

// tuned bar: marimba-like inharmonic modes
marimba = [[1, 3.93, 9.2], [1, 0.3, 0.1], [1, 0.3, 0.1]];

// brass section voice: 3 detuned saws, filter "blat" opening then settling, late vibrato
brass = { |d, f, dur, amp = 1, pan = 0, bright = 1, atk = 0.02|
	var env = ~e.(d, atk, dur * 0.6, dur * 0.25);
	var vib = 1 + (SinOsc.kr(Rand(4.8, 5.6), 0, 0.004) * EnvGen.kr(Env([0, 0, 1], [d + 0.12, 0.25])));
	var s = Mix(Saw.ar(f * vib * [Rand(0.994, 0.997), 1, Rand(1.003, 1.006)])) / 3;
	var cut = EnvGen.ar(Env([f * 1.5, f * 1.5, f * 9 * bright, f * 3 * bright], [d.max(1e-4), atk * 1.5, dur * 0.5], \exp));
	Pan2.ar(RLPF.ar(s, cut.min(15000), 0.6) * env * amp, pan)
};

// short bright FM hit (struck brass / bell edge), index decays fast
fmStab = { |d, f, dec, amp = 1, idx = 3, pan = 0|
	var i = idx * ~e.(d, 0.001, dec * 0.4);
	Pan2.ar(SinOsc.ar(f, SinOsc.ar(f * 2) * i) * ~e.(d, 0.001, dec) * amp, pan)
};

// a chip spinning up: noise whirr whose flutter speeds up
spin = { |dur, amp = 1|
	var rate = ~g.(14, 48, 0, dur);
	var s = BPF.ar(PinkNoise.ar, ~g.(500, 2800, 0, dur), 0.4) * (LFPulse.ar(rate, 0, 0.4) * 0.7 + 0.3);
	Pan2.ar(s * ~e.(0, dur * 0.8, 0.03) * amp * 2, 0)
};

// ── the card attacks the bar: yours bright, theirs muffled (one file per scale step)
[196, 220, 246.94, 293.66, 329.63, 392, 440, 493.88, 587.33].do { |f, i|
	cues.add([("score_" ++ i).asSymbol, 0.6, { ~master.(
		~thump.(0, 130, 48, 0.09, 0.9)
		+ ~hiss.(\hp, 0, 5200, 5200, 0.8, 0.0004, 0.006, 0.7)          // contact snap
		+ ~hiss.(\bp, 0, 3200, 1100, 1.2, 0.002, 0.05, 0.35, -0.2, 0.2) // the swipe through
		+ ~strike.(0.002, f * 2, marimba, 0.35, 1.0)
		+ fmStab.(0.002, f, 0.16, 0.22, 2.5)
		+ brass.(0.004, f, 0.14, 0.18, 0, 0.7, 0.008), 0.12) }]);
};
[146.83, 164.81, 174.61, 196, 220, 246.94, 293.66].do { |f, i|
	cues.add([("score_opp_" ++ i).asSymbol, 0.5, { ~master.(
		~thump.(0, 100, 42, 0.09, 0.85)
		+ ~hiss.(\lp, 0, 1100, 500, 0.9, 0.001, 0.03, 0.5)
		+ LPF.ar(~strike.(0.002, f * 2, ~wood, 0.25, 1.0), 1600)
		+ brass.(0.004, f, 0.12, 0.14, 0, 0.4, 0.01), 0.1) }]);
};

// ── synergy link (Roles / Team / Nation): two chain clinks, sub, brass triad
4.do { |k|
	var base = 220 * (1 + (k * 0.125));
	cues.add([("combo_" ++ k).asSymbol, 0.8, { ~master.(
		~thump.(0, 105, 45, 0.18, 0.9)
		+ ~strike.(0, 2600, ~steel, 0.12, 0.5, -0.3) + ~strike.(0.05, 3100, ~steel, 0.12, 0.45, 0.3)
		+ ~hiss.(\bp, 0, 1200, 2800, 1, 0.01, 0.06, 0.3)
		+ [1, 1.25, 1.5].collect({ |r, i| brass.(0.03 + (i * 0.032), base * r, 0.22, 0.2, (i - 1) * 0.25) }).sum, 0.2) }]);
};

// ── tactic multiplier: chip spins up, slams at 0.13s, chord hits (lo = x1.5-2, hi = x2.5+)
[[\tactic_mult_lo, 196], [\tactic_mult_hi, 220]].do { |c|
	var root = c[1];
	cues.add([c[0], 1.0, { ~master.(
		spin.(0.13, 0.5)
		+ ~thump.(0.13, 98, 36, 0.38, 1.2)
		+ ~hiss.(\bp, 0.13, 1800, 680, 0.9, 0.002, 0.12, 0.5)
		+ ~strike.(0.13, 1400, ~steel, 0.25, 0.4)
		+ [1, 1.25, 1.5, 2].collect({ |r, i| brass.(0.13 + (i * 0.018), root * r, 0.36, 0.2 - (i * 0.02), (i - 1.5) * 0.25) }).sum, 0.3) }]);
};

// ── lane verdicts (they sit under the glass shatter / lane win charge in sfx.js)
[[\lane_win_0, 1], [\lane_win_1, 1.12]].do { |c|
	var b = c[1];
	cues.add([c[0], 1.0, { ~master.(
		~thump.(0, 96 * b, 38, 0.32, 1.2)
		+ ~hiss.(\bp, 0, 1500, 520, 0.9, 0.002, 0.1, 0.5)
		+ [196, 293.66, 392].collect({ |f, i| brass.(i * 0.02, f * b, 0.26, 0.2, (i - 1) * 0.25) }).sum, 0.3) }]);
};
cues.add([\lane_loss, 0.9, { ~master.(
	~thump.(0, 88, 38, 0.26, 1.1)
	+ ~hiss.(\lp, 0, 620, 220, 0.9, 0.002, 0.08, 0.5)
	+ LPF.ar(Mix([brass.(0, 196, 0.22, 0.2, 0, 0.35), brass.(0.08, 174.61, 0.24, 0.16, 0, 0.3)]), 900), 0.25) }]);

// ── round and series stingers
cues.add([\flawless, 2.2, { ~master.(
	~thump.(0, 116, 36, 0.52, 1.3)
	+ ~crowd.(0.02, 1.5, 0.35)
	+ ~hiss.(\bp, 0, 500, 4200, 0.6, 0.015, 0.38, 0.4)
	+ [196, 246.94, 293.66, 392, 493.88, 587.33].collect({ |f, i| brass.(i * 0.038, f, 0.5, 0.17 - (i * 0.012), (i - 2.5) * 0.2, 1.1) }).sum
	+ ~strike.(0.2, 1174.66, ~bell, 1.0, 0.35), 0.35) }]);
cues.add([\round_win, 1.8, { ~master.(
	~thump.(0, 104, 36, 0.42, 1.2)
	+ ~crowd.(0.02, 1.1, 0.25)
	+ ~hiss.(\bp, 0, 600, 3200, 0.7, 0.015, 0.22, 0.35)
	+ [196, 246.94, 293.66, 392, 493.88].collect({ |f, i| brass.(i * 0.045, f, 0.36, 0.17 - (i * 0.012), (i - 2) * 0.22) }).sum, 0.32) }]);
cues.add([\round_loss, 1.5, { ~master.(
	~thump.(0, 98, 38, 0.38, 1.1)
	+ ~hiss.(\lp, 0, 900, 280, 0.8, 0.01, 0.18, 0.45)
	+ LPF.ar(Mix([220, 196, 164.81].collect({ |f, i| brass.(i * 0.075, f, 0.3, 0.18, (i - 1) * 0.2, 0.4) })), 1100), 0.28) }]);
cues.add([\series_win, 2.6, { ~master.(
	~thump.(0, 110, 32, 0.65, 1.4)
	+ ~crowd.(0.03, 2.0, 0.45)
	+ ~hiss.(\bp, 0, 400, 3800, 0.6, 0.03, 0.45, 0.4)
	+ [146.83, 220, 293.66, 369.99, 440, 587.33, 739.99].collect({ |f, i| brass.(i * 0.045, f, 0.58, 0.16 - (i * 0.012), (i - 3) * 0.2, 1.15, 0.035) }).sum
	+ ~strike.(0.32, 1479.98, ~bell, 1.2, 0.3), 0.38) }]);
cues.add([\series_loss, 2.2, { ~master.(
	~thump.(0, 82.41, 34, 0.55, 1.2)
	+ ~hiss.(\lp, 0, 600, 200, 0.8, 0.03, 0.3, 0.45)
	+ LPF.ar(Mix([196, 233.08, 293.66, 146.83].collect({ |f, i| brass.(i * 0.075, f, 0.42, 0.17, (i - 1.5) * 0.18, 0.4, 0.03) })), 950), 0.32) }]);

~render.(cues, dir);
)
