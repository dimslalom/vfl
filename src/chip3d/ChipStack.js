// Tactic chips in 3D: a stack of clay poker chips you open, read and drag.
//
// Built in code, no model file: each chip is an open cylinder for the edge plus a
// printed disc on each face, all drawn on canvases. Like the pack, it only redraws
// while something moves.
//
// Closed, the chips sit in one leaning stack. A tap on the stack stands them up in
// a row facing you, so every face (what each tactic rewards) reads at once. A tap
// on a chip lifts it straight up out of the row, and the page shows its payout in
// the gap it leaves. A tap on empty table drops them back onto the stack.
//
// Any chip can also be grabbed, even off the closed stack, and dragged onto the
// board. The page says what is a drop target; a chip dropped there stays pinned
// to that spot on screen however the camera moves, and a tap sends it home.

import {
  ACESFilmicToneMapping, CanvasTexture, CircleGeometry, DirectionalLight, DoubleSide, Group, LatheGeometry, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, Object3D, RingGeometry, PMREMGenerator, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, TorusGeometry, Vector2,
  Vector3, WebGLRenderer,
} from 'three';
import { gsap } from 'gsap';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { playUiSound } from '../../shared/src/lib/gameAudio';
import { CHIP_TIERS, chipInfo } from './chipData';
import { ICON_PATHS } from './chipIcons';
import { chipStyle } from './chipStyle';

// Thick enough that the rim reads from the board's top-down camera.
export const THICK = 0.27;
const BEVEL = 0.06;                         // rounded rim, so the edge catches light
const FACE_R = 1 - BEVEL;
const SPOTS = 8;
const FOV = 30;
const SPACING = 2.35;
const TAP = 6;                              // px of travel before a press becomes a drag
const OPEN_Y = 1.25;                        // height of the open row's centre
const ROW_GAP = 2.3;
const LIFT = 0.35;                          // how far a picked chip rises out of the fan
const VIEW = new Vector3(0, 0.46, 0.89).normalize();
const STAND = Math.PI / 2 - 0.2;            // upright, leaning back toward a camera above
const HELD = 7;                             // a held or placed chip sits this far from the camera,
const HELD_SCALE = 0.5;                     // so it keeps one size on screen wherever it goes
const PLACED_SCALE = 0.34;
const UP = new Vector3(0, 1, 0);

function canvas(w, h) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return [el, el.getContext('2d')];
}

function texture(el) {
  const map = new CanvasTexture(el);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function drawIcon(ctx, name, x, y, size, color) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = color;
  for (const d of ICON_PATHS[name]) ctx.stroke(new Path2D(d));
  ctx.restore();
}

// The printed face: clay rim with edge spots, a dark inlay, what the chip needs
// (as icons or as the role codes the cards print) and the most it pays.
function fitText(ctx, text, font, size, max) {
  ctx.font = `${font.weight} ${size}px ${font.family}`;
  const width = ctx.measureText(text).width;
  if (width > max) ctx.font = `${font.weight} ${Math.floor((size * max) / width)}px ${font.family}`;
}

const SANS = { weight: 700, family: '"Familjen Grotesk", system-ui, sans-serif' };
const MONO = { weight: 700, family: 'ui-monospace, Menlo, monospace' };

export function faceArt(info, face = chipStyle().face) {
  const tone = CHIP_TIERS[info.tier];
  const [el, ctx] = canvas(512, 512);
  ctx.translate(256, 256);
  ctx.fillStyle = tone.body;
  ctx.beginPath();
  ctx.arc(0, 0, 256, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone.spot;
  for (let i = 0; i < SPOTS; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / SPOTS);
    ctx.fillRect(-26, -256, 52, 66);
    ctx.restore();
  }
  ctx.fillStyle = tone.face;
  ctx.beginPath();
  ctx.arc(0, 0, 172, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tone.ink;
  if (face === 'code') {
    fitText(ctx, info.code, MONO, 64, 300);
    ctx.fillText(info.code, 0, -58);
  } else {
    const { icons } = info;
    const size = icons.length > 2 ? 62 : icons.length === 2 ? 84 : 104;
    const step = size * 1.02;
    icons.forEach((name, i) => drawIcon(ctx, name, (i - (icons.length - 1) / 2) * step, -58, size, tone.ink));
  }
  // The most it can pay, big: the one number a player needs before anything else.
  fitText(ctx, info.headline, SANS, 132, 250);
  ctx.fillText(info.headline, 0, 62);
  return texture(el);
}

// The edge: clay with the spots running round it, lined up with the face's spots.
function edgeArt(info) {
  const tone = CHIP_TIERS[info.tier];
  const [el, ctx] = canvas(1024, 32);
  ctx.fillStyle = tone.body;
  ctx.fillRect(0, 0, 1024, 32);
  ctx.fillStyle = tone.spot;
  const step = 1024 / SPOTS;
  for (let i = 0; i < SPOTS; i++) ctx.fillRect(i * step + step * 0.5 - 22, 0, 44, 32);
  return texture(el);
}

function clay(map) {
  // Matte clay with a faint sheen: a glossier coat washes the dark inlay out when
  // a chip stands facing the light.
  return new MeshPhysicalMaterial({ map, roughness: 0.68, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.5 });
}

// The rim as a lathe: flat at the faces, a quarter round into the side and back,
// so the edge shades from lit to dark instead of meeting the face at a hard line.
function rimProfile() {
  const points = [];
  const h = THICK / 2;
  const arc = (cy, from, to) => {
    for (let i = 0; i <= 6; i++) {
      const a = from + ((to - from) * i) / 6;
      points.push(new Vector2(FACE_R + Math.cos(a) * BEVEL, cy + Math.sin(a) * BEVEL));
    }
  };
  arc(-h + BEVEL, -Math.PI / 2, 0);
  arc(h - BEVEL, 0, Math.PI / 2);
  return points;
}

const shared = {};
function geometries() {
  shared.edge ??= new LatheGeometry(rimProfile(), 96);
  shared.face ??= new CircleGeometry(FACE_R, 96);
  shared.ring ??= new RingGeometry(1.03, 1.17, 96);
  // A raised ridge round the inlay on each face: it catches the light face-on.
  shared.ridge ??= new TorusGeometry(FACE_R * 0.7, 0.02, 6, 96);
  return shared;
}

export function makeChip(key, index) {
  const info = chipInfo(key);
  const { edge, face, ridge } = geometries();
  const faceMat = clay(faceArt(info));
  const ridgeMat = new MeshPhysicalMaterial({ color: CHIP_TIERS[info.tier].body, roughness: 0.45, metalness: 0, clearcoat: 0.3, envMapIntensity: 0.8 });
  const group = new Group();
  const side = new Mesh(edge, clay(edgeArt(info)));
  const top = new Mesh(face, faceMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = THICK / 2;
  const bottom = new Mesh(face, faceMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -THICK / 2;
  // The selection stroke: a white ring round the face, the same white the
  // board uses round a picked card. Drawn flat, so it reads as an outline.
  const ring = new Mesh(shared.ring, new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = THICK / 2 + 0.003;
  ring.visible = false;
  const ridges = [1, -1].map((sign) => {
    const mesh = new Mesh(ridge, ridgeMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.scale.z = 0.6;
    mesh.position.y = sign * (THICK / 2 + 0.004);
    return mesh;
  });
  group.add(side, top, bottom, ...ridges, ring);
  for (const mesh of [side, top, bottom, ...ridges]) mesh.userData.chip = index;
  return { key, info, group, ring, faceMat, printed: info.headline, meshes: [side, top, bottom, ...ridges] };
}

/** Reprints a chip's face with a different big number: a placed chip shows what it pays there. */
export function printChip(chip, headline) {
  if (chip.printed === headline) return false;
  chip.printed = headline;
  chip.faceMat.map?.dispose();
  chip.faceMat.map = faceArt({ ...chip.info, headline });
  chip.faceMat.needsUpdate = true;
  return true;
}

// Geometry is shared by every chip; only the printed materials are its own.
export function disposeChip(chip) {
  chip.ring.material.dispose();
  for (const material of new Set(chip.meshes.map(mesh => mesh.material))) {
    material.map?.dispose();
    material.dispose();
  }
}

// A seeded wobble, so the same hand always stacks the same way.
function wobble(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}


export default class ChipStack {
  /**
   * dropTarget(clientX, clientY): the page's board, asked where a dragged chip
   * would land. Return { id, x, y, size? } in client pixels for a spot, or null.
   *
   * On a game board the scene is a see-through layer over the board, so a few
   * more options fit it in:
   * - events: the element whose pointer input it reads first. It only claims
   *   presses that land on a chip, so everything else reaches the board.
   * - anchors(): where the stack sits and where it opens, in host pixels, with
   *   the chip size in pixels: { closed: { x, y, size }, open: { x, y, size } }.
   * - single: one chip on the board at a time; placing one sends the other home.
   * - onPlace(index, spotId): a chip was played to a spot, or taken back (null).
   */
  constructor(host, { reducedMotion = false, onFail, onChange, dropTarget, events = host, anchors = null, single = false, onPlace } = {}) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.onFail = onFail;
    this.onChange = onChange;
    this.dropTarget = dropTarget;
    this.events = events;
    this.anchors = anchors;
    this.single = single;
    this.onPlace = onPlace;
    this.locked = false;
    this.chips = [];
    this.opened = false;
    this.selected = null;
    this.hovered = null;
    this.drag = null;
    this.dirty = true;
    this.visible = true;
    this.pointer = new Vector2();
    this.raycaster = new Raycaster();
    this.aim = new Object3D();
    this.stats = { ms: 0 };
    this.mark = () => { this.dirty = true; };
    this.tick = () => this.render();
  }

  async init() {
    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      this.onFail?.();
      return false;
    }
    const { renderer } = this;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    this.host.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.onFail?.(); });

    this.scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // Far enough back for a board, where small chips put the camera a long way off.
    this.camera = new PerspectiveCamera(FOV, 1, 0.5, 600);
    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(-3, 6, 4);
    this.scene.add(key);
    this.table = new Group();
    this.scene.add(this.table);

    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.visibility = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.mark(); });
    this.visibility.observe(this.host);
    this.bind();
    gsap.ticker.add(this.tick);
    return true;
  }

  // ── chips ────────────────────────────────────────────────────────────────

  setChips(keys) {
    this.killTweens();
    for (const chip of this.chips) {
      this.table.remove(chip.group);
      disposeChip(chip);
    }
    this.opened = false;
    this.selected = null;
    this.hovered = null;
    this.drag = null;
    this.chips = keys.map((key, index) => makeChip(key, index));
    this.chips.forEach((chip) => {
      chip.placed = null;
      this.table.add(chip.group);
    });
    this.fit();
    // Dropped onto the table one at a time, like a hand being counted out. Hover
    // waits until the last one lands, or its lift would fight the drop.
    this.dealing = !this.reducedMotion && this.chips.length > 0;
    this.chips.forEach((chip, index) => {
      const home = this.home(chip);
      chip.group.rotation.set(0, home.ry, 0);
      chip.group.scale.setScalar(1);
      if (this.reducedMotion) {
        chip.group.position.set(home.x, home.y, home.z);
        return;
      }
      chip.group.position.set(home.x, home.y + 2.4, home.z);
      gsap.to(chip.group.position, {
        y: home.y, duration: 0.42, delay: index * 0.09, ease: 'bounce.out', onUpdate: this.mark,
        onStart: () => playUiSound('rattle'),
        onComplete: index === this.chips.length - 1 ? () => { this.dealing = false; } : undefined,
      });
    });
    this.emit();
  }

  // Chips still in your hand, in stack order. Placed chips live on the board.
  hand() {
    return this.chips.filter(chip => !chip.placed);
  }

  home(chip) {
    const order = this.hand().indexOf(chip);
    const seed = chip.group.children[0].userData.chip;
    return {
      x: wobble(seed + 1) * 0.1,
      y: THICK / 2 + Math.max(0, order) * (THICK + 0.006),
      z: wobble(seed + 7) * 0.1,
      ry: wobble(seed + 3) * 1.2,
    };
  }

  // The open layout: one row while it fits the screen, then rows from the top.
  grid() {
    const n = Math.max(1, this.hand().length);
    const open = this.anchors?.().open;
    const fit = open ? Math.floor((this.host.clientWidth * 0.9) / (open.size * (SPACING / 2))) : Math.floor((this.camera?.aspect ?? 1.6) * 3.4);
    const cols = Math.max(1, Math.min(n, fit));
    return { cols, rows: Math.ceil(n / cols) };
  }

  // Where a chip stands when the stack is open. On a board the chips fan out
  // where the stack sat, overlapping like a hand of cards, so they never cross
  // the lanes; the later chip sits in front.
  slot(chip) {
    const hand = this.hand();
    const index = Math.max(0, hand.indexOf(chip));
    const open = this.anchors?.().open;
    if (open) {
      const n = hand.length;
      const reach = ((open.width ?? open.size * 3) / open.size) * 2 - 2;   // in chip radii
      const step = n > 1 ? Math.min(1.25, reach / (n - 1)) : 0;
      const off = index - (n - 1) / 2;
      // A clear depth step between overlapping chips: the camera sits far back
      // on a board, and closer faces flicker through each other (z-fighting).
      return { x: off * step, y: OPEN_Y - Math.abs(off) * 0.08, z: 1 + index * 0.3, rz: -off * 0.1 };
    }
    const { cols, rows } = this.grid();
    const row = Math.floor(index / cols);
    const inRow = row === rows - 1 ? hand.length - row * cols : cols;
    return { x: ((index % cols) - (inRow - 1) / 2) * SPACING, y: OPEN_Y + ((rows - 1) / 2 - row) * ROW_GAP, z: 1 };
  }

  // Sends every chip in hand to its place: the row when open, the stack when closed.
  settle({ duration = 0.45, stagger = 0.05, ease = 'power3.out' } = {}) {
    const hand = this.hand();
    const order = this.opened ? [...hand].reverse() : hand;   // deal off the top, stack from the bottom
    order.forEach((chip, step) => {
      if (chip === this.drag?.chip) return;
      const picked = chip === this.selected;
      const to = this.opened ? this.slot(chip) : this.home(chip);
      const delay = step * stagger;
      chip.ring.visible = picked;
      this.tween(chip.group.position, { x: to.x, y: picked ? to.y + LIFT : to.y, z: picked ? to.z + 0.4 : to.z, duration, delay, ease });
      this.tween(chip.group.rotation, this.opened ? { x: STAND, y: 0, z: picked ? 0 : to.rz ?? 0, duration, delay, ease } : { x: 0, y: to.ry, z: 0, duration, delay, ease });
      this.tween(chip.group.scale, { x: 1, y: 1, z: 1, duration: 0.3, delay });
    });
  }

  open() {
    if (this.opened || !this.hand().length) return;
    this.killChipTweens();
    this.dealing = false;
    this.opened = true;
    this.selected = null;
    playUiSound('lift');
    this.fit(true);
    this.settle({ duration: 0.5, stagger: 0.06 });
    this.emit();
  }

  close() {
    if (!this.opened) return;
    this.killChipTweens();
    this.opened = false;
    this.selected = null;
    playUiSound('drop');
    this.fit(true);
    this.settle({ ease: 'power2.inOut' });
    this.emit();
  }

  // A picked chip rises straight up out of the row; the page reads its payout
  // into the gap underneath. Picking it again sets it back down.
  select(chip) {
    if (!this.opened) return;
    this.selected = this.selected === chip ? null : chip;
    if (this.selected) playUiSound('select');
    this.settle({ duration: 0.36, stagger: 0 });
    this.emit();
  }

  hover(chip) {
    if (this.dealing || this.drag || chip === this.hovered) return;
    const was = this.hovered;
    this.hovered = chip;
    this.events.style.cursor = chip ? 'grab' : '';
    if (chip && chip !== this.selected) playUiSound('hover');
    if (this.opened) {
      for (const c of [was, chip]) {
        if (!c || c === this.selected || c.placed) continue;
        this.tween(c.group.position, { y: this.slot(c).y + (c === chip ? 0.16 : 0), duration: 0.2, ease: 'power2.out' });
      }
    } else {
      // Closed, the stack answers as one: its top chip rises a touch.
      const top = this.hand().at(-1);
      if (top) this.tween(top.group.position, { y: this.home(top).y + (chip && !chip.placed ? 0.14 : 0), duration: 0.2, ease: 'power2.out' });
    }
  }

  // Once the board locks in, chips can still be read but not moved.
  setLocked(locked) {
    this.locked = locked;
    if (locked && this.drag) this.endDrag({ clientX: -1, clientY: -1 });
  }

  // ── dragging to the board ────────────────────────────────────────────────

  // The scale that draws a chip `px` pixels across at the held distance.
  heldScale(px) {
    const tanV = Math.tan((FOV / 360) * Math.PI);
    return (px * HELD * tanV) / Math.max(1, this.host.clientHeight);
  }

  // A point HELD units out along the ray under the pointer, and the turn that
  // shows a chip's face square to the camera from there.
  heldAt(clientX, clientY) {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const { origin, direction } = this.raycaster.ray;
    const point = origin.clone().addScaledVector(direction, HELD);
    this.aim.quaternion.setFromUnitVectors(UP, direction.clone().negate());
    return { point, rotation: this.aim.rotation.clone() };
  }

  startDrag(chip, event) {
    if (chip.placed) this.unplace(chip, false);
    this.killChipTweens();
    this.dealing = false;
    if (this.selected === chip) this.selected = null;
    chip.ring.visible = false;
    this.drag = { chip };
    this.events.style.cursor = 'grabbing';
    playUiSound('chip_lift');
    const { point, rotation } = this.heldAt(event.clientX, event.clientY);
    this.tween(chip.group.position, { x: point.x, y: point.y, z: point.z, duration: 0.18, ease: 'power2.out' });
    this.tween(chip.group.rotation, { x: rotation.x, y: rotation.y, z: rotation.z, duration: 0.18, ease: 'power2.out' });
    this.tween(chip.group.scale, { x: HELD_SCALE, y: HELD_SCALE, z: HELD_SCALE, duration: 0.18, ease: 'power2.out' });
    this.settle({ duration: 0.35, stagger: 0 });     // the rest close the gap it left
    this.emit();
  }

  moveDrag(event) {
    const { chip } = this.drag;
    const { point, rotation } = this.heldAt(event.clientX, event.clientY);
    // It trails the pointer a little and leans into the throw, like a chip in a hand.
    const lean = Math.max(-0.5, Math.min(0.5, (event.movementX || 0) * -0.03));
    gsap.to(chip.group.position, { x: point.x, y: point.y, z: point.z, duration: 0.12, ease: 'power2.out', overwrite: 'auto', onUpdate: this.mark });
    gsap.to(chip.group.rotation, { x: rotation.x, y: rotation.y, z: rotation.z + lean, duration: 0.2, ease: 'power2.out', overwrite: 'auto', onUpdate: this.mark });
    this.drag.over = this.dropTarget?.(event.clientX, event.clientY) ?? null;
    this.emit();
  }

  endDrag(event) {
    const { chip } = this.drag;
    // Decided where it is let go, not where it last moved: a quick flick can
    // end before any move event lands on the target.
    const over = this.dropTarget?.(event.clientX, event.clientY) ?? null;
    this.drag = null;
    this.events.style.cursor = '';
    if (over) this.place(chip, over);
    else {
      playUiSound('chip_drop');
      this.settle({ duration: 0.4, stagger: 0 });
    }
    this.emit();
  }

  place(chip, spot) {
    // One chip per spot (or per board, when single): what was there goes home.
    for (const other of this.chips) {
      if (other !== chip && other.placed && (this.single || other.placed.id === spot.id)) this.unplace(other, false);
    }
    chip.placed = spot;
    chip.ring.visible = false;
    playUiSound('chip_drop');
    this.pin(chip, spot, 0.28);
    this.settle({ duration: 0.35, stagger: 0 });
    this.onPlace?.(this.chips.indexOf(chip), spot.id);
    if (!this.hand().length || this.anchors) this.close();
  }

  // Moves a placed chip onto its spot; the board calls this when the spot moves.
  pin(chip, spot, duration = 0.2) {
    chip.placed = spot;
    const { point, rotation } = this.heldAt(spot.x, spot.y);
    const s = spot.size ? this.heldScale(spot.size) : PLACED_SCALE;
    this.tween(chip.group.position, { x: point.x, y: point.y, z: point.z, duration, ease: 'back.out(1.6)' });
    this.tween(chip.group.rotation, { x: rotation.x, y: rotation.y, z: rotation.z, duration, ease: 'power2.out' });
    this.tween(chip.group.scale, { x: s, y: s, z: s, duration, ease: 'back.out(1.6)' });
  }

  repin(index, spot) {
    const chip = this.chips[index];
    if (!chip || chip === this.drag?.chip) return;
    if (!spot) {
      if (chip.placed) this.unplace(chip);
      return;
    }
    const at = chip.placed;
    if (at && at.id === spot.id && Math.abs(at.x - spot.x) < 1 && Math.abs(at.y - spot.y) < 1 && at.size === spot.size) return;
    this.pin(chip, spot);
  }

  unplace(chip, animate = true) {
    const was = chip.placed;
    chip.placed = null;
    if (was) this.onPlace?.(this.chips.indexOf(chip), null);
    if (animate) {
      playUiSound('chip_drop');
      this.settle({ duration: 0.4, stagger: 0 });
      this.emit();
    }
  }

  // Placed chips are pinned to the screen, so they follow every camera move.
  pinPlaced() {
    for (const chip of this.chips) {
      if (!chip.placed || gsap.isTweening(chip.group.position)) continue;
      const { point, rotation } = this.heldAt(chip.placed.x, chip.placed.y);
      chip.group.position.copy(point);
      chip.group.rotation.copy(rotation);
      if (chip.placed.size) chip.group.scale.setScalar(this.heldScale(chip.placed.size));
    }
  }

  emit() {
    let anchor = null;
    if (this.selected) {
      // Just above the picked chip, kept clear of the screen's sides.
      const to = this.slot(this.selected);
      const at = this.toScreen({ x: to.x, y: to.y + LIFT + 1.2, z: to.z });
      if (at) anchor = { x: Math.min(Math.max(at.x, 120), this.host.clientWidth - 120), y: at.y };
    }
    this.onChange?.({
      opened: this.opened,
      selected: this.selected?.key ?? null,
      anchor,
      dragging: this.drag?.chip.key ?? null,
      over: this.drag?.over?.id ?? null,
      placed: Object.fromEntries(this.chips.filter(c => c.placed).map(c => [c.placed.id, c.key])),
      count: this.chips.length,
    });
  }

  // A world point in host pixels, for laying page content over the scene.
  toScreen({ x, y, z }) {
    if (!this.camera) return null;
    const v = new Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight };
  }

  tween(target, vars) {
    if (this.reducedMotion) {
      const timing = new Set(['duration', 'delay', 'ease', 'onStart']);
      Object.assign(target, Object.fromEntries(Object.entries(vars).filter(([name]) => !timing.has(name))));
      this.mark();
      return;
    }
    gsap.to(target, { ...vars, onUpdate: this.mark, overwrite: 'auto' });
  }

  killTweens() {
    if (this.cam) gsap.killTweensOf(this.cam);
    this.killChipTweens();
  }

  killChipTweens() {
    for (const chip of this.chips) {
      gsap.killTweensOf(chip.group.position);
      gsap.killTweensOf(chip.group.rotation);
      gsap.killTweensOf(chip.group.scale);
    }
  }

  // ── input ────────────────────────────────────────────────────────────────

  hit(event) {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.chips.flatMap(chip => chip.meshes);
    const [first] = this.raycaster.intersectObjects(meshes, false);
    return first ? this.chips[first.object.userData.chip] : null;
  }

  // Presses are read on `events` in the capture phase, before anything under the
  // layer sees them, and claimed only when they land on a chip. Moves and
  // releases are read on the window so a drag can leave the layer's box.
  bind() {
    const el = this.events;
    this.onMove = (event) => {
      const press = this.press;
      if (this.drag) {
        this.moveDrag(event);
        return;
      }
      if (press?.chip && !this.locked && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP) {
        // Off a closed stack you can only take the top chip, as with real chips.
        const chip = !this.opened && !press.chip.placed ? this.hand().at(-1) : press.chip;
        this.startDrag(chip, event);
        return;
      }
      if (event.pointerType !== 'touch' && el.contains(event.target)) this.hover(this.hit(event));
    };
    this.onLeave = () => { if (!this.drag) this.hover(null); };
    this.onDown = (event) => {
      const chip = this.hit(event);
      this.press = { x: event.clientX, y: event.clientY, chip };
      if (chip) {
        event.stopPropagation();
        event.preventDefault();
      }
    };
    this.onUp = (event) => {
      const press = this.press;
      this.press = null;
      if (this.drag) {
        this.endDrag(event);
        return;
      }
      if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP) return;
      const chip = press.chip && this.hit(event);
      if (chip?.placed) {
        if (!this.locked) this.unplace(chip);
      } else if (!this.opened) {
        if (chip) this.open();
      } else if (!chip) {
        this.close();
      } else {
        this.select(chip);
      }
    };
    this.onKey = (event) => {
      if (event.key === 'Escape') this.close();
    };
    el.addEventListener('pointerdown', this.onDown, true);
    el.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
  }

  // ── view ─────────────────────────────────────────────────────────────────

  // Closed, the camera sits close on the stack; open, it backs off until every
  // chip fits, with headroom for a picked chip to rise. It glides between the two.
  shot() {
    const { aspect } = this.camera;
    const tanV = Math.tan((FOV / 360) * Math.PI);
    const anchor = this.anchors?.()[this.opened ? 'open' : 'closed'];
    if (anchor) {
      // On a board the chips keep a set size on screen and sit at a set point:
      // distance gives the size, a view offset moves the aim point onto the anchor.
      const H = Math.max(1, this.host.clientHeight);
      const W = Math.max(1, this.host.clientWidth);
      const height = this.hand().length * (THICK + 0.006);
      return {
        d: H / (anchor.size * tanV),
        y: this.opened ? OPEN_Y + LIFT / 2 : height / 2,
        ox: W / 2 - anchor.x,
        oy: H / 2 - anchor.y,
      };
    }
    if (!this.opened) {
      const height = this.hand().length * (THICK + 0.006);
      const half = Math.max(2.5, height / 2 + 1.5);
      return { d: Math.max(half / tanV, 2.4 / (tanV * aspect)), y: height / 2, ox: 0, oy: 0 };
    }
    const { cols, rows } = this.grid();
    const halfW = (Math.max(3, cols) * SPACING) / 2 + 0.6;
    const halfH = (rows * ROW_GAP) / 2 + LIFT / 2 + 0.9;
    return { d: Math.max(halfW / (tanV * aspect), halfH / tanV, 3.6 / tanV), y: OPEN_Y + LIFT / 2, ox: 0, oy: 0 };
  }

  fit(animate = false) {
    if (!this.camera) return;
    const to = this.shot();
    this.cam ??= { ...to };
    const apply = () => {
      const W = this.host.clientWidth;
      const H = this.host.clientHeight;
      if (this.anchors && W && H) this.camera.setViewOffset(W, H, this.cam.ox, this.cam.oy, W, H);
      const target = new Vector3(0, this.cam.y, 0);
      this.camera.position.copy(target).addScaledVector(VIEW, this.cam.d);
      this.camera.lookAt(target);
      // Depth precision goes to the range in use: from just short of a held chip
      // to just past the table. A loose near plane is what made faces fight.
      this.camera.near = Math.min(HELD * 0.6, this.cam.d * 0.5);
      this.camera.far = this.cam.d + 30;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      this.pinPlaced();
      this.mark();
    };
    gsap.killTweensOf(this.cam);
    if (animate && !this.reducedMotion) {
      gsap.to(this.cam, { ...to, duration: 0.5, ease: 'power3.inOut', onUpdate: apply, onComplete: () => this.emit() });
    } else {
      Object.assign(this.cam, to);
      apply();
    }
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
    // A new shape can mean a new number of columns, so open chips find their new places.
    if (this.opened) {
      for (const chip of this.hand()) {
        const to = this.slot(chip);
        chip.group.position.set(to.x, chip === this.selected ? to.y + LIFT : to.y, to.z);
      }
    }
    this.emit();
  }

  render() {
    if (!this.dirty || !this.visible || !this.renderer) return;
    this.dirty = false;
    const start = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.stats.ms = performance.now() - start;
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.killTweens();
    this.observer?.disconnect();
    this.visibility?.disconnect();
    this.events.removeEventListener('pointerdown', this.onDown, true);
    this.events.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    this.chips.forEach(disposeChip);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
