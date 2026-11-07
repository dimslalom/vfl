// VFL's playUiSound: the rendered cue where there is one, else the shared engine's synth.
import { playUiSound as synth } from '../../shared/src/lib/gameAudio.js';
import { playSample } from './samples.js';

// Tuned to sit at the shared synth's level (its UI cues peak around 0.05).
const UI_GAIN = 0.07;
const PAN = { deal: step => ((step % 5) - 2) * 0.16, flip: step => ((step % 3) - 1) * 0.2 };

// The file for a stepped cue, matching the shared synth's note choice per step.
const step0 = step => Math.max(0, step | 0);
const FILE = {
  score: step => `score_${step0(step) % 9}`,
  score_opp: step => `score_opp_${step0(step) % 7}`,
  combo: step => `combo_${step0(step) % 4}`,
  specialty: step => `combo_${step0(step) % 4}`,
  tactic_mult: step => (Math.min(3, step || 2) >= 2.5 ? 'tactic_mult_hi' : 'tactic_mult_lo'),
  lane_win: step => `lane_win_${step > 0 ? 1 : 0}`,
};
// Cues whose pitch carries meaning (a scale climbing) only get a hair of variation.
const TUNED = new Set(['select', 'score', 'score_opp', 'combo', 'specialty', 'tactic_mult', 'lane_win']);

export function playUiSound(kind, step = 0) {
  const pan = PAN[kind]?.(step) ?? 0;
  const file = FILE[kind]?.(step) ?? kind;
  if (playSample(file, { gain: UI_GAIN, pan, detune: TUNED.has(kind) ? 0.006 : 0.03 })) return;
  // VFL-only cues have no synth of their own; borrow the nearest shared one.
  synth(kind === 'match_join' ? 'lock_in' : kind, step);
}
