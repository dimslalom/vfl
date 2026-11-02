import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, useMotionValue } from 'motion/react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';

// A cancellable auto-advance.
//
// The run used to advance itself with bare setTimeout calls - 1900ms after the
// intro splash, 2200ms after a board completes, 1700ms after a series ends -
// with no countdown and no way out. A player sees each of those dozens of times
// per run. Two HIG rules apply directly:
//
//   "Let people cancel motion. As much as possible, don't make people wait for
//    an animation to complete before they can do anything, especially if they
//    have to experience the animation more than once."          - Motion
//   "Minimize use of time-boxed interface elements... Prefer dismissing views
//    with an explicit action."                    - Accessibility > Cognitive
//
// So every auto-advance goes through here: it reports `remaining` so the UI can
// show the wait, and `skip` so the player can end it. Under Reduce Motion the
// spatial fill animation is removed; reading time stays intact unless a
// caller explicitly supplies a different `reducedDuration`. Timers are cleared on unmount - the discipline the run loop already
// had, now shared.
//
//   const { progress, seconds, skip } = useSkippableTimeline({
//     duration: 2200,
//     active: boardState === 'complete',
//     onDone: advance,
//   });
//
export default function useSkippableTimeline({
  duration,
  onDone,
  active = true,
  reducedDuration = duration,
}) {
  // Derived during render rather than stashed in a ref, so toggling Reduce
  // Motion mid-session re-derives the span instead of waiting for a remount.
  const reduced = useReducedMotion();
  const span = reduced ? reducedDuration : duration;

  const [remaining, setRemaining] = useState(span);
  const progress = useMotionValue(1);

  // Latest-callback ref, assigned in an effect so render stays pure. Without
  // it, a caller passing an inline arrow would restart the timer every render.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const settledRef = useRef(false);

  // The timeout and an explicit skip race each other; only one may win.
  const finish = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    progress.set(0);
    setRemaining(0);
    onDoneRef.current?.();
  }, [progress]);

  useEffect(() => {
    if (!active) return undefined;

    settledRef.current = false;
    const startedAt = performance.now();

    progress.set(span > 0 ? 1 : 0);
    const control = reduced || span === 0 ? null : animate(progress, 0, { duration: span / 1000, ease: 'linear' });
    let displayTimer;
    const tick = () => {
      if (settledRef.current) return;
      const left = Math.max(0, span - (performance.now() - startedAt));
      if (reduced) progress.set(span > 0 ? left / span : 0);
      setRemaining(Math.ceil(left / 1000) * 1000);
      if (left > 0) displayTimer = setTimeout(tick, left % 1000 || 1000);
    };
    displayTimer = setTimeout(tick, 0);
    const timeout = setTimeout(finish, span);

    return () => {
      control?.stop();
      clearTimeout(displayTimer);
      clearTimeout(timeout);
    };
  }, [active, span, finish, progress, reduced]);

  return {
    remaining,
    // MotionValue for a draining bar: <m.div style={{ scaleX: progress }} />
    progress,
    seconds: Math.ceil(remaining / 1000),
    skip: finish,
  };
}
