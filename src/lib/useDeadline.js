import { useEffect, useState } from 'react';
import { animate, useMotionValue } from 'motion/react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';

// Server deadlines remain authoritative. Only the second label causes React
// renders; the bar interpolates directly without a CSS transition per sample.
export default function useDeadline(deadlineAt, serverNow, totalMs = 10_000) {
  const reducedMotion = useReducedMotion();
  const initial = Math.max(0, deadlineAt - serverNow);
  const [seconds, setSeconds] = useState(Math.ceil(initial / 1000));
  const progress = useMotionValue(Math.min(1, initial / totalMs));
  useEffect(() => {
    const remaining = Math.max(0, deadlineAt - serverNow);
    const startedAt = performance.now();
    progress.set(Math.min(1, remaining / totalMs));
    const control = reducedMotion ? null : animate(progress, 0, { duration: remaining / 1000, ease: 'linear' });
    let timer;
    const tick = () => {
      const left = Math.max(0, remaining - (performance.now() - startedAt));
      if (reducedMotion) progress.set(Math.min(1, left / totalMs));
      setSeconds(Math.ceil(left / 1000));
      if (left > 0) timer = setTimeout(tick, left % 1000 || 1000);
    };
    timer = setTimeout(tick, 0);
    return () => { control?.stop(); clearTimeout(timer); };
  }, [deadlineAt, serverNow, totalMs, progress, reducedMotion]);
  return { seconds, progress };
}
