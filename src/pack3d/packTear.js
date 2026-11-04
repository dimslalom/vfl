// The shapes a pack goes through as it is torn open, as plain vertex maths.
//
// The strip above the tear line peels like real foil: the torn part rolls up around
// a short vertical crease that travels along the tear line, then lifts away from it.
// Once the strip is off, the bag's mouth bows open into an eye shape, because its
// long sides stay sealed. Everything here works from the model's resting positions,
// so any moment of the tear can be drawn again from scratch.

export const WIDTH = 1;
export const HALF_W = 0.5;
export const HALF_H = 0.7075;
export const TEAR_Y = HALF_H - 0.088;   // matches TEAR_FROM_TOP in tools/pack3d/build_pack.py

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Where the crease sits for a tear `progress` (0..1) going in `dir` (+1 left to right). */
export function hingeX(progress, dir) {
  return dir > 0 ? -HALF_W + progress * WIDTH : HALF_W - progress * WIDTH;
}

/**
 * Bends the strip into `out` from its resting positions `base`.
 * curl: { progress, dir, radius, roll, lift, lean, flutter, time }
 *   radius  how tight the foil rolls at the crease, in model units
 *   roll    how far it folds back over, in radians (pi lies flat on the strip, inside out)
 *   lift    how far the torn part swings up from the tear line, in radians
 *   lean    how far the crease leans ahead of the tear at the top, in radians
 *   flutter a ripple along the free end while it is in the air (0 to 1)
 */
export function curlStrip(base, out, curl) {
  const { dir, radius, roll, lift, lean = 0.3, flutter = 0, time = 0 } = curl;
  const hinge = hingeX(curl.progress, dir);
  const stress = 0.01 * Math.min(1, curl.progress * 4);
  // The crease runs up from the tear front, leaning ahead of it: e along it, n into the torn part.
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  const ex = dir * s;
  const ey = c;
  const nx = -dir * c;
  const ny = s;
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i];
    const y = base[i + 1];
    const w = base[i + 2];
    const px = x - hinge;
    const py = y - TEAR_Y;
    // Behind the tear front everything is torn; ahead of it only what the leaning crease takes.
    const d = Math.max(px * nx + py * ny, dir * (hinge - x) > 0 ? 0 : -1);
    const q = px * ex + py * ey;
    // The foil puckers up a little either side of the crease, the way a real tear does.
    const pucker = stress * Math.exp(-Math.abs(d) / 0.03);
    if (d <= 0) {
      out[i] = x;
      out[i + 1] = y;
      out[i + 2] = w + pucker;
      continue;
    }
    // Roll around the crease towards the viewer, then run straight along the tangent.
    const theta = Math.min(d / radius, roll);
    const run = d - theta * radius;
    let a = radius * Math.sin(theta) + run * Math.cos(theta);
    let b = radius * (1 - Math.cos(theta)) + run * Math.sin(theta);
    a -= Math.sin(theta) * w;
    b += Math.cos(theta) * w + pucker;
    if (flutter) b += flutter * 0.022 * d * Math.sin(d * 13 - time * 17);
    const rx = q * ex + a * nx;
    const ry = q * ey + a * ny;
    // Swing the torn part up about the tear front, easing in so the crease stays a bend.
    const angle = -dir * lift * smooth(0, 0.16, d);
    out[i] = hinge + rx * Math.cos(angle) - ry * Math.sin(angle);
    out[i + 1] = TEAR_Y + rx * Math.sin(angle) + ry * Math.cos(angle);
    out[i + 2] = b;
  }
}

/** Bows the bag's mouth open: `side` is +1 for the front sheet, -1 for the back. */
export function openMouth(base, out, side, open) {
  const depth = 0.085 * open;
  const reach = 0.34;
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i];
    const y = base[i + 1];
    const k = smooth(TEAR_Y - reach, TEAR_Y + 0.02, y) ** 1.4;
    const across = 1 - (Math.abs(x) / HALF_W) ** 4;   // the sealed sides stay shut
    out[i] = x;
    out[i + 1] = y - 0.012 * open * k * across;
    out[i + 2] = base[i + 2] + side * depth * k * across;
  }
}
