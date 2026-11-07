// Joining a match (MatchIntro): the two club panels cut in from either side
// (0-0.45s), slam together at the seam (0.45s), and the arena gets riled up,
// peaking with the music's beat drop (1.0s) before settling under the board.
// Run: /Applications/SuperCollider.app/Contents/MacOS/sclang scripts/sfx/match.scd
// Out: scripts/sfx/out/match/<cue>.wav

(
var dir = thisProcess.nowExecutingPath.dirname +/+ "out/match";
var shout, claps, power;
(thisProcess.nowExecutingPath.dirname +/+ "lib.scd").load;

// one fan yelling "hey!/oh!": a voiced buzz through vowel formants, pitch rising as they push it
shout = { |d|
	var f0 = Rand(150, 290), dur = Rand(0.25, 0.55);
	var pitch = ~g.(f0, f0 * Rand(1.15, 1.5), d, dur * 0.6);
	var src = Saw.ar(pitch * (1 + (LFNoise1.kr(12) * 0.02))) + (PinkNoise.ar * 0.15);
	var vowel = [[Rand(600, 800), Rand(1000, 1300), 2500], [1, 0.5, 0.2]];
	var s = Mix(BPF.ar(src, vowel[0], 0.12) * vowel[1]) * 3;
	Pan2.ar(s * ~e.(d, Rand(0.03, 0.08), dur * 0.7, dur * 0.3), Rand(-0.9, 0.9))
};

// a crowd clapping: many hands, density rising, each clap a tiny noise burst with its own colour
claps = { |d, dur, rate0, rate1, amp = 1|
	var gate = ~e.(d, dur * 0.5, dur * 0.4, dur * 0.1);
	var trig = Dust.ar(~g.(rate0, rate1, d, dur * 0.6)) * (gate > 0.02);
	var s = BPF.ar(WhiteNoise.ar * Decay2.ar(trig, 0.0005, TRand.ar(0.006, 0.014, trig)), TExpRand.ar(900, 2600, trig), 0.8);
	Pan2.ar(s * gate * amp * 4, TRand.ar(-0.9, 0.9, trig))
};

// power fifth slam, brass-like: detuned saws whose filter opens and settles
power = { |d, f, dur, amp = 1, pan = 0|
	var s = Mix(Saw.ar(f * [Rand(0.994, 0.997), 1, Rand(1.003, 1.006)])) / 3;
	var cut = EnvGen.ar(Env([f * 1.5, f * 1.5, f * 9, f * 3], [d, 0.03, dur * 0.5], \exp));
	Pan2.ar(RLPF.ar(s, cut.min(15000), 0.6) * ~e.(d, 0.012, dur * 0.6, dur * 0.25) * amp, pan)
};

~render.([[\match_join, 2.8, { ~master.(
	// panels cutting in: one whoosh from each side, meeting in the middle
	~hiss.(\bp, 0, 400, 2600, 0.7, 0.4, 0.05, 0.6, -0.9, -0.1)
	+ ~hiss.(\bp, 0.02, 380, 2400, 0.7, 0.38, 0.05, 0.6, 0.9, 0.1)
	// the seam slam
	+ ~thump.(0.45, 118, 36, 0.4, 1.3)
	+ ~hiss.(\hp, 0.45, 3800, 3800, 0.8, 0.0004, 0.02, 0.8)
	+ ~strike.(0.45, 160, ~steel, 0.6, 0.6)
	+ [196, 293.66, 392].collect({ |f, i| power.(0.46 + (i * 0.02), f, 0.32, 0.22 - (i * 0.03), (i - 1) * 0.25) }).sum
	// the crowd: a murmur that builds, roars at the drop, then settles
	+ ~crowd.(0, 2.6, 0.9, 300, 1800)
	+ ~crowd.(0.5, 1.6, 0.8, 800, 3200)
	+ claps.(0.25, 2.2, 8, 70, 0.6)
	+ 14.collect({ shout.(0.5 + 0.7.rand) }).sum * 0.12  // fans yelling as it lands
	// a long low swell under it all, landing on the drop
	+ ~hiss.(\lp, 0.4, 120, 300, 0.7, 0.6, 1.0, 0.5),
	0.35) }]], dir);
)
