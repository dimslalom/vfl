// The 2.5D board, built up in slices in the lab before it replaces the Pixi
// board. No table: the map is the ground, the lanes are card-cut panels raised
// off it, and cards, chips and the hand float above with real depth and
// shadows. The score bar stays flat page text pinned to points in the scene,
// because type on a tilted surface blurs and the numbers are the game.
//
// Slice 3: a real round, dealt exactly as the live board deals it, with the
// real PlayerCards as slabs. Drag a hand card onto a lane, tap a card to pick
// it (white outline), reveal to flip the enemy's hidden cards.

import {
  CanvasTexture, CylinderGeometry, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, Scene, Shape, ShapeGeometry,
  SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { gsap } from 'gsap';
import { LANE_CAP, bestPlacement, laneScore } from '../engine/board/board.js';
import { dealSeries, pickSeriesMaps, roundBoard } from '../prototype/boardSetup.js';
import { mulberry32 } from '../../shared/src/engine/perfectRun.js';
import { STAT_KEYS, STAT_LABELS, STAT_LABELS_FULL } from '../../shared/src/data/statFields.js';
import { getCardSpecialties } from '../../shared/src/data/specialties.js';
import { assetPath, cardTextColor, thumbnailSrc } from '../../shared/src/lib/utils.js';

export const IMAGE_ASPECT = 16 / 9;
export const CARD_W = 0.82;
export const CARD_H = CARD_W * (580 / 400);
export const CARD_T = 0.025;
export const LANE_W = 3.3;
export const LANE_D = 4.5;
export const LANE_GAP = 0.3;
export const LANE_X = [-(LANE_W + LANE_GAP), 0, LANE_W + LANE_GAP];
export const ROW_Z = { them: -1.3, you: 1.3 };
export const HAND_Z = 3.75;
export const FOV = 28;
const TARGET = new Vector3(0, 0, 0.35);
const TAP = 6;
export const PX = 400;          // the PlayerCard's native size, drawn at 1.5x for a sharp face
export const PY = 580;
export const ART_SCALE = 1.5;
const FONT = '"Familjen Grotesk", system-ui, sans-serif';
export const COLOR = { you: '#00c8a0', youInk: '#032019', foe: '#ff4655', foeInk: '#ffffff', gold: '#d8b34c', bg: '#0d0f17' };

// Pitch is the camera's angle above the board, in degrees.
export const CAMERAS = {
  top: { label: 'Top-down', pitch: 74 },
  tilt: { label: 'Tilted', pitch: 56 },
  low: { label: 'Low', pitch: 40 },
};

// ── shapes ────────────────────────────────────────────────────────────────

// The card's outline, shared by cards (at card size) and lanes (stretched long):
// a rectangle with a shallow point at each end, rising 40 over a 200 half-width.
export function cutShape(w, h, tip) {
  const hw = w / 2;
  const hh = h / 2;
  const shape = new Shape();
  [[-hw, hh - tip], [0, hh], [hw, hh - tip], [hw, -hh + tip], [0, -hh], [-hw, -hh + tip]]
    .forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  return shape;
}

export const LANE_TIP = (LANE_W / 2) * 0.2;
export const LANE_LEN = LANE_D + LANE_TIP * 2;
export const CARD_TIP = CARD_H * (40 / 580);

export function slab(shape, depth) {
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);    // shape y runs to the far end; the extrusion becomes height
  return geometry;
}

// ── art ───────────────────────────────────────────────────────────────────

const images = new Map();
export function loadImage(src) {
  if (!images.has(src)) {
    images.set(src, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return images.get(src);
}

export const cardArt = card => [
  assetPath(`/assets/card-bg/${card.palette}-bg.png`),
  assetPath(`/assets/stat-bg/${card.palette}-stat-bg.png`),
  assetPath(thumbnailSrc(card) ?? card.photo),
];

function hexPath(ctx) {
  ctx.beginPath();
  [[0, 40], [PX / 2, 0], [PX, 40], [PX, PY - 40], [PX / 2, PY], [0, PY - 40]].forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  ctx.closePath();
}

const SPEC_PATHS = {
  flex: { stroke: ['M4.4 8A6 6 0 0 1 15.6 6.6', 'M15.6 3.2v3.6H12', 'M15.6 12A6 6 0 0 1 4.4 13.4', 'M4.4 16.8v-3.6H8'] },
  flick: { stroke: ['M15.4 10A5.4 5.4 0 1 1 4.6 10A5.4 5.4 0 1 1 15.4 10', 'M10 1.2v3.2M10 15.6v3.2M1.2 10h3.2M15.6 10h3.2'], dot: [10, 10, 1.2] },
  one_trick: { fill: 'M11.4 1.6 4.4 11h4.3l-1.3 7.4 8-9.9h-4.7z' },
  mastermind: { fill: 'M2.6 6.4 6 9.6l4-5.8 4 5.8 3.4-3.2-1.2 9.4H3.8z', stroke: ['M2.6 6.4 6 9.6l4-5.8 4 5.8 3.4-3.2-1.2 9.4H3.8zM3.4 17.4h13.2'], strokeW: 0.9 },
  aura: { dot: [10, 10, 1.9], stroke: ['M5 14a6 6 0 0 1 0-8', 'M15 6a6 6 0 0 1 0-8', 'M2.6 16.4a10 10 0 0 1 0-12.8', 'M17.4 3.6a10 10 0 0 1 0 12.8'] },
};

function drawSpecialtyCrest(ctx, spec, cx, top, ink) {
  const icon = SPEC_PATHS[spec.key];
  const size = 34;
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (icon && typeof Path2D !== 'undefined') {
    ctx.save();
    ctx.translate(cx - size / 2, top);
    ctx.scale(size / 20, size / 20);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = icon.strokeW ?? 1.7;
    if (icon.fill) ctx.fill(new Path2D(icon.fill));
    if (icon.stroke) icon.stroke.forEach(d => ctx.stroke(new Path2D(d)));
    if (icon.dot) {
      ctx.beginPath();
      ctx.arc(icon.dot[0], icon.dot[1], icon.dot[2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(spec.code ?? spec.name.slice(0, 3).toUpperCase(), cx, top + size + 2);
  ctx.restore();
}

// The real PlayerCard, layer for layer as the board draws it: background, photo,
// stat panel, rating, role, name, the five stats; the counted one as a dark
// strip with a gold number, cut by the card's own outline; the IGL band along the top.
// focus: the counted stat alone, big, across the bottom; for cards drawn small.
export function drawCard(ctx, card, art, { stat = null, side = 'you', igl = false, focus = false } = {}) {
  const [bg, statBg, photo] = art;
  const ink = cardTextColor(card.palette);
  ctx.save();
  ctx.setTransform(ART_SCALE, 0, 0, ART_SCALE, 0, 0);
  ctx.clearRect(0, 0, PX, PY);
  hexPath(ctx);
  ctx.clip();
  if (bg) ctx.drawImage(bg, 0, 0, PX, PY);
  if (photo) ctx.drawImage(photo, 0, 0, PX, 412);
  if (statBg) ctx.drawImage(statBg, 0, 0, PX, PY);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 68px ${FONT}`;
  ctx.fillText(String(card.rating), 68, 58);
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(card.role.slice(0, 3).toUpperCase(), 68, 130);
  getCardSpecialties(card).slice(0, 2).forEach((spec, index) => {
    drawSpecialtyCrest(ctx, spec, PX - 56, 58 + index * 66, ink);
  });
  ctx.textBaseline = 'bottom';
  ctx.font = `700 46px ${FONT}`;
  if (focus && stat) {
    ctx.fillText(card.player, PX / 2, 396);
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 404, PX, PY - 404);
    ctx.fillStyle = COLOR.gold;
    ctx.font = `600 26px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(STAT_LABELS[stat], PX / 2, 414);
    ctx.font = `800 132px ${FONT}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(card.stats[stat]), PX / 2, PY - 16);
  }
  if (!(focus && stat)) ctx.fillText(card.player, PX / 2, PY - 118);
  ctx.textBaseline = 'top';
  if (!(focus && stat)) STAT_KEYS.forEach((key, index) => {
    const x = 56 + index * 72;
    const on = key === stat;
    if (on) {
      ctx.fillStyle = COLOR.bg;
      ctx.fillRect(x - 37, 462, 74, PY - 462);
    }
    ctx.fillStyle = on ? COLOR.gold : ink;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(STAT_LABELS[key], x, PY - 104);
    ctx.font = `700 ${on ? 48 : 38}px ${FONT}`;
    ctx.fillText(String(card.stats[key]), x, on ? PY - 80 : PY - 76);
  });
  if (igl) {
    ctx.fillStyle = side === 'you' ? COLOR.you : COLOR.foe;
    ctx.beginPath();
    [[0, 40], [PX / 2, 0], [PX, 40], [PX, 82], [PX / 2, 42], [0, 82]].forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
    ctx.fill();
    ctx.fillStyle = side === 'you' ? COLOR.youInk : COLOR.foeInk;
    ctx.font = `700 22px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('IGL', PX / 2, 25);
  }
  ctx.restore();
}

export function backTexture() {
  const el = document.createElement('canvas');
  el.width = 200;
  el.height = 290;
  const ctx = el.getContext('2d');
  ctx.scale(0.5, 0.5);
  // Enemy red, edge to edge, with a dark inset: drawn small it still reads as
  // a card of theirs, not a dark smudge.
  hexPath(ctx);
  ctx.fillStyle = COLOR.foe;
  ctx.fill();
  ctx.save();
  ctx.translate(PX * 0.09, PY * 0.07);
  ctx.scale(0.82, 0.86);
  hexPath(ctx);
  ctx.fillStyle = '#1e2435';
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = COLOR.foe;
  ctx.font = `800 240px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Turned over, as the backs always lie, so it reads upright.
  ctx.translate(PX / 2, PY / 2);
  ctx.rotate(Math.PI);
  ctx.fillText('?', 0, 0);
  const map = new CanvasTexture(el);
  map.colorSpace = SRGBColorSpace;
  return map;
}

// A lane header drawn for the scene: the letter, its callout, and the gold stat
// tab with a pointed foot, on a transparent panel that floats above the lane.
export function headerTexture(info) {
  const stat = STAT_LABELS_FULL[info.stat].toUpperCase();
  const el = document.createElement('canvas');
  el.width = 640;
  el.height = 400;
  const ctx = el.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ece8e1';
  ctx.font = `800 150px ${FONT}`;
  ctx.fillText(info.name.toUpperCase(), 320, 160);
  ctx.fillStyle = '#9aa0ae';
  ctx.font = `700 44px ${FONT}`;
  ctx.letterSpacing = '10px';
  ctx.fillText(info.label.toUpperCase(), 325, 222);
  ctx.letterSpacing = '4px';
  ctx.font = `800 54px ${FONT}`;
  const w = ctx.measureText(stat).width + 72;
  const x0 = 320 - w / 2;
  const y0 = 252;
  const h = 96;
  ctx.fillStyle = COLOR.gold;
  ctx.beginPath();
  [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h * 0.76], [320, y0 + h], [x0, y0 + h * 0.76]].forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#211b06';
  ctx.fillText(stat, 322, y0 + 60);
  const map = new CanvasTexture(el);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

// ── the scene ─────────────────────────────────────────────────────────────

export default class TableBlockout {
  constructor(host, overlay, { reducedMotion = false, onChange, seed = 1 } = {}) {
    this.host = host;
    this.overlay = overlay;
    this.reducedMotion = reducedMotion;
    this.onChange = onChange;
    this.seed = seed;
    this.view = 'tilt';
    this.cards = [];
    this.selected = null;
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.dragPlane = new Plane(new Vector3(0, 1, 0), -0.35);
    this.dirty = true;
    this.mark = () => { this.dirty = true; };
    this.tick = (time, deltaMs) => {
      this.step(Math.min(0.05, (deltaMs || 16) / 1000));
      this.render();
    };
    this.hoverLane = null;
  }

  async init() {
    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return false;
    }
    const { renderer } = this;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.host.appendChild(renderer.domElement);
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(FOV, 1, 1, 80);
    this.scene.add(new HemisphereLight(0xffffff, 0x20232c, 1.5));
    const sun = new DirectionalLight(0xffffff, 1.5);
    sun.position.set(-3, 9, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();
    this.bind();
    gsap.ticker.add(this.tick);
    await this.deal(this.seed);
    return true;
  }

  // ── dealing ──────────────────────────────────────────────────────────────

  // The same round the live board would deal from this seed: squads, map,
  // lanes, the enemy's tactic and where the enemy plays.
  async deal(seed) {
    this.seed = seed;
    const series = dealSeries(seed, 3);
    const map = pickSeriesMaps(seed, 3)[0];
    const game = roundBoard({ seed, round: 0, map, you: series.you, them: series.them, tactics: series.tactics });
    this.game = game;
    this.oppPlan = bestPlacement({ roster: game.them, maps: game.maps, tactic: game.opponentTactic, rng: mulberry32(game.seed + 1) });
    const roster = [...game.you, ...game.them];
    const arts = await Promise.all(roster.map(card => Promise.all(cardArt(card).map(loadImage))));
    this.clear();
    this.build(map, arts);
  }

  clear() {
    if (!this.board) return;
    this.scene.remove(this.board);
    this.board.traverse((node) => {
      node.geometry?.dispose();
      [].concat(node.material ?? []).forEach((material) => { material.map?.dispose(); material.dispose(); });
    });
    this.overlay.replaceChildren();
    this.cards = [];
    this.selected = null;
  }

  build(map, arts) {
    const board = new Group();
    this.board = board;
    this.scene.add(board);
    const ground = new Mesh(new PlaneGeometry(40, 30), new MeshStandardMaterial({ color: 0x1a1d25, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    board.add(ground);

    // Lanes: card-cut panels lifted off the dark ground. The map shows only through
    // them, one image across all three. It is sized to cover the lanes, points
    // included, and cropped at the sides rather than stretched at the edges.
    const side = new MeshStandardMaterial({ color: 0x14161d, roughness: 0.9 });
    const span = LANE_W * 3 + LANE_GAP * 2;
    const imageW = Math.max(span, LANE_LEN * IMAGE_ASPECT) * 1.02;
    const imageD = imageW / IMAGE_ASPECT;
    const art = new TextureLoader().load(assetPath(map.image), () => this.mark());
    art.colorSpace = SRGBColorSpace;
    art.anisotropy = 8;
    this.lanes = LANE_X.map((x) => {
      // The extruded top takes its texture coordinates from the shape, in board units.
      const tex = art.clone();
      tex.repeat.set(1 / imageW, 1 / imageD);
      tex.offset.set((x + imageW / 2) / imageW, 0.5);
      // Dimmed like the 2D board, so cards and numbers sit on top of it.
      const top = new MeshStandardMaterial({ map: tex, color: 0x8c8c8c, roughness: 0.95 });
      const lane = new Mesh(slab(cutShape(LANE_W, LANE_LEN, LANE_TIP), 0.08), [top, side]);
      lane.userData.top = top;
      lane.position.set(x, -0.08, 0);
      lane.receiveShadow = true;
      lane.castShadow = true;
      board.add(lane);
      return lane;
    });

    // Cards: a slab cut to the card's outline, the real face on top, a plain back
    // underneath, and a white outline under it all for the picked one.
    const cardShape = cutShape(CARD_W, CARD_H, CARD_TIP);
    const ringShape = cutShape(CARD_W + 0.09, CARD_H + 0.09, CARD_TIP + 0.01);
    const edge = new MeshStandardMaterial({ color: 0x2a2e39, roughness: 0.7 });
    const backMat = new MeshStandardMaterial({ map: backTexture(), roughness: 0.8 });
    backMat.map.repeat.set(1 / CARD_W, 1 / CARD_H);
    backMat.map.offset.set(0.5, 0.5);
    const { you, them } = this.game;
    const roster = [...you.map((card, i) => ({ card, side: 'you', i })), ...them.map((card, i) => ({ card, side: 'them', i }))];
    roster.forEach(({ card, side: who, i }, n) => {
      const el = document.createElement('canvas');
      el.width = PX * ART_SCALE;
      el.height = PY * ART_SCALE;
      const map = new CanvasTexture(el);
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 8;
      map.repeat.set(1 / CARD_W, 1 / CARD_H);
      map.offset.set(0.5, 0.5);
      const group = new Group();
      const body = new Mesh(slab(cardShape, CARD_T), edge);
      body.position.y = -CARD_T / 2;
      const face = new Mesh(new ShapeGeometry(cardShape), new MeshStandardMaterial({ map, roughness: 0.55 }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = CARD_T / 2 + 0.001;
      const back = new Mesh(new ShapeGeometry(cardShape), backMat);
      back.rotation.x = Math.PI / 2;
      back.position.y = -CARD_T / 2 - 0.001;
      const outline = new Mesh(new ShapeGeometry(ringShape), new MeshBasicMaterial({ color: 0xffffff }));
      outline.rotation.x = -Math.PI / 2;
      outline.position.y = -CARD_T / 2 - 0.004;
      outline.visible = false;
      group.add(body, face, back, outline);
      body.castShadow = true;
      const entry = {
        card, side: who, i, group, outline, canvas: el, map, art: arts[n], drawn: undefined,
        lane: who === 'them' && i < 2 ? this.oppPlan.slots[i] : null,
        hidden: who === 'them' && i >= 2,
      };
      for (const mesh of [body, face, back]) mesh.userData.entry = entry;
      board.add(group);
      this.cards.push(entry);
    });

    // The chip stack beside the hand: the real 3D chips replace these in slice 4.
    const chips = new Group();
    for (let i = 0; i < 3; i++) {
      const chip = new Mesh(new CylinderGeometry(0.32, 0.32, 0.07, 48), new MeshStandardMaterial({ color: i === 1 ? 0xd8b34c : 0xb8bcc6, roughness: 0.6 }));
      chip.position.set(Math.sin(i * 2.1) * 0.03, 0.04 + i * 0.075, Math.cos(i * 2.1) * 0.03);
      chip.castShadow = true;
      chips.add(chip);
    }
    chips.position.set(LANE_X[2] + LANE_W / 2 + 0.4, 0.25, HAND_Z);
    board.add(chips);

    // Headers float above each lane's far end, turned to face the camera.
    this.heads = this.game.maps.map((info, lane) => {
      const head = new Mesh(new PlaneGeometry(2.2, 1.375), new MeshBasicMaterial({ map: headerTexture(info), transparent: true, toneMapped: false }));
      head.position.set(LANE_X[lane], 1.05, -LANE_D / 2 + 0.1);
      board.add(head);
      return head;
    });
    this.labels = this.game.maps.map(() => {
      const bar = document.createElement('div');
      bar.dataset.role = 'bar';
      bar.innerHTML = '<div data-row="them"></div><div data-tug><i data-side="you"></i><i data-side="them"></i><b data-side="you"></b><b data-side="them"></b><s></s></div><div data-row="you"></div>';
      this.overlay.append(bar);
      return { bar };
    });
    this.fit();
    this.place(true);
  }

  mine() { return this.cards.filter(card => card.side === 'you'); }
  theirs() { return this.cards.filter(card => card.side === 'them'); }

  // Redraws a face only when what it shows has changed: the stat a lane counts.
  // A card not yet on a lane previews the stat of the lane you're pointing at,
  // or the one it's held over, so you can compare before you drop it.
  paint(entry) {
    const previewLane = entry === this.drag?.card ? this.hot : entry.lane == null && entry.side === 'you' ? this.hoverLane : null;
    const lane = entry.lane ?? previewLane;
    const stat = lane == null || entry.hidden ? null : this.game.maps[lane].stat;
    if (entry.drawn === stat) return;
    entry.drawn = stat;
    drawCard(entry.canvas.getContext('2d'), entry.card, entry.art, { stat, side: entry.side, igl: entry.i === 0 });
    entry.map.needsUpdate = true;
  }

  // Where each card rests: on its lane in its side's row, in the hand, or waiting face down.
  spot(card) {
    if (card.lane != null) {
      const row = this.cards.filter(c => c.side === card.side && c.lane === card.lane);
      const k = row.indexOf(card);
      const x = LANE_X[card.lane] + (k - (row.length - 1) / 2) * (CARD_W + 0.05);
      return { x, y: 0.02, z: ROW_Z[card.side], rx: 0, rz: card.hidden ? Math.PI : 0 };
    }
    const pool = this.cards.filter(c => c.side === card.side && c.lane == null);
    const k = pool.indexOf(card);
    const off = k - (pool.length - 1) / 2;
    if (card.side === 'you') {
      // The hand floats nearest the camera, tilted up to face it, fanned a little.
      return { x: off * (CARD_W + 0.12), y: 0.45 + (card === this.selected ? 0.18 : 0), z: HAND_Z, rx: 0.75, rz: 0, ry: -off * 0.05 };
    }
    // The enemy's hidden cards wait face down beside the far corner of lane C.
    return { x: LANE_X[2] + LANE_W / 2 + 0.62, y: 0.06 + k * 0.03, z: -1.9 + k * 0.42, rx: 0, rz: Math.PI, ry: 0.08, s: 0.62 };
  }

  place(instant = false) {
    for (const card of this.cards) {
      this.paint(card);
      if (card === this.drag?.card) continue;
      const to = this.spot(card);
      card.outline.visible = card === this.selected;
      const d = instant || this.reducedMotion ? 0 : 0.35;
      const { group } = card;
      const s = to.s ?? 1;
      const moved = card.landed !== `${card.lane}:${card.hidden}`;
      card.landed = `${card.lane}:${card.hidden}`;
      if (!d) {
        group.position.set(to.x, to.y, to.z);
        group.rotation.set(to.rx, to.ry ?? 0, to.rz);
        group.scale.setScalar(s);
        continue;
      }
      // A card going somewhere new travels in a low arc and settles; one only
      // shuffling along its row or hand glides there.
      const time = moved ? 0.5 : d;
      gsap.to(group.position, { x: to.x, z: to.z, duration: time, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
      if (moved && card.lane != null) {
        gsap.to(group.position, {
          keyframes: [{ y: Math.max(group.position.y, to.y) + 0.35, duration: time * 0.4, ease: 'power2.out' }, { y: to.y, duration: time * 0.6, ease: 'back.out(2)' }],
          onUpdate: this.mark,
          overwrite: 'auto',
        });
      } else {
        gsap.to(group.position, { y: to.y, duration: time, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
      }
      gsap.to(group.rotation, { x: to.rx, y: to.ry ?? 0, z: to.rz, duration: moved ? 0.55 : d, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
      gsap.to(group.scale, { x: s, y: s, z: s, duration: time, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
    }
    this.mark();
    this.emit();
  }

  // The lane being pointed at: it brightens, and your hand previews its stat.
  setHover(lane) {
    if (lane === this.hoverLane) return;
    this.hoverLane = lane;
    this.tintLanes();
    this.mine().filter(c => c.lane == null).forEach(c => this.paint(c));
    this.mark();
  }

  // The lane a held card is over: it brightens, and the card previews its stat.
  setHot(lane) {
    if (lane === this.hot) return;
    this.hot = lane;
    this.tintLanes();
    if (this.drag) this.paint(this.drag.card);
    this.mark();
  }

  tintLanes() {
    const lit = this.hot ?? this.hoverLane;
    this.lanes?.forEach((lane, i) => lane.userData.top.color.setHex(i === lit ? 0xc8c8c8 : 0x8c8c8c));
  }

  // Every frame while a card is held: it eases toward the pointer, leans into its
  // sideways speed and tips with its forward speed, like a card in a hand.
  step(dt) {
    const drag = this.drag;
    if (!drag?.target) return;
    const { group } = drag.card;
    const follow = 1 - Math.exp(-dt * 16);
    const px = group.position.x;
    const pz = group.position.z;
    group.position.x += (drag.target.x - px) * follow;
    group.position.z += (drag.target.z - pz) * follow;
    group.position.y += (0.6 - group.position.y) * follow;
    const settle = 1 - Math.exp(-dt * 10);
    drag.vx += ((group.position.x - px) / dt - drag.vx) * settle;
    drag.vz += ((group.position.z - pz) / dt - drag.vz) * settle;
    const lean = Math.max(-0.4, Math.min(0.4, -drag.vx * 0.06));
    const tilt = Math.max(-0.3, Math.min(0.3, drag.vz * 0.04));
    group.rotation.x += (0.25 + tilt - group.rotation.x) * settle;
    group.rotation.y += (0 - group.rotation.y) * settle;
    group.rotation.z += (lean - group.rotation.z) * settle;
    this.mark();
  }

  // Real lane scores from the board engine. The enemy's stay hidden until the reveal.
  scores(lane) {
    const map = this.game.maps[lane];
    const on = side => this.cards.filter(c => c.side === side && c.lane === lane && !c.hidden).map(c => c.card);
    const mine = laneScore(on('you'), map);
    const hiddenLeft = this.cards.some(c => c.side === 'them' && c.hidden);
    const tactic = this.oppPlan.tactic?.lane === lane ? this.oppPlan.tactic.card : null;
    const theirs = hiddenLeft ? null : laneScore(on('them'), map, tactic);
    return { mine, theirs };
  }

  reveal() {
    this.theirs().forEach((card) => {
      if (!card.hidden) return;
      card.hidden = false;
      card.lane = this.oppPlan.slots[card.i];
    });
    this.place();
  }

  reset() {
    return this.deal(this.seed);
  }

  setView(view) {
    this.view = view;
    this.fit(true);
    this.emit();
  }

  emit() {
    this.onChange?.({
      view: this.view,
      seed: this.seed,
      map: this.game?.mapName,
      placed: this.mine().filter(c => c.lane != null).length,
      hidden: this.theirs().filter(c => c.hidden).length,
    });
  }

  // ── input ────────────────────────────────────────────────────────────────

  ray(event) {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  hit(event) {
    this.ray(event);
    const [first] = this.raycaster.intersectObjects(this.mine().map(c => c.group), true);
    return first?.object.userData.entry ?? null;
  }

  laneUnder(point) {
    const lane = LANE_X.findIndex(x => Math.abs(point.x - x) <= LANE_W / 2);
    return lane >= 0 && Math.abs(point.z) <= LANE_D / 2 ? lane : null;
  }

  bind() {
    const el = this.renderer.domElement;
    this.onDown = (event) => {
      const card = this.hit(event);
      this.press = card ? { card, x: event.clientX, y: event.clientY } : null;
    };
    this.onMove = (event) => {
      const press = this.press;
      if (press && !this.drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP) {
        this.drag = { card: press.card, target: null, vx: 0, vz: 0, lean: 0, tilt: 0 };
        const { group } = press.card;
        gsap.killTweensOf(group.position);
        gsap.killTweensOf(group.rotation);
        gsap.to(group.scale, { x: 1.06, y: 1.06, z: 1.06, duration: 0.2, ease: 'power2.out', onUpdate: this.mark, overwrite: 'auto' });
        this.selected = null;
        this.setHover(null);
        this.place();
      }
      this.ray(event);
      const point = new Vector3();
      const onBoard = this.raycaster.ray.intersectPlane(this.dragPlane, point);
      if (this.drag) {
        if (!onBoard) return;
        // step() eases the card toward this point every frame.
        this.drag.target = point;
        this.setHot(this.laneUnder(point));
      } else if (event.pointerType !== 'touch') {
        this.setHover(onBoard ? this.laneUnder(point) : null);
      }
      el.style.cursor = this.drag ? 'grabbing' : this.hit(event) ? 'grab' : '';
    };
    this.onUp = (event) => {
      const press = this.press;
      this.press = null;
      if (this.drag) {
        const { card } = this.drag;
        this.drag = null;
        const full = this.hot != null && this.cards.filter(c => c.side === 'you' && c.lane === this.hot && c !== card).length >= LANE_CAP;
        card.lane = this.hot != null && !full ? this.hot : null;
        this.setHot(null);
        this.place();
        return;
      }
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= TAP) {
        this.selected = this.selected === press.card ? null : press.card;
        this.place();
      }
    };
    this.el = el;
    el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  // ── view ─────────────────────────────────────────────────────────────────

  // Backs off until the whole board, floating headers to hand, fits the screen.
  shot() {
    const pitch = (CAMERAS[this.view].pitch * Math.PI) / 180;
    const tanV = Math.tan((FOV / 360) * Math.PI);
    const halfW = (LANE_W * 3 + LANE_GAP * 2) / 2 + 1.2;   // room for the chips beside the hand
    const halfD = (HAND_Z + LANE_D / 2 + 1.4) / 2 + 0.9;   // the headers stand above the far edge
    const depthOnScreen = halfD * Math.sin(pitch) + 0.6;
    const d = Math.max(halfW / (tanV * this.camera.aspect), depthOnScreen / tanV) * 1.05;
    return { d, pitch };
  }

  fit(animate = false) {
    const to = this.shot();
    this.cam ??= { ...to };
    const apply = () => {
      const { d, pitch } = this.cam;
      this.camera.position.set(TARGET.x, TARGET.y + Math.sin(pitch) * d, TARGET.z + Math.cos(pitch) * d);
      this.camera.lookAt(TARGET);
      // The floating headers turn with the camera, so they always face you.
      this.heads?.forEach(head => head.quaternion.copy(this.camera.quaternion));
      this.mark();
    };
    gsap.killTweensOf(this.cam);
    if (animate && !this.reducedMotion) gsap.to(this.cam, { ...to, duration: 0.6, ease: 'power3.inOut', onUpdate: apply });
    else {
      Object.assign(this.cam, to);
      apply();
    }
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  toScreen(x, y, z) {
    const v = new Vector3(x, y, z).project(this.camera);
    return [((v.x + 1) / 2) * this.host.clientWidth, ((1 - v.y) / 2) * this.host.clientHeight];
  }

  // Pins the flat score bars to their lanes, every frame the scene moves. Each
  // bar is built from the score's own steps: one segment per player, then the
  // bonuses, then a tactic's share, ending where its side's fill ends.
  pinLabels() {
    if (!this.labels) return;
    const laneW = Math.abs(this.toScreen(LANE_W / 2, 0, 0)[0] - this.toScreen(-LANE_W / 2, 0, 0)[0]);
    this.labels.forEach(({ bar }, lane) => {
      const [bx, by] = this.toScreen(LANE_X[lane], 0.02, 0);
      bar.style.width = `${laneW * 0.9}px`;
      bar.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
      const { mine, theirs } = this.scores(lane);
      const you = mine.total;
      const them = theirs?.total ?? null;
      const share = them == null ? (you ? 0.8 : 0.5) : you + them ? you / (you + them) : 0.5;
      const [themRow, tug, youRow] = bar.children;
      const [youFill, themFill, youN, themN, split] = tug.children;
      youFill.style.width = you ? `${share * 100}%` : '0';
      themFill.style.width = them ? `${(1 - share) * 100}%` : '0';
      youN.textContent = you;
      themN.textContent = them ?? '?';
      split.style.left = `${share * 100}%`;
      split.hidden = them == null || !you;
      this.segments(youRow, mine.steps, you ? share : 0, 0);
      this.segments(themRow, theirs?.steps ?? [], them ? 1 - share : 0, them ? share : 1);
    });
  }

  segments(row, steps, width, from) {
    row.style.width = `${width * 100}%`;
    row.style.marginLeft = `${from * 100}%`;
    const players = steps.filter(step => step.key === 'player');
    const bonus = steps.filter(step => step.op === '+' && step.key !== 'player').reduce((sum, step) => sum + step.value, 0);
    const base = players.reduce((sum, step) => sum + step.value, 0) + bonus;
    const tactic = steps.find(step => step.key === 'tactic');
    const extra = tactic ? Math.max(0, tactic.total - base) : 0;
    const items = [
      ...players.map(step => ({ value: step.value, text: String(step.value) })),
      ...(bonus ? [{ value: bonus, text: `+${bonus}`, solid: true }] : []),
      ...(extra ? [{ value: extra, text: `×${tactic.value}`, outline: true }] : []),
    ];
    const key = items.map(item => item.text).join();
    if (row.dataset.key === key) return;
    row.dataset.key = key;
    row.replaceChildren(...items.map((item) => {
      const seg = document.createElement('span');
      seg.style.flex = `${item.value} 1 0`;
      seg.textContent = item.text;
      if (item.solid) seg.dataset.solid = '';
      if (item.outline) seg.dataset.outline = '';
      return seg;
    }));
  }

  render() {
    if (!this.dirty || !this.renderer) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.pinLabels();
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.observer?.disconnect();
    this.el?.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.clear();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
