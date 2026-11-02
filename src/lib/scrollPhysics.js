// Use time and velocity, not frames/event counts, so a shelf feels the same
// on a 60 Hz mouse wheel and a 120 Hz trackpad.
const MAX_LEAN = 6;
const DECAY = -Math.log(0.9) * 60;

export function scrollLeanTarget(deltaPx, elapsedMs) {
  const velocity = deltaPx / Math.max(8, elapsedMs) * 1000;
  return Math.max(-MAX_LEAN, Math.min(MAX_LEAN, velocity * 0.012));
}

export function stepScrollLean(state, target, elapsedSeconds) {
  // Small integration steps also keep long frames from kicking the spring.
  const elapsed = Math.min(Math.max(0, elapsedSeconds), 0.1);
  const steps = Math.max(1, Math.ceil(elapsed / (1 / 240)));
  const dt = elapsed / steps;
  let { angle, velocity } = state;
  for (let i = 0; i < steps; i += 1) {
    velocity += (220 * (target - angle) - 26 * velocity) * dt;
    angle += velocity * dt;
    target *= Math.exp(-DECAY * dt);
  }
  return { angle, velocity, target };
}
