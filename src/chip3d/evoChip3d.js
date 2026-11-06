// The evo chip in 3D, built for the same shared renderer and lighting as the
// tactic chips (ChipStack.makeChip hands evo faces here). A bevelled hexagon
// with real thickness, the evo's motif enamelled on the face, its skill crest
// raised in the middle, and a metal bezel that follows the card frames: one
// matte rule for common, a bright double rule for rare, a thick gold bezel with
// a crest, rubies and a running light for apex.
import {
  CanvasTexture, Color, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, NoColorSpace, Path, Shape, ShapeGeometry,
  SphereGeometry, SRGBColorSpace,
} from 'three';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import SpecialtyIcon from '../../shared/src/components/SpecialtyIcon';
import { EVO_ART, evoFace } from '../../shared/src/components/evoArt';

const BEVEL = 0.05;
// A pointy-top hexagon is narrower than a circle; this makes it read the same size as the round chips.
const SIZE = 1.12;
const TEX = 1024;                 // face canvas; the hexagon's corners touch its edge
const HALF = TEX / 2;

const corners = r => Array.from({ length: 6 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 3;
  return [Math.cos(a) * r, -Math.sin(a) * r];
});
function hexShape(r, hole) {
  const s = new Shape();
  corners(r).forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  if (hole) {
    const p = new Path();
    corners(hole).reverse().forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    s.holes.push(p);
  }
  return s;
}
const diamond = (x, y, w, h) => {
  const s = new Shape();
  s.moveTo(x, y + h); s.lineTo(x + w, y); s.lineTo(x, y - h); s.lineTo(x - w, y); s.closePath();
  return s;
};

/** A flat-shaped solid lying in the chip's face plane, from y0 up by depth. */
function slab(shape, depth, bevel = 0.012) {
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

const loadImg = src => new Promise(resolve => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});
const svgUri = svg => `data:image/svg+xml,${encodeURIComponent(svg)}`;

// The specialty icon as SVG markup, rendered once per skill off screen.
const icons = new Map();
function iconSvg(spec) {
  if (!icons.has(spec)) {
    const div = document.createElement('div');
    const root = createRoot(div);
    flushSync(() => root.render(createElement(SpecialtyIcon, { spec, size: 100 })));
    icons.set(spec, div.innerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
    root.unmount();
  }
  return icons.get(spec);
}

function canvas() {
  const el = document.createElement('canvas');
  el.width = TEX;
  el.height = TEX;
  return [el, el.getContext('2d')];
}
function hexPath(ctx, r) {
  ctx.beginPath();
  corners(r).forEach(([x, y], i) => (i ? ctx.lineTo(HALF + x * HALF, HALF - y * HALF) : ctx.moveTo(HALF + x * HALF, HALF - y * HALF)));
  ctx.closePath();
}
function asTexture(el, data) {
  const t = new CanvasTexture(el);
  t.colorSpace = data ? NoColorSpace : SRGBColorSpace;
  t.anisotropy = 8;
  // Extruded caps take UVs from x,y in shape units (-1..1); map those onto the canvas.
  t.repeat.set(0.5, 0.5);
  t.offset.set(0.5, 0.5);
  return t;
}

// Where the card art sits under the hexagon: the motif, not the stat floor.
const MOTIF = { x: -0.15, y: -0.235, w: 2.3, h: 3.335 };

async function paintFace(info, art, maps, grain) {
  const tinted = color => loadImg(svgUri(iconSvg(info.evo.skill).replaceAll('currentColor', color)));
  const [motif, inkIcon, reliefIcon, roughIcon] = await Promise.all([
    loadImg(svgUri(evoFace(info.evo.theme, 2).back)), tinted(art.metal[1]), tinted('#e6e6e6'), tinted('#3a3a3a'),
  ]);
  const icon = { [art.metal[1]]: inkIcon, '#e6e6e6': reliefIcon, '#3a3a3a': roughIcon };
  // The crest: icon over code. A tight halo in `halo` keeps it readable on the motif.
  const crest = (ctx, color, halo) => {
    const paint = () => {
      if (icon[color]) ctx.drawImage(icon[color], HALF - 125, 330, 250, 250);
      ctx.fillStyle = color;
      ctx.fillText(info.evo.badge, HALF, 660);
    };
    ctx.font = '700 96px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (halo) {
      ctx.save();
      ctx.shadowColor = halo;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        ctx.shadowOffsetX = dx * 7; ctx.shadowOffsetY = dy * 7;
        paint();
      }
      ctx.restore();
    }
    paint();
  };
  const motifAt = ctx => motif && ctx.drawImage(motif, MOTIF.x * HALF, MOTIF.y * HALF, MOTIF.w * HALF, MOTIF.h * HALF);

  // Colour: enamelled motif, crest on top.
  {
    const [el, ctx] = canvas();
    ctx.fillStyle = art.bg[1];
    ctx.fillRect(0, 0, TEX, TEX);
    ctx.save(); hexPath(ctx, 1); ctx.clip(); motifAt(ctx); ctx.restore();
    crest(ctx, art.metal[1], art.floor);
    maps.color = asTexture(el);
  }
  // Relief: the motif's lines faintly raised, the crest pressed up out of the enamel.
  {
    const [el, ctx] = canvas();
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, TEX, TEX);
    ctx.save(); hexPath(ctx, 1); ctx.clip(); ctx.globalAlpha = 0.35; ctx.filter = 'grayscale(1) contrast(.6)'; motifAt(ctx); ctx.restore();
    ctx.filter = 'none';
    crest(ctx, '#e6e6e6', '#9a9a9a');
    grain(ctx, TEX, TEX, 10);
    maps.relief = asTexture(el, true);
  }
  // Roughness: glossy enamel. A rough face spreads the room's light into an even
  // haze that greys the colour out; a smooth one gathers it into highlights.
  {
    const [el, ctx] = canvas();
    ctx.fillStyle = '#5c5c5c';
    ctx.fillRect(0, 0, TEX, TEX);
    crest(ctx, '#3a3a3a');
    grain(ctx, TEX, TEX, 26);
    maps.rough = asTexture(el, true);
  }
}

const METAL = {
  common: art => ({ color: art.metal[0], roughness: 0.42, clearcoat: 0.2 }),
  rare: art => ({ color: art.metal[0], roughness: 0.24, clearcoat: 0.5 }),
  apex: () => ({ color: '#e2ab4c', roughness: 0.2, clearcoat: 0.6 }),
};

/** Same contract as ChipStack.makeChip; `helpers` passes its thickness and grain. */
export function makeEvoChip(info, index, { THICK, grain }) {
  const art = EVO_ART[info.evo.theme];
  const tier = art.tier;
  const metal = new MeshPhysicalMaterial({ ...METAL[tier](art), metalness: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.25 });
  const dark = new MeshPhysicalMaterial({ color: new Color(METAL[tier](art).color).multiplyScalar(0.55), metalness: 1, roughness: 0.45, envMapIntensity: 1 });
  const faceMat = new MeshPhysicalMaterial({
    color: '#ffffff', roughness: 1, metalness: 0, bumpScale: 0.6,
    specularIntensity: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.12, envMapIntensity: 0.35,
  });
  const maps = {};
  let disposed = false;
  const disposeMaps = () => Object.values(maps).forEach(map => map.dispose());
  const ready = paintFace(info, art, maps, grain).then(() => {
    if (disposed) {
      disposeMaps();
      return;
    }
    Object.assign(faceMat, { map: maps.color, bumpMap: maps.relief, roughnessMap: maps.rough });
    faceMat.needsUpdate = true;
  });

  const group = new Group();
  const core = THICK - BEVEL * 2;
  const bodyGeo = new ExtrudeGeometry(hexShape(1), { depth: core, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 5, curveSegments: 4 });
  bodyGeo.translate(0, 0, -core / 2);
  bodyGeo.rotateX(-Math.PI / 2);
  const body = new Mesh(bodyGeo, [faceMat, dark]);
  const geos = [bodyGeo];
  const meshes = [body];
  const add = (geo, mat, y, flip = false) => {
    geos.push(geo);
    const m = new Mesh(geo, mat);
    m.position.y = y;
    if (flip) m.rotation.x = Math.PI;
    meshes.push(m);
    return m;
  };
  const top = THICK / 2 - 0.004;
  // Bezel on both faces, so it reads whichever way the chip turns.
  const bezel = tier === 'apex' ? [0.84, 0.055] : tier === 'rare' ? [0.92, 0.035] : [0.94, 0.025];
  const bezelGeo = slab(hexShape(1, bezel[0]), bezel[1]);
  add(bezelGeo, metal, top);
  add(bezelGeo, metal, -top, true);
  if (tier === 'rare') add(slab(hexShape(0.88, 0.86), 0.018, 0.005), metal, top);
  let comet = null;
  if (tier === 'apex') {
    const lip = top + bezel[1] + 0.012;
    add(slab(hexShape(0.8, 0.78), 0.015, 0.004), dark, top);
    const crest = add(slab(diamond(0, 1.02, 0.16, 0.2), 0.08, 0.02), metal, top);
    crest.position.y = top;
    const ruby = new MeshPhysicalMaterial({ color: '#a3071f', roughness: 0.08, metalness: 0, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#3a0008', envMapIntensity: 1.4 });
    for (const x of [-0.8, 0.8]) add(slab(diamond(x, 0, 0.04, 0.1), 0.03, 0.01), ruby, lip - 0.02);
    // A light running round the bezel, as on the Apex card.
    const bead = new SphereGeometry(0.035, 12, 8);
    geos.push(bead);
    comet = [1, 0.7, 0.45, 0.25].map((s, i) => {
      const m = new Mesh(bead, new MeshBasicMaterial({ color: i ? '#ff6a7a' : '#fff4dc', transparent: true, opacity: s, toneMapped: false }));
      m.scale.setScalar(1 - i * 0.18);
      m.position.y = lip;
      group.add(m);
      return m;
    });
  }
  // Selection stroke, like the round chips' white ring.
  const ringGeo = new ShapeGeometry(hexShape(1.14, 1.06));
  ringGeo.rotateX(-Math.PI / 2);
  geos.push(ringGeo);
  const ring = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  ring.position.y = THICK / 2 + 0.003;
  ring.visible = false;

  group.add(...meshes, ring);
  group.scale.setScalar(SIZE);
  for (const mesh of meshes) mesh.userData.chip = index;

  const path = corners(0.92);
  const along = t => {
    const f = ((t % 1) + 1) % 1 * 6, i = Math.floor(f), k = f - i;
    const [ax, ay] = path[i], [bx, by] = path[(i + 1) % 6];
    return [ax + (bx - ax) * k, ay + (by - ay) * k];
  };
  return {
    key: info,
    info,
    group,
    ring,
    faceMat,
    printed: info.headline,
    meshes,
    ready,
    animate: comet && (now => comet.forEach((m, i) => {
      const [x, y] = along(now / 3 - i * 0.012);
      m.position.x = x;
      m.position.z = -y;
    })),
    dispose() {
      disposed = true;
      geos.forEach(geo => geo.dispose());
      disposeMaps();
      comet?.forEach(m => m.material.dispose());
    },
  };
}
