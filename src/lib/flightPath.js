// A single continuous arc: the lift peaks halfway without creating a stop
// or a direction change between independently eased keyframe segments.
export function flightPose(t, { x, y, arc, scaleTo, rotate }) {
  return {
    x: x * t,
    y: y * t + 4 * arc * t * (1 - t),
    scale: 1 + (scaleTo - 1) * t,
    rotate: rotate * t,
  };
}
