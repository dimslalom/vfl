// Draws a pack's front and back on canvases, so a new pack type costs no download.
// Each side makes up to four images that line up exactly:
//   color   what you see
//   orm     the foil mask: green is roughness, blue is metalness (three.js reads them there)
//   normal  crimped seals, the back fin seam and glitter flakes, as surface bumps
//   holo    where the holographic film sits: red is strength, green its thickness
// The layout is drawn once per image with a different palette, which is what keeps
// the print, the matte areas, the shine and the film registered to each other.

import { assetPath } from '../../shared/src/lib/utils';

export const ART_W = 768;
export const ART_H = 1086;                 // the model's 1 by 1.415 proportion
const SEAL = Math.round(ART_H * 0.0424);   // matches SEAL in tools/pack3d/build_pack.py
const TEAR = Math.round(ART_H * 0.0622);   // matches TEAR_FROM_TOP
const FONT = '"Familjen Grotesk", system-ui, sans-serif';

// The squad stands on the very bottom edge, through the crimp. Centre-focused: the star in front and biggest,
// the middle pair beside, the back pair half off the left and right edges.
// Each spot is [centre x, height] in art pixels, drawn back to front.
const FLOOR = ART_H;
const SQUAD_SPOTS = [[-10, 560], [ART_W + 10, 560], [172, 650], [ART_W - 172, 650], [ART_W / 2, 760]];

// In the foil mask, the base is shiny metal, printed ink is matte and the cover art sits between.
const MASK = {
  base: 'rgb(0, 66, 255)',
  deep: 'rgb(0, 80, 255)',
  seal: 'rgb(0, 110, 230)',
  ink: 'rgb(0, 215, 0)',
  art: 'rgb(0, 150, 70)',
  flake: 'rgb(0, 18, 255)',
};
// In the holo map only the bare foil carries film; anything printed blocks it.
// Full-bleed art still carries some film, so the Icons cover shimmers too.
const HOLO = { base: null, deep: null, seal: null, ink: '#000', art: 'rgb(150, 128, 0)', flake: null };

function canvas() {
  const el = document.createElement('canvas');
  el.width = ART_W;
  el.height = ART_H;
  return el;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Photos load once and are decoded before use. A failed load is retried once and
// never remembered, so one bad moment cannot leave a player missing for good.
const images = new Map();
function fetchImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
    img.onerror = () => resolve(null);
    img.src = assetPath(src);
  });
}
function loadImage(src) {
  if (!images.has(src)) {
    images.set(src, (async () => {
      const img = (await fetchImage(src)) ?? (await fetchImage(src));
      if (!img) images.delete(src);
      return img;
    })());
  }
  return images.get(src);
}

// Greyscale with contrast, done on the pixels once per image. Canvas filters are avoided:
// browsers can silently skip filtered drawing when graphics memory runs low.
const graded = new Map();
function grade(img, contrast, brightness) {
  const key = `${img.src}:${contrast}:${brightness}`;
  if (graded.has(key)) return graded.get(key);
  const el = document.createElement('canvas');
  el.width = img.naturalWidth;
  el.height = img.naturalHeight;
  const ctx = el.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, el.width, el.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const grey = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * brightness;
    const value = Math.max(0, Math.min(255, (grey - 128) * contrast + 128));
    d[i] = value;
    d[i + 1] = value;
    d[i + 2] = value;
  }
  ctx.putImageData(pixels, 0, 0);
  graded.set(key, el);
  return el;
}

// The card's own hexagon (card-mask.svg), so the pack echoes the cards inside.
function hexagon(ctx, cx, cy, w, fresh = true) {
  const h = w * 1.45;
  const tip = h * 0.069;
  if (fresh) ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2 + tip);
  ctx.lineTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy - h / 2 + tip);
  ctx.lineTo(cx + w / 2, cy + h / 2 - tip);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy + h / 2 - tip);
  ctx.closePath();
}

function text(ctx, value, x, y, { size, weight = 800, color, align = 'left', track = 0 }) {
  if (!color) return;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${track}px`;
  ctx.fillText(value, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function fill(ctx, color, draw) {
  if (!color) return;
  ctx.fillStyle = color;
  draw();
}

function seals(ctx, c) {
  fill(ctx, c.seal, () => {
    ctx.fillRect(0, 0, ART_W, SEAL);
    ctx.fillRect(0, ART_H - SEAL, ART_W, SEAL);
  });
}

// On the front the art runs through the seals; only the crimp ridges show on top.
function crimps(ctx, mode) {
  if (mode !== 'color') return;
  ctx.save();
  for (let x = 0; x < ART_W; x += 7) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(x, 0, 2, SEAL);
    ctx.fillRect(x, ART_H - SEAL, 2, SEAL);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(x + 3, 0, 1, SEAL);
    ctx.fillRect(x + 3, ART_H - SEAL, 1, SEAL);
  }
  ctx.restore();
}

function tearLine(ctx, c) {
  fill(ctx, c.ink, () => {
    for (let x = 40; x < ART_W - 40; x += 22) ctx.fillRect(x, TEAR - 1, 12, 2);
    // Notches at both edges, where a real pack starts its tear.
    for (const edge of [0, ART_W]) {
      const dir = edge === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(edge, TEAR - 9);
      ctx.lineTo(edge + dir * 14, TEAR);
      ctx.lineTo(edge, TEAR + 9);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function coverImage(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth ?? img.width;
  const ih = img.naturalHeight ?? img.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// A cut-out painted one flat colour, for the masks.
const tints = new Map();
function tinted(img, color) {
  const key = `${img.src}:${color}`;
  if (tints.has(key)) return tints.get(key);
  const el = document.createElement('canvas');
  el.width = img.naturalWidth;
  el.height = img.naturalHeight;
  const ctx = el.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, el.width, el.height);
  tints.set(key, el);
  return el;
}

// Fills for silhouette squads, drawn across the whole front so the texture runs
// continuously from one player to the next.
const fills = new Map();
function fillTexture(style, ink, map) {
  const key = `${style}:${ink}:${map?.src ?? ''}`;
  if (fills.has(key)) return fills.get(key);
  const el = canvas();
  const ctx = el.getContext('2d');
  // A solid tone under the texture, so a silhouette reads as one shape, not a ghost.
  if (style !== 'map') {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ink;
  if (style === 'dots') {
    for (let y = 0; y < ART_H; y += 6) {
      ctx.beginPath();
      const offset = (y / 6) % 2 ? 3 : 0;
      for (let x = offset; x < ART_W; x += 6) {
        ctx.moveTo(x + 2.7, y);
        ctx.arc(x, y, 2.7, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  } else if (style === 'lines') {
    ctx.save();
    ctx.translate(ART_W / 2, ART_H / 2);
    ctx.rotate(-Math.PI / 4);
    for (let x = -ART_H; x < ART_H; x += 8) ctx.fillRect(x, -ART_H, 4, ART_H * 2);
    ctx.restore();
  } else if (style === 'map' && map) {
    coverImage(ctx, grade(map, 1.5, 0.9), 0, 0, ART_W, ART_H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, 0, ART_W, ART_H);
  }
  fills.set(key, el);
  return el;
}

// A player as a flat silhouette filled with texture, ringed in the pack colour so
// overlapping players still read as separate people.
const layer = { el: null };
function silhouette(ctx, img, x, y, w, h, fillEl, ring) {
  layer.el ??= canvas();
  const l = layer.el.getContext('2d');
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, ART_W, ART_H);
  l.drawImage(img, x, y, w, h);
  l.globalCompositeOperation = 'source-in';
  l.drawImage(fillEl, 0, 0);
  const halo = tinted(img, ring);
  for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    ctx.drawImage(halo, x + dx, y + dy, w, h);
  }
  ctx.drawImage(layer.el, 0, 0);
}

function squad(ctx, art, c, mode, poster, style = 'map') {
  art.squad.forEach((member, i) => {
    const img = member.img;
    const spot = SQUAD_SPOTS[i];
    if (!img || !spot) return;
    const [cx, h] = spot;
    const w = h * (img.naturalWidth / img.naturalHeight);
    const x = cx - w / 2;
    const y = FLOOR - h;
    if (mode === 'color' && style !== 'photo') {
      silhouette(ctx, img, x, y, w, h, fillTexture(style, c.ink, art.map), c.base);
    } else if (mode === 'color') {
      ctx.save();
      // The poster prints the squad in black ink straight onto the foil.
      if (poster) ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(poster ? grade(img, 1.45, 1.08) : img, x, y, w, h);
      ctx.restore();
    } else if (c.art) {
      ctx.drawImage(tinted(img, c.art), x, y, w, h);
    }
  });
}

// A halftone screen over the print, which also hides how small the source photos are.
function halftone(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  const step = 7;
  for (let y = 0; y < ART_H; y += step) {
    ctx.beginPath();
    const offset = (y / step) % 2 ? step / 2 : 0;
    for (let x = offset; x < ART_W; x += step) {
      ctx.moveTo(x + 1.5, y);
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

// The biggest size at which the name still fits the width.
function fitted(ctx, value, maxWidth, maxSize) {
  ctx.font = `800 100px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '-6px';
  const width = ctx.measureText(value).width;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return Math.min(maxSize, Math.floor((maxWidth / width) * 100));
}

// Silver and gold: a halftone poster. The name sits huge behind the squad's heads.
function poster(ctx, type, c, art, mode) {
  const name = type.title.toUpperCase();
  const size = fitted(ctx, name, ART_W - 40, 300);
  text(ctx, name, ART_W / 2, 470, { size, color: c.ink, align: 'center', track: -6 });
  if (art) squad(ctx, art, c, mode, true, type.squadStyle);
  if (mode === 'color') halftone(ctx);
  crimps(ctx, mode);
  tearLine(ctx, c);
  text(ctx, 'VFL', ART_W / 2, TEAR + 76, { size: 40, color: c.ink, align: 'center', track: 1 });
}

// Icons: the art runs to every edge, with the name centred at the top.
function fullBleed(ctx, type, c, art, mode) {
  if (art?.map && mode === 'color') {
    ctx.save();
    coverImage(ctx, grade(art.map, 1.2, 1.1), 0, 0, ART_W, ART_H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = c.cover ?? c.deep;
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.restore();
  } else fill(ctx, c.art, () => ctx.fillRect(0, 0, ART_W, ART_H));
  if (art) squad(ctx, art, c, mode, false, type.squadStyle);
  crimps(ctx, mode);
  tearLine(ctx, c);
  const name = type.title.toUpperCase();
  text(ctx, name, ART_W / 2, TEAR + 170, { size: fitted(ctx, name, ART_W - 160, 170), color: c.ink, align: 'center', track: -6 });
  text(ctx, 'VFL', ART_W / 2, ART_H - SEAL - 34, { size: 40, color: c.ink, align: 'center', track: 1 });
}

function front(ctx, type, c, art, mode) {
  (type.front === 'fullbleed' ? fullBleed : poster)(ctx, type, c, art, mode);
}

function back(ctx, type, c) {
  const cx = ART_W / 2;
  seals(ctx, c);
  tearLine(ctx, c);
  // The fin seam runs down the middle of the back, as on a real flow-wrapped pack.
  fill(ctx, c.deep, () => ctx.fillRect(cx - 22, SEAL, 44, ART_H - SEAL * 2));

  if (c.ink) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = c.ink;
    hexagon(ctx, 130, 210, 110);
    ctx.stroke();
  }
  text(ctx, 'VFL', 220, 232, { size: 48, color: c.ink });

  // The back reads like a real product label; the front stays for showing.
  text(ctx, 'CONTAINS', 52, 400, { size: 18, weight: 700, color: c.ink, track: 4 });
  text(ctx, '5 player cards', 52, 452, { size: 44, color: c.ink });
  text(ctx, type.rule, 52, 498, { size: 26, weight: 600, color: c.ink });
  const lines = ['Pick one card from each pack.', 'Tear along the line to open.', 'Every card is a real VCT player.'];
  lines.forEach((line, i) => text(ctx, line, 52, 600 + i * 38, { size: 22, weight: 500, color: c.ink }));

  // A barcode block: thin bars, then the pack code.
  if (c.ink) {
    let x = 52;
    const random = mulberry(type.code.charCodeAt(0) * 97 + type.code.charCodeAt(2));
    ctx.fillStyle = c.ink;
    while (x < 290) {
      const w = 2 + Math.floor(random() * 4);
      ctx.fillRect(x, ART_H - SEAL - 150, w, 92);
      x += w + 2 + Math.floor(random() * 4);
    }
  }
  text(ctx, `VFL-PK-${type.code}`, 52, ART_H - SEAL - 30, { size: 18, weight: 700, color: c.ink, track: 3 });
}

// Glitter: tiny flakes, each tipped a different way, so they flash as the pack turns.
function flakes(type) {
  const count = Math.round(type.effects.glitter * 9000);
  const random = mulberry(type.code.charCodeAt(1) * 7919);
  return Array.from({ length: count }, () => ({
    x: Math.floor(random() * ART_W),
    y: Math.floor(random() * ART_H),
    nx: Math.floor(40 + random() * 176),
    ny: Math.floor(40 + random() * 176),
    size: random() > 0.8 ? 3 : 2,
  }));
}

// Brushed metal: fine streaks that catch the light as the pack turns.
function brushed(ctx, type) {
  const random = mulberry(type.id.length * 131 + 7);
  for (let i = 0; i < 1400; i += 1) {
    const y = random() * ART_H;
    ctx.globalAlpha = 0.012 + random() * 0.025;
    ctx.fillStyle = random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(0, y, ART_W, 1);
  }
  ctx.globalAlpha = 1;
}

function layout(side) {
  return side === 'front' ? front : back;
}

// Serrated crimp edges, cut out of the colour image's alpha. The material drops
// anything transparent, so the pack's silhouette gets real teeth at top and bottom.
const TEETH = 54;
const TOOTH_DEPTH = 13;
function serrate(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const step = ART_W / TEETH;
  for (const [edge, dir] of [[0, 1], [ART_H, -1]]) {
    ctx.beginPath();
    ctx.moveTo(0, edge);
    for (let i = 0; i < TEETH; i += 1) {
      ctx.lineTo(i * step + step / 2, edge + dir * TOOTH_DEPTH);
      ctx.lineTo((i + 1) * step, edge);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawColor(type, side, art) {
  const el = canvas();
  const ctx = el.getContext('2d');
  ctx.fillStyle = type.palette.base;
  ctx.fillRect(0, 0, ART_W, ART_H);
  brushed(ctx, type);
  layout(side)(ctx, type, type.palette, art, 'color');
  serrate(ctx);
  return el;
}

function drawMask(type, side, art, glitter) {
  const el = canvas();
  const ctx = el.getContext('2d');
  ctx.fillStyle = MASK.base;
  ctx.fillRect(0, 0, ART_W, ART_H);
  ctx.fillStyle = MASK.flake;
  for (const f of glitter) ctx.fillRect(f.x, f.y, f.size, f.size);
  layout(side)(ctx, type, MASK, art, 'mask');
  return el;
}

function drawNormal(side, glitter) {
  const el = canvas();
  const ctx = el.getContext('2d');
  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, ART_W, ART_H);
  for (const f of glitter) {
    ctx.fillStyle = `rgb(${f.nx}, ${f.ny}, 210)`;
    ctx.fillRect(f.x, f.y, f.size, f.size);
  }
  const period = 7;
  for (let x = 0; x < ART_W; x += 1) {
    const tilt = Math.round(128 + 90 * Math.cos((x / period) * Math.PI * 2));
    ctx.fillStyle = `rgb(${tilt}, 128, 235)`;
    ctx.fillRect(x, 0, 1, SEAL);
    ctx.fillRect(x, ART_H - SEAL, 1, SEAL);
  }
  if (side === 'back') {
    for (let y = SEAL; y < ART_H - SEAL; y += 1) {
      const tilt = Math.round(128 + 70 * Math.cos((y / period) * Math.PI * 2));
      ctx.fillStyle = `rgb(128, ${tilt}, 235)`;
      ctx.fillRect(ART_W / 2 - 22, y, 44, 1);
    }
  }
  return el;
}

// Holographic film laid in fine diagonal lines, its thickness drifting across the
// pack, so the rainbow comes from the viewing angle instead of an animation.
function drawHolo(type, side, art) {
  const el = canvas();
  const ctx = el.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ART_W, ART_H);
  ctx.save();
  ctx.translate(ART_W / 2, ART_H / 2);
  ctx.rotate(-0.6);
  for (let x = -ART_H; x < ART_H; x += 5) {
    const thickness = Math.round(128 + 110 * Math.sin(x / 90));
    ctx.fillStyle = `rgb(255, ${thickness}, 0)`;
    ctx.fillRect(x, -ART_H, 4, ART_H * 2);
  }
  ctx.restore();
  layout(side)(ctx, type, HOLO, art, 'mask');
  return el;
}

// Loads the cover. Any photo that still fails is swapped for a reserve player,
// so a cover always shows its full squad.
async function loadCover(art) {
  if (!art) return null;
  const candidates = [...art.squad, ...(art.reserves ?? [])];
  const [map, ...photos] = await Promise.all([
    loadImage(`/assets/maps/${art.map}.webp`),
    ...candidates.map(member => loadImage(member.photo)),
  ]);
  const squad = candidates
    .map((member, i) => ({ ...member, img: photos[i] }))
    .filter(member => member.img)
    .slice(0, art.squad.length);
  return { ...art, map, squad };
}

const cache = new Map();

/** Every image for one side of one pack. The front also depends on its cover. */
export async function packArt(type, side, art = null) {
  const key = `${type.id}:${type.squadStyle ?? 'map'}:${side}:${side === 'front' ? art?.seed ?? 'plain' : ''}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      await document.fonts?.load(`800 100px ${FONT}`).catch(() => null);
      const loaded = side === 'front' ? await loadCover(art) : null;
      const glitter = flakes(type);
      return {
        color: drawColor(type, side, loaded),
        orm: drawMask(type, side, loaded, glitter),
        normal: drawNormal(side, glitter),
        holo: type.effects.holo ? drawHolo(type, side, loaded) : null,
      };
    })());
    // Covers are per pack and each holds several large images, so keep only a few.
    if (cache.size > 8) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}
