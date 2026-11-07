// Evo skill cues, rebuilt in SuperCollider and rendered offline (NRT).
// Run: /Applications/SuperCollider.app/Contents/MacOS/sclang scripts/sfx/evo.scd
// Out: scripts/sfx/out/evo/<cue>.wav (48k/24-bit stereo, normalized after with sox)
// Every cue: transient + material body + tail. Struck objects are DynKlank modal
// banks excited by a noise burst; fire is Dust->Ringz embers; air is swept pink noise.
// Rand/TRand/Dust give each render its own micro-variation.

(
var dir = thisProcess.nowExecutingPath.dirname +/+ "out/evo";
var cues;
(thisProcess.nowExecutingPath.dirname +/+ "lib.scd").load;

cues = [
	// steel plate set down: sub, low steel ring, a gritty scrape across it
	[\ironclad_ready, 1.6, { ~master.(
		~thump.(0, 110, 38, 0.28) + ~strike.(0.005, 168, ~steel, 1.1, 1.2)
		+ ~hiss.(\bp, 0, 900, 420, 0.5, 0.02, 0.22, 0.5, -0.3, 0.3)
		+ ~crackle.(0.01, 0.2, 90, 2600, 0.3, 0.004), 0.3) }],
	// chip glances off: high clang, ricochet whine with doppler pan, sparks
	[\ironclad_block, 1.2, { ~master.(
		~strike.(0, 410, ~steel, 0.7, 1.1, -0.2)
		+ ~hiss.(\hp, 0, 3500, 3500, 0.7, 0.0005, 0.03, 0.9)
		+ ~tone.(0.03, SinOsc, 2600, 1100, 6000, 6000, 0.005, 0.32, 0.15, 0, 1, 0.4)
		+ ~crackle.(0.04, 0.25, 40, 4500, 0.6, 0.05), 0.3) }],
	// smoke breathing out: slow swelling air that drifts, a soft low hum
	[\lurk_ready, 1.6, { ~master.(
		~hiss.(\lp, 0, 450, 1700, 0.9, 0.3, 0.7, 0.8, -0.4, 0.4)
		+ ~hiss.(\bp, 0.05, 2500, 1200, 1.5, 0.35, 0.5, 0.15, 0.4, -0.3)
		+ ~tone.(0, SinOsc, 72, 62, 400, 300, 0.2, 0.6, 0.5), 0.4) }],
	// smoke torn away: rising rush, a hard cut, sub, glass glint
	[\lurk_reveal, 1.4, { ~master.(
		~hiss.(\hp, 0, 300, 5200, 0.6, 0.24, 0.04, 0.8, 0.4, -0.2)
		+ ~hiss.(\hp, 0.27, 4200, 4200, 0.8, 0.0005, 0.03, 1.2)
		+ ~thump.(0.27, 160, 52, 0.16, 0.9)
		+ ~strike.(0.28, 880, ~glass, 0.3, 0.6), 0.35) }],
	// something fast passing close: doppler-bent air left to right
	[\velocity_ready, 0.9, { ~master.(
		~hiss.(\bp, 0, 600, 2800, 0.6, 0.16, 0.16, 1, -0.9, 0.9)
		+ ~tone.(0.05, LFTri, 380, 900, 3000, 3000, 0.1, 0.15, 0.2, 0, 1, -0.6), 0.2) }],
	// dash: rush, landing skid (grit), sub, then a breath out
	[\velocity_dash, 1.3, { ~master.(
		~hiss.(\bp, 0, 500, 3400, 0.7, 0.18, 0.08, 1.1, -0.9, 0.8)
		+ ~hiss.(\bp, 0.26, 1400, 650, 0.3, 0.005, 0.24, 0.7, 0.7)
		+ ~thump.(0.26, 150, 50, 0.15, 0.9)
		+ ~crackle.(0.26, 0.2, 80, 2400, 0.5, 0.006)
		+ ~tone.(0.42, SinOsc, 330, 140, 1200, 800, 0.02, 0.4, 0.3), 0.25) }],
	// match strike, whoomph of catching, embers
	[\combustion_ready, 1.4, { ~master.(
		~hiss.(\hp, 0, 2600, 3800, 0.8, 0.001, 0.05, 1)
		+ ~hiss.(\lp, 0.03, 180, 1100, 0.8, 0.08, 0.45, 1.3)
		+ ~thump.(0.04, 90, 40, 0.3, 0.7)
		+ ~crackle.(0.08, 0.6, 30, 2800, 0.9), 0.25) }],
	// fuel burning down: sizzle, falling hum, sparse pops
	[\combustion_fuel, 1.0, { ~master.(
		~hiss.(\bp, 0, 4000, 1800, 0.8, 0.02, 0.4, 0.6)
		+ ~tone.(0, Saw, 180, 70, 600, 200, 0.02, 0.45, 0.4)
		+ ~crackle.(0, 0.35, 25, 3200, 0.6), 0.15) }],
	// flare: launch rush, fiery blast, debris embers
	[\combustion_flare, 1.9, { ~master.(
		~hiss.(\bp, 0, 300, 2200, 1, 0.3, 0.04, 0.8, -0.4, 0.4)
		+ ~thump.(0.36, 120, 32, 0.45, 1.2)
		+ ~hiss.(\lp, 0.36, 3000, 300, 0.7, 0.004, 0.6, 1.4, 0.4)
		+ ~crackle.(0.41, 0.7, 35, 2600, 0.9), 0.35) }],
	// two beating low tones, air drawn inward
	[\phase_ready, 1.4, { ~master.(
		~tone.(0, SinOsc, 55, 55, 300, 300, 0.15, 0.5, 0.7, 0.2)
		+ ~tone.(0, SinOsc, 57.5, 57.5, 300, 300, 0.15, 0.5, 0.6, 0.2)
		+ ~hiss.(\bp, 0, 2400, 400, 0.8, 0.5, 0.03, 0.6, 0.3, -0.3), 0.25) }],
	// long inhale stops dead, drop, bent glass ring
	[\phase_rift, 2.0, { ~master.(
		~hiss.(\bp, 0, 4200, 180, 0.9, 0.38, 0.02, 1.1, 0.3, -0.3)
		+ ~thump.(0.4, 90, 28, 0.5, 1.2)
		+ ~strike.(0.41, 620, ~glass, 0.9, 0.9, 0, 0.55), 0.45) }],
	// distant thunder rolling, a breath of rain
	[\surge_ready, 1.8, { ~master.(
		~hiss.(\lp, 0, 160, 80, 0.7, 0.08, 0.8, 2.2, 0, 0, 0.15)
		+ ~crackle.(0, 0.9, 6, 120, 1.2, 0.15)
		+ ~hiss.(\hp, 0.1, 5000, 5000, 0.5, 0.15, 0.4, 0.25), 0.4) }],
	// chain lightning: crack, FM electric buzz, spitting branches, thunder
	[\surge_chain, 2.2, { ~master.(
		~hiss.(\hp, 0, 2000, 2000, 0.5, 0.0005, 0.05, 2)
		+ Pan2.ar(BPF.ar(Saw.ar(92 + (SinOsc.ar(37 * Rand(0.95, 1.05)) * 260)), 1800, 1) * ~e.(0, 0.002, 0.3, 0.06) * 0.7, LFNoise1.kr(8) * 0.5)
		+ ~crackle.(0.02, 0.35, 90, 4200, 1.0, 0.006)
		+ ~hiss.(\lp, 0.18, 220, 70, 0.6, 0.05, 1.1, 2.2, 0, 0, 0.1), 0.4) }],
	// wings of air under a held, breathing choir
	[\ascendance_ready, 1.6, { ~master.(
		~hiss.(\lp, 0, 300, 900, 0.6, 0.06, 0.25, 0.7)
		+ [587.33, 739.99, 880, 1174.66].collect({ |f, i|
			~tone.(0.05 + (i * 0.04), VarSaw, f, f, 2200, 3200, 0.18, 0.6, 0.12, 0.15, 1, (i - 1.5) * 0.3)
			* SinOsc.kr(Rand(4.5, 5.5), 0, 0.15, 0.85) }).sum, 0.5, 0.85) }],
	// two wingbeats, swelling chord, landing bell bloom
	[\ascendance_rise, 2.6, { ~master.(
		[0, 0.2].collect({ |d| ~hiss.(\lp, d, 350, 1200, 0.6, 0.03, 0.14, 1.2) + ~thump.(d, 80, 50, 0.12, 0.5) }).sum
		+ [440, 554.37, 659.25, 880].collect({ |f, i|
			~tone.(0.3 + (i * 0.05), VarSaw, f, f, 2000, 3500, 0.25, 0.7, 0.15, 0.1, 1, (i - 1.5) * 0.3) }).sum
		+ ~strike.(0.7, 880, ~bell, 1.6, 0.9), 0.5, 0.85) }],
	// heavy seal pressed, low church bell
	[\dominion_ready, 2.4, { ~master.(
		~thump.(0, 120, 40, 0.24, 1.1)
		+ ~hiss.(\bp, 0, 700, 350, 0.8, 0.002, 0.08, 0.6)
		+ ~strike.(0.01, 196, ~bell, 1.8, 1.1), 0.45, 0.85) }],
	// stamp slams, bells answer in fifths, glints
	[\dominion_seal, 2.6, { ~master.(
		~thump.(0, 150, 36, 0.3, 1.3)
		+ ~hiss.(\bp, 0, 1200, 500, 0.9, 0.002, 0.07, 1)
		+ ~strike.(0.01, 130.8, ~bell, 2, 1.2)
		+ ~strike.(0.09, 196, ~bell, 1.6, 0.7, 0.3)
		+ ~crackle.(0.15, 0.3, 14, 3800, 0.4, 0.12), 0.5, 0.85) }],
	// gravity: slow low wobble, air swirling round it
	[\black_hole_ready, 1.6, { ~master.(
		~tone.(0, SinOsc, 46, 38, 200, 200, 0.2, 0.6, 1, 0.2) * SinOsc.kr(3, 0, 0.3, 0.7)
		+ ~hiss.(\bp, 0, 1600, 300, 0.25, 0.3, 0.5, 0.6, -0.7, 0.7), 0.4) }],
	// the long spinning draw, the fall, the implosion
	[\black_hole_pull, 2.4, { ~master.(
		~hiss.(\bp, 0, 3200, 140, 0.5, 0.5, 0.03, 1.2, 0.8, -0.8)
		+ ~tone.(0, SinOsc, 120, 30, 400, 200, 0.3, 0.3, 0.9)
		+ ~thump.(0.55, 70, 24, 0.6, 1.4)
		+ ~strike.(0.55, 300, ~bell, 1.2, 0.6, 0, 0.5), 0.45) }],
	// engine revving up with combustion pulses
	[\overdrive_surge, 1.0, { ~master.(
		(~tone.(0, Saw, 70, 230, 300, 2600, 0.04, 0.25, 0.8, 0.15, 0.3, 0, true)
		+ ~tone.(0, Pulse, 35, 115, 200, 900, 0.04, 0.25, 0.5, 0.15, 0.7, 0, true))
		* (LFPulse.ar(~g.(18, 60, 0, 0.4), 0, 0.6) * 0.5 + 0.5)
		+ ~thump.(0.42, 120, 40, 0.2, 0.9), 0.2) }],
	// engine running out of breath
	[\overdrive_tilt, 1.2, { ~master.(
		~tone.(0, Saw, 210, 48, 1800, 160, 0.02, 0.55, 0.8, 0.1, 0.35, 0, true)
		* (LFPulse.ar(~g.(50, 9, 0, 0.6), 0, 0.6) * 0.5 + 0.5)
		+ ~hiss.(\lp, 0, 1200, 150, 0.7, 0.02, 0.6, 0.5), 0.25) }],
	// clock tick-tock in a wooden case, a small bell
	[\timewarp_ready, 2.0, { ~master.(
		4.collect({ |i| ~strike.(i * 0.16, [2300, 1900][i % 2], ~wood, 0.06, 1, [-0.2, 0.2][i % 2])
			+ ~hiss.(\hp, i * 0.16, 5000, 5000, 1, 0.0005, 0.012, 0.3) }).sum
		+ ~strike.(0.66, 1046.5, ~bell, 1.2, 0.4), 0.35) }],
	// reversed swell, ticks slowing backward, tape drag, hour bell
	[\timewarp_rewind, 3.6, { ~master.(
		~hiss.(\hp, 0, 2500, 6000, 0.5, 1.1, 0.03, 0.9)
		+ 12.collect({ |i| ~strike.(0.06 + ((i / 12) ** 1.6 * 1.1), 2600 - (i * 90), ~wood, 0.05, 0.8, [-0.25, 0.25][i % 2]) }).sum
		+ ~tone.(0.2, Saw, 520, 55, 2400, 200, 0.05, 0.5, 0.4, 0.4, 0.5)
		+ ~thump.(1.15, 100, 30, 0.6, 1.3)
		+ ~strike.(1.16, 130.8, ~bell, 2.4, 1.3), 0.5, 0.85) }],
	// the dial clunks to a stop and its glass cracks
	[\timewarp_spent, 1.0, { ~master.(
		~strike.(0, 700, ~wood, 0.12, 1.2)
		+ ~thump.(0, 130, 50, 0.12, 0.7)
		+ ~hiss.(\hp, 0.05, 3600, 3600, 0.7, 0.0005, 0.03, 0.9)
		+ ~crackle.(0.06, 0.12, 60, 4500, 0.6, 0.05), 0.2) }],
];

~render.(cues, dir);
)
