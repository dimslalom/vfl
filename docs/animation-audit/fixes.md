# Animation fixes — 2 November 2026

All ten findings from the baseline audit have been addressed in the local VFL code. The original report and recordings are retained as the before state.

| Finding | Change |
|---|---|
| Conflicting pack transforms | Removed row/card jolts. The emergence has one transform owner, smaller scale change, a balanced 500 ms ease, and a later 320 ms edge accent on a separate layer. |
| Interrupted match effects | Specialties highlight together for a single 320 ms beat (300 ms minimum in Fast), with 280 ms effects. Scores remain in place and hold for at least 450 ms; significant rounds use 750 ms at Normal. Match playback begins after its scene settles. |
| Double Fast scaling | Solo supplies the unscaled 600 ms base to the bracket helper. Speed is applied once. |
| Library page crossfade | Removed the unmatched browser view transition. Inspection uses the existing overlay fade only, without fading the library. |
| Front-loaded large movements | Added dedicated 500 ms deal timing and balanced easing. Map travel reduced from 80 to 32 px; tactic travel from 50 to 24 px. Button timing is unchanged. |
| Unkeyed scene exits | Every direct PhaseTransition child has its own React key. Parent scenes fade without multiplying nested spatial movement. |
| Busy card physics | Tilt reduced to ±6°, velocity roll removed, hover/press elevation reduced, parallax follows the same spring, and spring integration uses small time steps. Flip midpoint lift/scale reduced and foil flashes removed. |
| Refresh-dependent lean | Scroll input uses velocity; spring/decay use elapsed time and small integration steps. Lean is limited to 6°. |
| Rapid backdrop reactions | Routine shakes removed. Decisive rounds get one 300 ms, at most 2 px impulse with a lighter vignette. The image stays stable as tension zoom increases. |
| Per-frame countdown renders | Solo and multiplayer use MotionValues for continuous fill. React updates whole-second labels, while exact timers still own completion. |

Additional fixes: the saved Normal/Fast/Instant preference is available in run details (with Portuguese and Spanish labels); NPC result reveals have a readable cadence; signing holds respect speed with a reading floor; signing flights are cancelled on unmount; reduced motion suppresses bank bumps and both flip directions; pack tear frames/timers are cleaned up; pointer cancellation preserves a partial tear without opening it; the foil stays mounted for its full fling. Native sheets get a gentle opening fade, and navigation press scale is reduced.

## Verification

- Lint passes.
- All 247 automated tests pass, including new 30/60/120 Hz scroll-physics regression tests and matching JavaScript/CSS motion tokens.
- Production build passes. The existing large card-data chunk still produces a size warning.
- Isolated browser checks cover inspection, both flips, repeated open/close, reduced motion, scene exit ordering, pack transform ownership, Fast/reduced flight timing, countdown render frequency and repeated skip.
- A fresh solo recording covers draft, map/tactic preparation, live rounds, bracket results, and progression to another event without browser runtime errors.

Browser evidence is saved in [after/browser-checks.json](after/browser-checks.json). Fast travel measured roughly 270–285 ms rather than the previous calculated 121.5 ms. The countdown fixture used five React renders over its 1.5-second sequence; its bar still animated continuously. All pack-emergence samples matched their sole transform owner within floating-point rounding.

[Watch the revised gameplay](after/captures/solo-desktop.mp4). The recording uses a fresh random draw, so it is a visual comparison of behavior, not an identical seeded replay of the baseline.

No deployment was performed. A real multiplayer host/guest session, Safari/Firefox, physical touch devices and 120 Hz hardware were not exercised. Multiplayer logic remains covered by the existing tests; refresh-rate equivalence is tested numerically. Shared card-source edits were made in the canonical local cards-val checkout and mirrored into VFL's shared checkout, without committing either repository.

API references checked because Context7 was unavailable: [Motion presence keys](https://motion.dev/docs/react-animate-presence), [Motion configuration and reduced motion](https://motion.dev/docs/react-motion-config), [browser view transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using).

## Reward-flight follow-up

The centre-to-bank flight still decelerated at its midpoint because its three-position keyframes applied easing separately to two segments. It now animates one progress value along a continuous curved path, with one easing over the whole journey. Position, scale and rotation use the same progress. Skip, cancellation, arrival callbacks and reduced-motion behavior are preserved.

The actual helper was tested before and after: midpoint horizontal speed was only 5% of the earlier-flight speed before the correction and 94% afterwards. The same browser check failed before the change and passed after it, with no runtime errors or leftover clones. Three path regression tests, lint, the production build and all 250 tests pass. [Browser evidence](after/reward-flight/checks.json) · [Controlled flight recording](after/reward-flight/continuous-flight.webm).
