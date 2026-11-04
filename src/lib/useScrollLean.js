import { useCallback, useEffect, useRef } from 'react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import { scrollLeanTarget, stepScrollLean } from './scrollPhysics';

// Cards on a scrolled shelf lean into their own inertia - scroll left and
// they swing left, as if the row were a physical surface sliding out from
// under them. Same critically-damped spring shape as useCardTilt, but a
// single channel (angle) driven by scrollLeft velocity instead of pointer
// position, and the target itself decays back to flat each frame rather
// than being reset on pointer-leave: the lean is a momentary kick from
// scrolling, not a state the shelf holds.
//
// Writes a `--lean` custom property onto the scroll container itself so any
// descendant can read `rotate(var(--lean, 0deg))` - nothing here assumes
// what's inside the shelf.
export default function useScrollLean(scrollRef) {
  const reducedMotion = useReducedMotion();
  const frameRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  const previousTimeRef = useRef(0);
  const stateRef = useRef({ angle: 0, velocity: 0 });
  const targetRef = useRef(0);
  const lastScrollLeftRef = useRef(0);

  const write = useCallback(() => {
    scrollRef.current?.style.setProperty('--lean', `${stateRef.current.angle.toFixed(2)}deg`);
  }, [scrollRef]);

  const animate = useCallback(() => {
    if (frameRef.current) return;
    if (reducedMotion) {
      stateRef.current = { angle: 0, velocity: 0 };
      targetRef.current = 0;
      write();
      return;
    }
    previousTimeRef.current = performance.now();
    const tick = (now) => {
      const dt = (now - previousTimeRef.current) / 1000;
      previousTimeRef.current = now;
      const next = stepScrollLean(stateRef.current, targetRef.current, dt);
      const state = stateRef.current;
      state.angle = next.angle;
      state.velocity = next.velocity;
      targetRef.current = next.target;
      write();
      const settled = Math.abs(targetRef.current - state.angle) < 0.01 && Math.abs(state.velocity) < 0.02;
      if (settled) {
        state.angle = 0;
        state.velocity = 0;
        targetRef.current = 0;
        write();
        frameRef.current = 0;
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [write, reducedMotion]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    lastScrollLeftRef.current = el.scrollLeft;
    lastScrollTimeRef.current = performance.now();
    const onScroll = () => {
      const delta = el.scrollLeft - lastScrollLeftRef.current;
      lastScrollLeftRef.current = el.scrollLeft;
      const now = performance.now();
      targetRef.current = scrollLeanTarget(delta, now - lastScrollTimeRef.current);
      lastScrollTimeRef.current = now;
      animate();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      stateRef.current = { angle: 0, velocity: 0 };
      targetRef.current = 0;
      write();
    };
  }, [scrollRef, animate, write]);
}
