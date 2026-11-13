import { mulberry32 } from '../../../shared/src/engine/perfectRun.js';

function polygon(points) {
  return `M${points.map(point => point.map(value => Math.round(value * 10) / 10).join(' ')).join('L')}Z`;
}

function polar(angle, radius, x = 50, y = 50) {
  return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
}

function radial(count, rotation, radiusAt) {
  return Array.from({ length: count }, (_, index) =>
    polar(rotation + index * 2 * Math.PI / count, radiusAt(index)));
}

function mirror(half) {
  return [...half, ...half.toReversed().map(([x, y]) => [100 - x, y])];
}

function diamond(x, y, width, height, skew = 0) {
  return polygon([[x + skew, y - height], [x + width, y], [x - skew, y + height], [x - width, y]]);
}

function facets(range, dense) {
  const count = dense ? range(7, 11) : range(3, 6);
  const angle = range(0, 359) * Math.PI / 180;
  const radius = range(37, 45);
  const depth = range(dense ? 23 : 17, dense ? 34 : 28);
  const outer = radial(count * 2, angle, index => index % 2 ? depth : radius + range(-5, 3));
  const inner = radial(count, angle + Math.PI / count, () => range(10, 15));
  const accent = polygon([outer[0], outer[1], inner[0], outer.at(-1)]);
  return { outline: polygon(outer) + polygon(inner), accent };
}

function wolf(range) {
  const ear = range(9, 20);
  const brow = range(30, 39);
  const cheek = range(14, 26);
  const jaw = range(34, 44);
  const eye = polygon([[cheek + 4, 44], [44, 51], [brow, 60]]);
  const rightEye = polygon([[96 - cheek, 44], [56, 51], [100 - brow, 60]]);
  return {
    outline: polygon(mirror([[ear, range(7, 19)], [brow, range(22, 33)], [45, 23],
      [cheek, range(55, 65)], [jaw, range(77, 85)], [48, range(85, 93)]])) + eye + rightEye,
    accent: diamond(50, 70, range(8, 13), range(6, 10)),
  };
}

function wings(range) {
  const tips = range(2, 4);
  const rise = range(14, 28);
  const span = range(22, 35);
  const wing = [[50 - span, rise], [44, 33], [48, 53]];
  for (let index = 0; index < tips; index++) {
    const offset = index * (31 / tips);
    wing.push([40 - offset * 0.38, 65 - offset], [35 - offset, 71 - offset * 0.65]);
  }
  return {
    outline: polygon(wing) + polygon(wing.map(([x, y]) => [100 - x, y])),
    accent: diamond(50, 72, range(8, 13), range(11, 19)),
  };
}

function crescent(range) {
  const radius = range(34, 43);
  const arc = range(215, 267) * Math.PI / 180;
  const angle = range(154, 206) * Math.PI / 180;
  const start = polar(angle + arc / 2, radius);
  const end = polar(angle - arc / 2, radius);
  const point = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return {
    outline: `M${point(start)}A${radius} ${radius} 0 1 0 ${point(end)}Q${range(18, 39)} 50 ${point(start)}Z`,
    accent: diamond(range(67, 76), range(37, 62), range(7, 12), range(8, 14)),
  };
}

function bolt(range) {
  const slant = range(10, 27);
  const height = range(76, 90);
  const split = range(38, 50);
  return {
    outline: polygon([[50 + slant, 100 - height], [range(13, 23), split + 12],
      [49, split + 12], [39, height], [range(77, 89), split], [57, split]]),
    accent: diamond(range(14, 23), range(23, 31), 8, 5, 4),
  };
}

function flame(range) {
  const tip = range(43, 63);
  const base = range(77, 89);
  return {
    outline: polygon([[tip, range(8, 18)], [67, range(27, 42)], [75, 30], [range(82, 91), 59],
      [72, base], [50, 94], [25, base], [range(10, 19), 62], [33, range(24, 39)], [36, 51]]) +
      polygon([[50, range(47, 56)], [62, 68], [50, 80], [38, 68]]),
    accent: diamond(50, 68, 6, 8),
  };
}

function ribbons(range, wave) {
  const span = range(32, 41);
  const thickness = range(8, 15);
  const angle = range(-42, -15) * Math.PI / 180;
  const count = range(3, 5);
  const points = Array.from({ length: count }, (_, index) => {
    const fraction = index / (count - 1);
    const x = (fraction * 2 - 1) * span;
    const y = Math.sin(fraction * Math.PI) * range(10, 22);
    return [x, y];
  });
  const ribbon = [...points, ...points.toReversed().map(([x, y]) => [x, y + thickness])];
  const rotate = ([x, y]) => [50 + x * Math.cos(angle) - y * Math.sin(angle),
    50 + x * Math.sin(angle) + y * Math.cos(angle)];
  return {
    outline: polygon(ribbon.map(rotate)) + polygon(ribbon.map(([x, y]) => rotate(wave ? [x, y - 25] : [-x, -y]))),
    accent: diamond(50, wave ? 66 : 50, range(6, 10), range(6, 10)),
  };
}

const composeMotif = {
  wolf,
  moon: crescent,
  ice: range => facets(range, true),
  wing: wings,
  flame,
  storm: bolt,
  wave: range => ribbons(range, true),
  orbit: range => ribbons(range, false),
};

function shield(range, center) {
  const shoulder = range(8, 17);
  const bevel = range(14, 26);
  const drop = range(57, 72);
  const crown = range(6, 18);
  const frame = polygon(mirror([[50, crown], [shoulder + bevel, crown + 3], [shoulder, crown + 17],
    [shoulder + 5, drop], [34, range(77, 86)], [50, 95]]));
  // The inset is expressed in the same coordinate space as the outer edge.
  const inset = polygon(mirror([[50, crown + 7], [shoulder + bevel + 1, crown + 10],
    [shoulder + 8, crown + 20], [shoulder + 12, drop - 3], [37, 77], [50, 87]]));
  return { outline: frame + inset, accent: center.outline, insetAccent: true };
}

function monogram(range) {
  const slant = range(6, 20);
  const bevel = range(7, 18);
  const left = range(7, 14);
  const top = range(19, 28);
  const outline = polygon([[left, top + slant], [85 - bevel, top], [92, top + bevel],
    [90, 73 - slant], [left + bevel, 89], [left, 89 - bevel]]);
  return {
    outline,
    accent: polygon([[69, top + 4], [85 - bevel / 2, top + 2], [90, top + bevel], [77, top + bevel]]),
    lettering: { x: 49, y: 51 + slant / 5, size: 32 },
  };
}

export function crestGeometry({ seed, layout, motif }) {
  const random = mulberry32(seed);
  const range = (min, max) => min + Math.floor(random() * (max - min + 1));

  if (layout === 'monogram') return monogram(range);
  if (layout === 'abstract') return facets(range, false);
  const compose = (Object.hasOwn(composeMotif, motif) ? composeMotif[motif] : null) ?? (layout === 'orbit' ? composeMotif.orbit : null);
  const mark = compose ? compose(range) : range(0, 1) ? ribbons(range, false) : facets(range, true);
  return layout === 'shield' ? shield(range, mark) : mark;
}
