// The board in 2.5D: one three.js scene that plays a round exactly as the Pixi
// BoardStage does, behind the same API (init, deal, lockIn, resolve, skip,
// destroy, onState), so BoardSeries can use either.
//
// No table: the map is the ground, seen only through three card-cut lanes.
// Cards are slabs with the real PlayerCard face; tactic chips are real chips in
// the same scene, so everything shares one depth order. Lane headers and score
// bars are flat page text laid onto the lanes, because type drawn into a tilted
// texture blurs and the numbers are the game.
//
// Two layouts, from the approved mid-fi: wide plays a lane's cards in one row;
// tall (phones) sets two at the bar and tucks the third behind, so each card can
// be nearly twice as big. The stage picks whichever shows cards bigger, then
// grows the lanes into any height left over.

import {
  DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFSoftShadowMap,
  PerspectiveCamera, Plane, PlaneGeometry, Raycaster, Scene, ShapeGeometry, CanvasTexture, SRGBColorSpace,
  TextureLoader, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { gsap } from 'gsap';
import {
  LANE_CAP, bestPlacement, bestRotate, chainLane, hasSkill, isLegalPlacement, isLegalRotation, resolveBoard, rotateMoves, sideScores,
} from '../engine/board/board.js';
import { mulberry32 } from '../../shared/src/engine/perfectRun.js';
import { assetPath } from '../../shared/src/lib/utils.js';
import { playUiSound } from '../../shared/src/lib/gameAudio';
import { playGlassShatter, playLaneWin } from '../lib/sfx';
import { STAT_LABELS_FULL } from '../../shared/src/data/statFields.js';
import { disposeChip, makeChip, printChip, THICK } from '../chip3d/ChipStack.js';
import { createChipView } from '../chip3d/chipRenderer.js';
import { attack, chipFire, lightning, lockShatter, slash } from './chipFx.js';
import { attachLaneVerdictFx, disposeLaneVerdictFx } from './LaneVerdictFx.js';
import { attachSkillFx, readyPose } from './SkillFx.js';
import { ARENAS, createSoftFocus, loadArena, preloadArena } from './arena.js';
import {
  ART_SCALE, CARD_H, CARD_T, CARD_TIP, CARD_W, FOV, IMAGE_ASPECT, LANE_GAP, LANE_W,
  LANE_X, PX, PY, backTexture, cardArt, cutShape, drawCard, loadImage, slab,
} from './TableBlockout.js';
import styles from './TableStage.module.css';
import { CHIP_TIERS } from '../chip3d/chipData.js';

const CHIP_BODY = Object.fromEntries(Object.entries(CHIP_TIERS).map(([tier, tone]) => [tier, tone.body]));

const PITCH = (74 * Math.PI) / 180;      // top-down, as the user asked
// The match intro's camera drop: from a little higher (1.45 times as far), a
// little steeper and turned 10 degrees, down into the playing view over 1.4 s.
// Kept short so the frame never reaches past the arena's edges.
const DROP_PITCH = (82 * Math.PI) / 180;
const DROP_HEIGHT = 0.45;
const DROP_YAW = (10 * Math.PI) / 180;
const DROP_SECONDS = 1.4;
// Hand chips lean away from the camera: tilted toward it they sat face-on to the
// top-down view and read as flat discs. Leaning back shows the rim and its depth.
const CHIP_TILT = -0.6;
const TAP = 6;
// How far an arena slides on a map change: its own half width (26, set in
// build_arena.py) plus the widest view past the lanes, so it fully clears the screen.
const ARENA_SHIFT = 46;
const LANE_LIT = 0xc8c8c8;
const LANE_DIM = 0x8c8c8c;
const TUCK = 1.33;                       // how far the tall layout's third card sits behind the other two

// Board units along a lane, z measured from its centre. card and handCard are
// card scales; stretch caps how far the lanes may grow into spare height.
const LAYOUTS = {
  wide: { len: 6.4, tip: 0.25, them: -1.32, bar: 0.12, you: 1.56, card: 1.2, hand: 4.46, handCard: 1.36, chipR: 0.37, stretch: 1.6 },
  tall: { len: 13.6, tip: 0.32, them: -2.71, bar: -0.2, you: 2.24, card: 1.84, hand: 8.55, handCard: 2.54, chipR: 0.58, stretch: 1.3 },
};
// The flat header and score bar are drawn at these px sizes, then mapped onto
// the lane; the header from the lane's far point down. youRow: where the bar's
// own row sits, as a share of its height.
const BOX = {
  wide: { bar: [420, 160], head: [420, 150], youRow: 0.881 },
  tall: { bar: [320, 248], head: [320, 146], youRow: 0.891 },
};
const PIN_HW = LANE_W / 2 - 0.12;        // half the width the header and bar span on a lane

// A CSS transform that maps a w×h box onto any four screen points (a homography),
// so flat page text can lie on a surface in the 3D scene and stay sharp.
function quadTransform(w, h, [p0, p1, p2, p3]) {
  const adj = m => [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
  const mm = (a, b) => {
    const c = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
    return c;
  };
  const mv = (m, v) => [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
  const basis = (a, b, c, d) => {
    const m = [a[0], b[0], c[0], a[1], b[1], c[1], 1, 1, 1];
    const v = mv(adj(m), [d[0], d[1], 1]);
    return mm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
  };
  const t = mm(basis(p0, p1, p2, p3), adj(basis([0, 0], [w, 0], [w, h], [0, h])));
  const n = t.map(value => value / t[8]);
  return `matrix3d(${n[0]},${n[3]},0,${n[6]},${n[1]},${n[4]},0,${n[7]},0,0,1,0,${n[2]},${n[5]},0,1)`;
}

// A side's bar row as segments: each player's number (less any No Respect cut),
// the bonuses in one block, then one outlined block per multiplier, sized by
// what it added. `kind` says which multiplier, so a chip can sit on its own.
function segmentItems(steps) {
  const cut = steps.find(step => step.key === 'disrespect');
  let cutDone = false;
  const players = steps.filter(step => step.key === 'player').map((step) => {
    if (cut && !cutDone && step.label === cut.player) {
      cutDone = true;
      return { value: step.value - cut.value, text: String(step.value - cut.value), cut: true };
    }
    return { value: step.value, text: String(step.value) };
  });
  const bonus = steps.filter(step => step.op === '+' && step.key !== 'player').reduce((sum, step) => sum + step.value, 0);
  let before = players.reduce((sum, item) => sum + item.value, 0) + bonus;
  const mults = steps.filter(step => step.key === 'tactic' || step.key === 'chain').map((step) => {
    const extra = Math.max(0, step.total - before);
    before = step.total;
    return { value: extra, text: `×${step.value}`, outline: true, kind: step.key };
  }).filter(item => item.value);
  return [...players, ...(bonus ? [{ value: bonus, text: `+${bonus}`, solid: true }] : []), ...mults];
}

export default class TableStage {
  /** onChipView({ selected, anchor }): a hand chip was picked, for the page to show its payout. */
  /** onCardView({ card, stat, canReturn }): one of your placed cards was picked, for the page to show in full. */
  /** insetTop / insetBottom: page bars over the board, in px, kept clear when framing. */
  /** arena: the map's 3D set under the board, 'grey' or 'tint'; 'off' or unset keeps the plain floor. */
  constructor(host, { onState, reducedMotion, onChipView, onCardView, insetTop = 60, insetBottom = 14, arena = 'off' } = {}) {
    this.host = host;
    this.arenaPalette = arena;
    this.arena = null;
    this.inset = { top: insetTop, bottom: insetBottom };
    this.reserve = 0;   // px at the bottom right the page's button takes, kept clear of the hand
    this.onState = onState;
    this.onChipView = onChipView;
    this.onCardView = onCardView;
    this.hold = null;
    this.floor = new Plane(new Vector3(0, 1, 0), 0);
    this.reducedMotion = reducedMotion;
    this.alive = true;
    this.cards = [];
    this.chips = [];
    this.oppChips = [];
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.dragPlane = new Plane(new Vector3(0, 1, 0), -0.35);
    this.hoverLane = null;
    this.hot = null;
    this.dirty = true;
    this.mark = () => { this.dirty = true; };
    this.tick = (time, deltaMs) => {
      const dt = Math.min(0.05, (deltaMs || 16) / 1000);
      this.step(dt);
      this.stepSkills(dt);
      if (this.arena?.root.visible && this.arena.animated && !this.reducedMotion) {
        this.arena.update(dt);
        this.dirty = true;
      }
      this.render();
    };
  }

  async init() {
    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return false;
    }
    await document.fonts?.load('800 40px "Familjen Grotesk"').catch(() => null);
    if (!this.alive) return false;
    const { renderer } = this;
    // No Respect cuts a card in two with clipping planes on each half.
    renderer.localClippingEnabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    this.host.appendChild(renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.className = styles.overlay;
    this.host.appendChild(this.overlay);
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(FOV, 1, 1, 80);
    const sky = new HemisphereLight(0xffffff, 0x20232c, 1.5);
    sky.layers.enableAll();
    this.scene.add(sky);
    const sun = new DirectionalLight(0xffffff, 1.5);
    sun.layers.enableAll();
    // Nearly overhead, so shadows stay tucked under what casts them: a slanted
    // light threw heavy dark slabs off the raised hand when seen from above.
    sun.position.set(-1.2, 10, 1.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    this.sun = sun;
    this.scene.add(sun);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();
    this.bind();
    gsap.ticker.add(this.tick);
    if (import.meta.env.DEV) window.__table = this;
    return true;
  }

  rendererName() {
    return 'three';
  }

  // ── dealing ──────────────────────────────────────────────────────────────

  /** Load a round's card art and arena ahead of its deal, so the deal itself is instant. */
  async preload({ cards, mapName }) {
    await Promise.all([
      Promise.all(cards.map(card => Promise.all(cardArt(card).map(loadImage)))),
      this.arenaPalette !== 'off' ? preloadArena(mapName, 2500) : null,
    ]);
  }

  async deal(game) {
    const fromRound = Boolean(this.board) && !this.reducedMotion;
    this.timeline?.kill();
    const nextOppPlan = bestPlacement({ roster: game.them, maps: game.maps, tactics: game.opponentTactics ?? [game.opponentTactic], rng: mulberry32(game.seed + 1) });
    const [arts] = await Promise.all([
      Promise.all([...game.you, ...game.them].map(card => Promise.all(cardArt(card).map(loadImage)))),
      fromRound ? this.flyOutLeft() : Promise.resolve(),
      this.arenaPalette !== 'off' ? preloadArena(game.mapName, 2500) : null,
      this.arena && this.arena.name !== game.mapName ? this.arenaOut() : null,
    ]);
    if (!this.alive) return;
    this.game = game;
    this.phase = 'place';
    this.slots = game.you.map(() => null);
    this.lockedSlots = null;
    this.tacticLane = {};
    this.shown = null;
    this.result = null;
    // The same enemy plan the Pixi board makes, from the same seed.
    this.oppPlan = nextOppPlan;
    // A blind board: the enemy's five and chips wait face down until lock in.
    this.oppShown = [];
    this.clear();
    this.build(arts);
    if (this.dropPending) this.dropCamera();
    this.dealIn(fromRound);
    this.emit();
  }

  flyOutLeft() {
    if (!this.board || this.reducedMotion) return Promise.resolve();
    return new Promise((resolve) => {
      const shift = -(this.L?.halfW ?? 7) * 2.2;
      const tl = gsap.timeline({ onUpdate: this.mark, onComplete: resolve });
      this.lanes.forEach((lane, i) => {
        const at = i * 0.035;
        tl.to(lane.position, { x: lane.position.x + shift, duration: 0.26, ease: 'power2.in' }, at);
        if (this.heads?.[i]) tl.to(this.heads[i], { opacity: 0, duration: 0.2, ease: 'power1.in' }, at + 0.04);
        if (this.labels?.[i]?.bar) tl.to(this.labels[i].bar, { opacity: 0, duration: 0.2, ease: 'power1.in' }, at + 0.04);
      });
      for (const entry of [...this.cards, ...this.chips]) {
        const lane = this.laneOf(entry);
        const at = (lane ?? 1) * 0.035;
        tl.to(entry.group.position, { x: entry.group.position.x + shift, duration: 0.26, ease: 'power2.in' }, at);
      }
    });
  }

  clear() {
    this.timeline?.kill();
    for (const entry of this.cards ?? []) { entry.fx?.dispose(); entry.fx = null; }
    for (const lane of this.lanes ?? []) disposeLaneVerdictFx(lane);
    if (this.board) {
      this.scene.remove(this.board);
      for (const chip of [...this.chips, ...this.oppChips]) {
        this.dropFloat(chip);
        disposeChip(chip);
      }
      this.board.traverse((node) => {
        gsap.killTweensOf(node.position);
        gsap.killTweensOf(node.rotation);
        gsap.killTweensOf(node.scale);
        if (node.userData.sharedGeometry) return;
        node.geometry?.dispose();
        [].concat(node.material ?? []).forEach((material) => { material.map?.dispose(); material.dispose(); });
      });
    }
    this.overlay?.replaceChildren();
    this.cards = [];
    this.chips = [];
    this.oppChips = [];
    this.lanes = [];
    this.hold = null;
    this.selected = null;
    this.drag = null;
  }

  build(arts) {
    const { game } = this;
    const board = new Group();
    this.board = board;
    this.scene.add(board);
    const ground = new Mesh(new PlaneGeometry(60, 40), new MeshStandardMaterial({ color: 0x0f1118, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    board.add(ground);
    this.ground = ground;
    this.syncArena(game.mapName);

    this.laneSide = new MeshStandardMaterial({ color: 0x14161d, roughness: 0.9 });
    this.art = new TextureLoader().load(assetPath(game.maps[0].image), () => {
      this.lanes?.forEach((lane) => { lane.userData.top.map.needsUpdate = true; });
      this.mark();
    });
    this.art.colorSpace = SRGBColorSpace;
    this.art.anisotropy = 8;
    this.lanes = [];
    this.buildLanes();

    // Cards: slab, real face, plain back, and the white outline for the picked one.
    const cardShape = cutShape(CARD_W, CARD_H, CARD_TIP);
    const ringShape = cutShape(CARD_W + 0.09, CARD_H + 0.09, CARD_TIP + 0.01);
    const edge = new MeshStandardMaterial({ color: 0x2a2e39, roughness: 0.7 });
    const backMat = new MeshStandardMaterial({ map: backTexture(), roughness: 0.8 });
    backMat.map.repeat.set(1 / CARD_W, 1 / CARD_H);
    backMat.map.offset.set(0.5, 0.5);
    const roster = [...game.you.map((card, i) => ({ card, side: 'you', i })), ...game.them.map((card, i) => ({ card, side: 'them', i }))];
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
      body.castShadow = true;
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
      // The card's parts sit in a lift layer, so a live skill can raise and tip the
      // card without fighting the tweens that move it around the board.
      const lift = new Group();
      lift.add(body, face, back, outline);
      group.add(lift);
      const entry = { kind: 'card', card, side: who, i, group, lift, body, outline, canvas: el, map, art: arts[n], drawn: undefined, hidden: who === 'them' && !this.oppShown.includes(i) };
      for (const mesh of [body, face, back]) mesh.userData.entry = entry;
      board.add(group);
      this.cards.push(entry);
    });

    // Tactic chips: one stack per exact type beside the hand, each copy playable.
    this.chips = game.tactics.map((instance, index) => {
      const chip = makeChip(instance.key, index);
      chip.kind = 'chip';
      chip.index = index;
      chip.instance = instance;
      chip.group.scale.setScalar(this.L.chipR);
      chip.group.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.userData.sharedGeometry = true;
          node.userData.entry = chip;
        }
      });
      board.add(chip.group);
      return chip;
    });

    // Each lane's header, one line on its far end: the lane, and the stat it counts.
    this.heads = game.maps.map((info) => {
      const head = document.createElement('div');
      head.dataset.role = 'head';
      const name = document.createElement('b');
      name.textContent = info.name.toUpperCase();
      const stat = document.createElement('span');
      stat.textContent = STAT_LABELS_FULL[info.stat].toUpperCase();
      head.append(name, stat);
      this.overlay.append(head);
      return head;
    });
    this.labels = game.maps.map((_, lane) => {
      const bar = document.createElement('div');
      bar.dataset.role = 'bar';
      bar.innerHTML = '<div data-row="them"></div><div data-tug><i data-side="you"></i><i data-side="them"></i><b data-side="you"></b><b data-side="them"></b><s></s></div><div data-row="you"></div><em data-stamp></em>';
      // On a phone the bar shows totals only; holding it opens each card's number.
      const release = () => {
        if (this.hold !== lane) return;
        this.hold = null;
        this.mark();
      };
      bar.addEventListener('pointerdown', () => { this.hold = lane; this.mark(); });
      bar.addEventListener('pointerup', release);
      bar.addEventListener('pointerleave', release);
      bar.addEventListener('pointercancel', release);
      this.overlay.append(bar);
      return { bar };
    });
    this.place(true);
  }

  // The lanes are rebuilt whenever the layout changes their length, with the
  // map re-fitted to cover them, never stretched.
  buildLanes() {
    for (const lane of this.lanes) {
      disposeLaneVerdictFx(lane);
      this.board.remove(lane);
      lane.geometry.dispose();
      lane.userData.top.map.dispose();
      lane.userData.top.dispose();
      for (const fade of lane.children) {
        fade.geometry.dispose();
        fade.material.map.dispose();
        fade.material.dispose();
      }
    }
    const { len, tip } = this.L;
    this.builtLen = len;
    const span = LANE_W * 3 + LANE_GAP * 2;
    const imageW = Math.max(span, len * IMAGE_ASPECT) * 1.02;
    const imageD = imageW / IMAGE_ASPECT;
    this.lanes = LANE_X.map((x) => {
      const tex = this.art.clone();
      tex.repeat.set(1 / imageW, 1 / imageD);
      tex.offset.set((x + imageW / 2) / imageW, 0.5);
      const top = new MeshStandardMaterial({ map: tex, color: LANE_DIM, roughness: 0.95 });
      const lane = new Mesh(slab(cutShape(LANE_W, len, tip), 0.08), [top, this.laneSide]);
      lane.userData.top = top;
      lane.position.set(x, -0.08, 0);
      lane.receiveShadow = true;
      // A soft dark fade over the map at the far end only, under the header.
      const fade = new Mesh(new ShapeGeometry(cutShape(LANE_W, len, tip)), this.fadeMaterial(len));
      fade.rotation.x = -Math.PI / 2;
      fade.position.y = 0.082;
      lane.userData.fade = fade;
      lane.add(fade);
      this.board.add(lane);
      return lane;
    });
    if (this.shown) {
      this.shown.forEach((entry, i) => {
        if (entry.verdict !== undefined) this.applyLaneVerdict(i, entry.verdict, true);
      });
    } else {
      this.tintLanes();
    }
  }

  fadeMaterial(len) {
    const el = document.createElement('canvas');
    el.width = 4;
    el.height = 512;
    const ctx = el.getContext('2d');
    const reach = Math.min(1, 2 / len);         // about two board units deep
    const fade = ctx.createLinearGradient(0, 0, 0, el.height * reach);
    fade.addColorStop(0, 'rgba(0,0,0,0.6)');
    fade.addColorStop(0.45, 'rgba(0,0,0,0.3)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, el.width, el.height);
    const map = new CanvasTexture(el);
    // The shape's own coordinates as UVs: across the lane, then along it, far end on top.
    map.repeat.set(1 / LANE_W, 1 / len);
    map.offset.set(0.5, 0.5);
    return new MeshBasicMaterial({ map, transparent: true, depthWrite: false });
  }

  dealIn(fromRound = false) {
    if (this.reducedMotion) {
      playUiSound('deal', 0);
      return;
    }
    if (fromRound) {
      const shift = (this.L?.halfW ?? 7) * 2.2;
      this.lanes.forEach((lane, i) => {
        const targetX = LANE_X[i];
        lane.position.x = targetX + shift;
        gsap.to(lane.position, { x: targetX, duration: 0.38, delay: i * 0.045, ease: 'power3.out', onUpdate: this.mark });
        if (this.heads?.[i]) gsap.fromTo(this.heads[i], { opacity: 0 }, { opacity: 1, duration: 0.26, delay: i * 0.045, ease: 'power2.out' });
        if (this.labels?.[i]?.bar) gsap.fromTo(this.labels[i].bar, { opacity: 0 }, { opacity: 1, duration: 0.26, delay: i * 0.045, ease: 'power2.out' });
      });
      this.theirs().forEach((entry, k) => {
        const lane = this.laneOf(entry);
        const targetX = entry.group.position.x;
        entry.group.position.x = targetX + shift;
        gsap.to(entry.group.position, { x: targetX, duration: 0.38, delay: (lane ?? 2) * 0.045 + k * 0.02, ease: 'power3.out', onUpdate: this.mark });
      });
      [...this.mine(), ...this.chips].forEach((entry, index) => {
        const { group } = entry;
        const y = group.position.y;
        group.position.y = y + 1.4;
        gsap.to(group.position, {
          y,
          duration: 0.42,
          delay: 0.14 + index * 0.035,
          ease: 'power3.out',
          onStart: () => { if (entry.kind === 'card') playUiSound('deal', index); },
          onUpdate: this.mark,
        });
      });
      return;
    }
    [...this.cards, ...this.chips].forEach((entry, index) => {
      const { group } = entry;
      const y = group.position.y;
      group.position.y = y + 1.4;
      gsap.to(group.position, {
        y,
        duration: 0.45,
        delay: index * 0.035,
        ease: 'power3.out',
        onStart: () => { if (entry.kind === 'card' && entry.side === 'you') playUiSound('deal', index); },
        onUpdate: this.mark,
      });
    });
  }

  mine() { return this.cards.filter(card => card.side === 'you'); }
  theirs() { return this.cards.filter(card => card.side === 'them'); }

  laneOf(entry) {
    if (entry.kind === 'chip') return this.tacticLane[entry.index] ?? null;
    if (entry.side === 'you') return this.slots[entry.i];
    if (entry.hidden) return null;
    return this.oppPlan.slots[entry.i];
  }

  // ── faces ────────────────────────────────────────────────────────────────

  // Redraws a face only when the stat it lights changes. A card not on a lane
  // previews the stat of the lane you point at, or the lane it's held over.
  paint(entry) {
    const held = entry === this.drag?.entry;
    const preview = held ? this.hot : this.laneOf(entry) == null && entry.side === 'you' ? this.hoverLane : null;
    const lane = held && this.hot != null ? this.hot : this.laneOf(entry) ?? preview;
    const stat = lane == null || entry.hidden ? null : this.game.maps[lane].stat;
    // Small on a phone's lane, a card shows only the number it scores, big.
    const focus = Boolean(this.L.tall && stat && (held || this.laneOf(entry) != null));
    const key = `${stat}:${focus}`;
    if (entry.drawn === key) return;
    entry.drawn = key;
    drawCard(entry.canvas.getContext('2d'), entry.card, entry.art, { stat, side: entry.side, igl: entry.i === 0, focus });
    entry.map.needsUpdate = true;
  }

  // ── layout ───────────────────────────────────────────────────────────────

  // A layout with every position resolved; f stretches the lanes into spare height.
  layout(name, f = 1) {
    const base = LAYOUTS[name];
    const tall = name === 'tall';
    const len = base.len * f;
    const shift = (len - base.len) / 2;
    const hand = base.hand + shift;
    const handH = CARD_H * base.handCard;
    const chipZ = tall ? hand + handH / 2 + 0.35 + base.chipR : hand;
    const [bw, bh] = BOX[name].bar;
    return {
      ...base, youRow: BOX[name].youRow, name, tall, len, hand, chipZ,
      them: base.them * f, bar: base.bar * f, you: base.you * f,
      barH: (PIN_HW * 2 * bh) / bw,
      halfW: LANE_X[2] + LANE_W / 2 + (tall ? 0.12 : 0.8),
      zFar: -len / 2 - (tall ? 0.9 : 0.12),
      zNear: tall ? chipZ + base.chipR + 0.4 : hand + handH / 2 + 0.15,
    };
  }

  // Whichever layout shows the cards bigger on this screen, its lanes grown to
  // fill any height left once the width is used up.
  pickLayout(W, H) {
    const free = Math.max(1, H - this.inset.top - this.inset.bottom);
    const sin = Math.sin(PITCH);
    let best = null;
    for (const name of Object.keys(LAYOUTS)) {
      const base = this.layout(name);
      const depth = (base.zNear - base.zFar) * sin;
      const across = W / (base.halfW * 2);
      const down = free / depth;
      const size = Math.min(across, down) * base.card;
      if (!best || size > best.size) best = { name, size, base, depth, across, down };
    }
    const { name, base, depth, across, down } = best;
    const spare = down > across ? (depth * (down / across - 1) * 0.9) / sin : 0;
    return this.layout(name, Math.min(base.stretch, 1 + spare / base.len));
  }

  handChipStacks() {
    const stacks = new Map();
    for (const chip of this.chips) {
      if (this.tacticLane[chip.index] != null) continue;
      if (!stacks.has(chip.key)) stacks.set(chip.key, []);
      stacks.get(chip.key).push(chip);
    }
    return [...stacks.values()];
  }

  spot(entry) {
    const L = this.L;
    const lane = this.laneOf(entry);
    if (entry.kind === 'chip') {
      // On a lane the chip sits on the bar, on the multiplier it adds.
      if (lane != null) return this.barSpot(lane, 'you');
      const hand = this.chips.filter(c => this.tacticLane[c.index] == null);
      const k = hand.indexOf(entry);
      const picked = entry === this.selected;
      // Once locked in, unplaced chips cannot be played: stack them into one compact
      // pile and slide them down out of the bottom bar so the outcome banner has the full row.
      if (this.phase !== 'place') {
        const x = -(LANE_X[2] + LANE_W / 2) + L.chipR + 0.1 + k * 0.04;
        return { x, y: 0.12 + k * 0.09, z: L.chipZ + (L.tall ? 3.2 : 2.2), rx: CHIP_TILT, rz: 0, s: L.chipR * 0.85 };
      }
      // Left of the hand; on a phone, in the bottom row beside the lock-in button.
      const stacks = this.handChipStacks();
      const column = stacks.findIndex(stack => stack.includes(entry));
      const level = stacks[column].indexOf(entry);
      // Stack along the tilted face's normal, toward the camera: the rims show
      // each copy while the uppermost chip keeps its whole face visible.
      const lift = level * (THICK + 0.012) * L.chipR;
      const x = -(LANE_X[2] + LANE_W / 2) + L.chipR + 0.1 + column * (L.chipR * (L.tall ? 1.45 : 2) + 0.15);
      return { x, y: 0.2 + column * (L.tall ? 0.06 : 0) + Math.cos(CHIP_TILT) * lift + (picked ? 0.2 : 0), z: L.chipZ + Math.sin(CHIP_TILT) * lift, rx: picked ? CHIP_TILT * 0.5 : CHIP_TILT, rz: picked ? -0.2 : 0, s: L.chipR * (picked ? 1.15 : 1) };
    }
    if (lane != null) {
      const row = this.cards.filter(c => c.side === entry.side && this.laneOf(c) === lane);
      const k = row.indexOf(entry);
      const s = L.card;
      const w = CARD_W * s;
      const z = entry.side === 'you' ? L.you : L.them;
      if (!L.tall) return { x: LANE_X[lane] + (k - (row.length - 1) / 2) * (w + 0.1), y: 0.02, z, rx: 0, rz: 0, s };
      // Two at the bar, the third tucked behind so every scoring number shows:
      // yours slides under the pair, theirs lies over it.
      if (k === 2) {
        const yours = entry.side === 'you';
        return { x: LANE_X[lane], y: yours ? 0.02 : 0.07, z: z + (yours ? TUCK : -TUCK), rx: 0, rz: 0, s };
      }
      const x = row.length === 1 ? LANE_X[lane] : LANE_X[lane] + (k === 0 ? -1 : 1) * (w + 0.05) / 2;
      return { x, y: 0.045, z, rx: 0, rz: 0, s };
    }
    const pool = this.cards.filter(c => c.side === entry.side && this.laneOf(c) == null);
    const k = pool.indexOf(entry);
    const off = k - (pool.length - 1) / 2;
    if (entry.side === 'you') {
      // The hand docks under the lanes, tilted to face the camera, fanned a little.
      const { s, centre } = this.handRow(pool.length);
      const picked = entry === this.selected;
      // Tilted, a card's near edge drops below its centre, so it is raised by that
      // much and a little more: any lower and the floor cuts off the stat row.
      const lift = Math.sin(0.3) * (CARD_H * s) / 2 + 0.06;
      return { x: centre + off * (CARD_W * s + 0.12), y: lift + (picked ? 0.25 : 0), z: L.hand - (picked ? 0.15 * s : 0), rx: 0.3, rz: 0, ry: -off * 0.05, s };
    }
    // The enemy's hidden cards wait face down, small: past lane C's far point on
    // a phone, beside lane C on a wide screen.
    // Spaced apart, so how many are left to come can be counted at a glance.
    if (L.tall) {
      const s = 0.6;
      return { x: LANE_X[2] + LANE_W / 2 - CARD_W * s / 2 - (pool.length - 1 - k) * (CARD_W * s + 0.06), y: 0.06, z: -L.len / 2 - 0.45, rx: 0, rz: Math.PI, s };
    }
    return { x: LANE_X[2] + LANE_W / 2 + 0.42, y: 0.06, z: L.them - 0.6 + k * (CARD_W * 0.6 + 0.06), rx: 0, rz: Math.PI, ry: Math.PI / 2, s: 0.6 };
  }

  // The hand's card size and centre. A wide screen shares the hand's row with the
  // chips on its left and the page's button on its right, so the cards sit
  // between the two, centred when they fit and smaller when they don't.
  handRow(count) {
    const L = this.L;
    const n = Math.max(count, 1);
    const sizeFor = room => Math.max(0.5, Math.min(L.handCard, (room / n - 0.12) / CARD_W));
    if (L.tall) return { s: sizeFor(10.4), centre: 0 };
    const chips = this.handChipStacks().length;
    const left = -(LANE_X[2] + LANE_W / 2) + 0.1 + (chips ? chips * (L.chipR * 2 + 0.15) + 0.15 : 0);
    // The button's left edge, from page pixels back onto the board at the hand's depth.
    const [x0] = this.toScreen(0, 0.22, L.hand);
    const perUnit = this.toScreen(1, 0.22, L.hand)[0] - x0;
    const right = Math.min(LANE_X[2] + LANE_W / 2, perUnit > 0 ? (this.host.clientWidth - this.reserve - 12 - x0) / perUnit : Infinity);
    const s = sizeFor(Math.min(7.4, right - left));
    const half = (n * (CARD_W * s + 0.12) - 0.12) / 2;
    return { s, centre: Math.min(Math.max(0, left + half), right - half) };
  }

  /** px at the bottom right that the page's button covers; the hand keeps out of it. */
  setReserve(px) {
    if (Math.abs(px - this.reserve) < 1) return;
    this.reserve = px;
    if (this.board) this.place();
  }

  place(instant = false) {
    for (const entry of [...this.cards, ...this.chips]) {
      if (entry.kind === 'card') this.paint(entry);
      if (entry === this.drag?.entry || entry.breaking) continue;
      const to = this.spot(entry);
      if (entry.outline) entry.outline.visible = entry === this.selected;
      if (entry.ring) entry.ring.visible = entry === this.selected;
      const { group } = entry;
      const s = to.s ?? 1;
      const key = `${this.laneOf(entry)}:${entry.hidden}`;
      const wasHidden = entry.landed?.endsWith(':true') && !entry.hidden;
      const moved = entry.landed !== key;
      entry.landed = key;
      if (instant || this.reducedMotion) {
        gsap.killTweensOf(group.position);
        group.position.set(to.x, to.y, to.z);
        group.rotation.set(to.rx, to.ry ?? 0, to.rz);
        group.scale.setScalar(s);
        continue;
      }
      // Somewhere new: a low arc and a settle (or a high hop when flipping face-up so edges clear the floor).
      const time = moved ? 0.5 : 0.35;
      const liftH = wasHidden ? Math.max(0.95, 0.72 * s) : 0.35;
      gsap.to(group.position, { x: to.x, z: to.z, duration: time, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
      if (moved && this.laneOf(entry) != null) {
        const peakY = Math.max(group.position.y, to.y) + liftH;
        gsap.to(group.position, {
          keyframes: [
            { y: peakY, duration: time * 0.42, ease: 'power2.out' },
            { y: to.y, duration: time * 0.58, ease: 'power3.out' },
          ],
          onUpdate: this.mark,
          overwrite: 'auto',
        });
      } else {
        gsap.to(group.position, { y: to.y, duration: time, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
      }
      gsap.to(group.rotation, { x: to.rx, y: to.ry ?? 0, z: to.rz, duration: moved ? 0.55 : 0.35, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
      gsap.to(group.scale, { x: s, y: s, z: s, duration: time, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
    }
    this.tintLanes();
    this.mark();
    this.emitChip();
    this.emitCard();
  }

  room(lane) {
    return this.slots.filter(slot => slot === lane).length < LANE_CAP;
  }

  // The hand card or chip picked to be tapped onto a lane, if any.
  picked() {
    const pick = this.selected;
    // A placed card can be picked too: tapping a lane moves it there, exactly as a hand card.
    return pick && this.canMove(pick) ? pick : null;
  }

  // What a held or picked hand card or chip would add to a lane's bar, shown
  // before it lands: { value, text }, value being the points it adds.
  preview(lane) {
    if (this.phase !== 'place') return null;
    const pick = this.drag?.entry ?? this.picked();
    if (!pick || this.laneOf(pick) === lane) return null;
    if (pick.kind === 'chip') {
      if (this.drag && this.hot !== lane) return null;
      const side = { roster: this.game.you, slots: this.slots, maps: this.game.maps };
      // The chip would take this lane's place, so it is measured with the others but none here.
      const others = this.yourTactics().filter(chip => chip.lane !== lane && chip.card !== this.game.tactics[pick.index]);
      const plain = sideScores({ ...side, tactics: others })[lane];
      const scored = sideScores({ ...side, tactics: [...others, { lane, card: this.game.tactics[pick.index] }] })[lane];
      const tactic = scored.steps.find(step => step.key === 'tactic');
      if (!tactic) return null;
      return { value: tactic.total - plain.total, text: `×${tactic.value}`, total: tactic.total };
    }
    if (pick.kind !== 'card' || (this.drag ? this.hot !== lane : !this.room(lane))) return null;
    const value = pick.card.stats[this.game.maps[lane].stat];
    return { value, text: `+${value}` };
  }

  // ── scores ───────────────────────────────────────────────────────────────

  /** Your chips on lanes, one per lane at most: [{ lane, card }]. */
  yourTactics() {
    return Object.entries(this.tacticLane).map(([index, lane]) => ({ lane, card: this.game.tactics[index] }));
  }

  scoreBoard(slots = this.slots, oppSlots = this.oppPlan.slots) {
    const { maps, you, them } = this.game;
    return resolveBoard({
      maps,
      you: { roster: you, slots, tactics: this.yourTactics() },
      them: { roster: them, slots: oppSlots, tactics: this.oppPlan.tactics },
    });
  }

  // What each lane's bar shows: while placing, your own score and a hidden enemy;
  // after the reveal, the real board with auras; while resolving, the steps so far.
  laneView(lane) {
    if (this.shown) return this.shown[lane];
    if (this.phase === 'place') {
      const mine = sideScores({ roster: this.game.you, slots: this.slots, maps: this.game.maps, tactics: this.yourTactics() })[lane];
      return { mine, theirs: null };
    }
    const board = this.scoreBoard();
    return { mine: board.lanes[lane].mine, theirs: board.lanes[lane].theirs };
  }

  // How a lane's bar splits right now: the totals, your share and any preview.
  barLayout(lane) {
    const view = this.laneView(lane);
    const preview = this.preview(lane);
    const you = view.mine.total;
    const them = view.theirs?.total ?? null;
    const share = them == null ? (you ? 0.8 : 0.5) : you + them ? you / (you + them) : 0.5;
    return { ...view, you, them, share, preview };
  }

  /**
   * Where a chip rests on a lane: over the middle of the score bar, straight
   * above the multiplier block of `kind` it added in its side's row, which
   * keeps its number in view below. Until that lands, above the end of the row
   * as it fills.
   */
  barSpot(lane, side, kind = 'tactic') {
    const L = this.L;
    const { mine, theirs, you, them, share, preview } = this.barLayout(lane);
    const steps = side === 'you' ? mine.steps : theirs?.steps ?? [];
    const width = side === 'you' ? (you ? share : preview != null ? 0.45 : 0) : (them ? 1 - share : 0);
    const from = side === 'you' ? 0 : (them ? share : 1);
    const items = segmentItems(steps);
    const sum = items.reduce((total, item) => total + item.value, 0);
    let at = 1;
    let before = 0;
    for (const item of items) {
      if (item.kind === kind) { at = sum ? (before + item.value / 2) / sum : 1; break; }
      before += item.value;
    }
    const r = L.tall ? 0.36 : 0.27;
    const x0 = this.lanes?.[lane]?.position.x ?? LANE_X[lane];
    const x = Math.min(x0 + PIN_HW - r, Math.max(x0 - PIN_HW + r, x0 - PIN_HW + (from + width * at) * PIN_HW * 2));
    return { x, y: 0.14, z: L.bar, rx: CHIP_TILT * 0.4, rz: 0, s: r };
  }

  // Chips on bars follow their multiplier as the bar fills and reflows.
  syncBarChips() {
    const sit = (chip, lane, side) => {
      if (!chip || chip === this.drag?.entry || chip.breaking) return;
      const to = this.barSpot(lane, side);
      const key = `${to.x.toFixed(3)}:${to.z.toFixed(3)}`;
      if (chip.barKey === key) return;
      chip.barKey = key;
      gsap.to(chip.group.position, { x: to.x, z: to.z, duration: 0.3, ease: 'power3.out', onUpdate: this.mark, overwrite: 'auto' });
    };
    for (const chip of this.chips) if (this.tacticLane[chip.index] != null) sit(chip, this.tacticLane[chip.index], 'you');
    for (const chip of this.oppChips) sit(chip, chip.lane, 'them');
    // A chip on a lane prints what it pays there; back in hand, the most it can.
    let changed = false;
    const print = (chip, lane, side) => {
      const view = lane == null ? null : this.laneView(lane);
      const steps = side === 'you' ? view?.mine.steps : view?.theirs?.steps;
      const step = steps?.find(item => item.key === 'tactic');
      changed = printChip(chip, step ? `×${step.value}` : chip.info.headline) || changed;
    };
    for (const chip of this.chips) print(chip, this.tacticLane[chip.index] ?? null, 'you');
    for (const chip of this.oppChips) print(chip, chip.lane, 'them');
    if (changed) this.mark();
  }

  // The enemy chips turn up at lock in with their five, each dropping onto its lane's bar.
  revealOppChips() {
    if (this.oppChips.length) return;
    for (const tactic of this.oppPlan.tactics ?? []) {
      const chip = makeChip(tactic.card.key, -1);
      chip.kind = 'oppChip';
      chip.lane = tactic.lane;
      chip.group.traverse((node) => { if (node.isMesh) { node.userData.sharedGeometry = true; node.castShadow = true; } });
      const to = this.barSpot(tactic.lane, 'them');
      chip.barKey = null;
      chip.group.position.set(to.x, this.reducedMotion ? to.y : to.y + 1.6, to.z);
      chip.group.rotation.set(to.rx, 0, to.rz);
      chip.group.scale.setScalar(to.s);
      this.board.add(chip.group);
      this.oppChips.push(chip);
      if (!this.reducedMotion) gsap.to(chip.group.position, { y: to.y, duration: 0.35, ease: 'bounce.out', onUpdate: this.mark });
    }
    this.mark();
  }

  // The chip a side played on a lane, for effects: yours from the hand, theirs revealed.
  sideChip(side, lane) {
    return side === 'you'
      ? this.chips.find(chip => this.tacticLane[chip.index] === lane) ?? null
      : this.oppChips.find(chip => chip.lane === lane) ?? null;
  }

  // The Second Call that chains into `lane` for a side.
  chainChip(side, lane) {
    const list = side === 'you' ? this.chips.filter(chip => this.tacticLane[chip.index] != null) : this.oppChips;
    return list.find(chip => chip.info?.key === 'calling' && chainLane(side === 'you' ? this.tacticLane[chip.index] : chip.lane) === lane) ?? null;
  }

  barZ(side) {
    const L = this.L;
    return L.bar - L.barH / 2 + L.barH * (side === 'you' ? L.youRow : 1 - L.youRow);
  }

  // ── rules ────────────────────────────────────────────────────────────────

  canMove(entry) {
    if (this.phase === 'place') return entry.side === 'you' || entry.kind === 'chip';
    return this.phase === 'rotate' && entry.kind === 'card' && entry.side === 'you';
  }

  dropOn(entry, lane) {
    if (entry.kind === 'chip') {
      // One chip per lane: a chip dropped on a taken lane sends the one there back to the hand.
      delete this.tacticLane[entry.index];
      if (lane == null) return;
      for (const [index, at] of Object.entries(this.tacticLane)) if (at === lane) delete this.tacticLane[index];
      this.tacticLane[entry.index] = lane;
      return;
    }
    if (this.phase === 'rotate') {
      if (lane == null) return;
      const next = [...this.slots];
      next[entry.i] = lane;
      if (isLegalRotation(this.lockedSlots, next, this.game.you)) this.slots = next;
      return;
    }
    if (lane != null && this.slots[entry.i] !== lane && this.slots.filter(slot => slot === lane).length >= LANE_CAP) return;
    this.slots[entry.i] = lane;
  }

  // ── flow ─────────────────────────────────────────────────────────────────

  lockIn() {
    if (this.phase !== 'place' || !isLegalPlacement(this.slots)) return;
    this.phase = 'reveal';
    this.lockedSlots = [...this.slots];
    this.selected = null;
    playUiSound('lock_in');
    this.emitChip();
    // The hidden enemy cards turn over and fly to their lanes, one after another,
    // and their chips land with them.
    const hidden = this.theirs().filter(card => card.hidden);
    gsap.delayedCall(this.reducedMotion ? 0 : 0.25 + hidden.length * 0.14, () => this.revealOppChips());
    hidden.forEach((card, k) => {
      gsap.delayedCall(this.reducedMotion ? 0 : 0.25 + k * 0.14, () => {
        card.hidden = false;
        playUiSound('flip', k);
        this.place();
      });
    });
    gsap.delayedCall(this.reducedMotion ? 0 : 0.35 + hidden.length * 0.14 + 0.5, () => {
      this.phase = 'rotate';
      playUiSound('rotate_ready');
      this.place();
      this.emit();
    });
    this.place();
    this.emit();
  }

  resolve() {
    if (this.phase !== 'rotate') return;
    this.phase = 'resolve';
    playUiSound('lock_in');
    const { maps, you, them } = this.game;
    const tactics = this.yourTactics();
    const mine = { roster: you, slots: this.lockedSlots, tactics };
    const theirs = { roster: them, slots: this.oppPlan.slots, tactics: this.oppPlan.tactics };
    // Both IGLs answer the same revealed board, so neither sees the other's move.
    const oppSlots = bestRotate({ you: theirs, them: mine, maps });
    this.oppPlan = { ...this.oppPlan, slots: oppSlots };
    const result = resolveBoard({ maps, you: { ...mine, slots: this.slots }, them: { ...theirs, slots: oppSlots } });
    this.shown = maps.map(() => ({ mine: { total: 0, steps: [] }, theirs: { total: 0, steps: [] }, stamp: null }));
    this.revealOppChips();
    this.place();
    this.emit();
    this.timeline = gsap.timeline({
      delay: 0.45,
      onComplete: () => {
        this.phase = 'done';
        this.result = { ...result, tactics, slots: this.slots };
        this.emit();
        this.result = null;
      },
    });
    this.timeline.timeScale(this.reducedMotion ? 20 : 1);
    result.lanes.forEach((laneResult, lane) => this.playLane(laneResult, lane));
  }

  // One lane scores step by step: theirs, then yours; each player's card pops as
  // its number lands, and the bar grows from its segments. Then the verdict.
  playLane(laneResult, lane) {
    const tl = this.timeline;
    const scoreSide = (steps, side) => {
      steps.forEach((step, index) => {
        tl.call(() => {
          this.shown[lane][side === 'you' ? 'mine' : 'theirs'] = { total: step.total, steps: steps.slice(0, index + 1) };
          const other = side === 'you' ? 'them' : 'you';
          const fx = { onUpdate: this.mark };
          const motion = !this.reducedMotion;
          if (step.key === 'player') {
            // The card attacks the bar as its number lands.
            const card = this.cards.find(c => c.side === side && c.card.player === step.label);
            if (card && motion) attack(this.board, card, { barZ: this.barZ(side), color: side === 'you' ? 0x00c8a0 : 0xff4655, ...fx });
            else if (card) gsap.fromTo(card.group.scale, { x: 1.14, y: 1.14, z: 1.14 }, { x: 1, y: 1, z: 1, duration: 0.25, ease: 'power3.out', onUpdate: this.mark });
            playUiSound(side === 'you' ? 'score' : 'score_opp', index + lane * 2);
          } else if (step.key === 'tactic') {
            const chip = this.sideChip(side, lane);
            if (chip && motion) chipFire(this.board, chip, fx);
            playUiSound('tactic_mult', step.value);
          } else if (step.key === 'chain') {
            // Second Call: lightning from the chip to the lane it chains to.
            const chip = this.chainChip(side, lane);
            const to = this.barSpot(lane, side, 'chain');
            if (chip && motion) lightning(this.board, { from: chip.group.position, to, ...fx });
            playUiSound('tactic_mult', step.value);
          } else if (step.key === 'cancelled') {
            // Lock the Map: the other side's lock slams this side's chip and it shatters.
            const chip = this.sideChip(side, lane);
            const lock = this.sideChip(other, lane);
            if (chip && motion) {
              chip.breaking = true;
              lockShatter(this.board, { from: lock?.group.position ?? chip.group.position, chip, color: parseInt(CHIP_BODY[chip.info.tier].slice(1), 16), ...fx });
            }
            playUiSound('skill_aura');
          } else if (step.key === 'disrespect') {
            // No Respect: the other side's chip cuts this side's best card.
            const card = this.cards.find(c => c.side === side && c.card.player === step.player);
            const chip = this.sideChip(other, lane);
            if (chip && motion) chipFire(this.board, chip, { ...fx, color: 0xd8b34c });
            if (card && motion) gsap.delayedCall(0.2, () => slash(this.board, card, fx));
            playUiSound('skill_aura');
          } else if (step.key === 'trick') {
            playUiSound('skill_one_trick');
          } else if (step.key === 'aura') {
            playUiSound('skill_aura');
          } else {
            // rule (Roles +20), teammates (Team +15), country (Nation +8)
            playUiSound('combo', index);
          }
          this.mark();
        }, null, step.key === 'player' ? '+=0.13' : '+=0.24');
      });
    };
    scoreSide(laneResult.theirs.steps, 'them');
    scoreSide(laneResult.mine.steps, 'you');
    tl.call(() => {
      this.shown[lane].verdict = laneResult.winner;
      this.applyLaneVerdict(lane, laneResult.winner, false);
      playUiSound(laneResult.winner === 'you' ? 'lane_win' : 'lane_loss', lane);
      // A lost lane breaks like glass; a won lane charges and rings out.
      if (laneResult.winner === 'them') playGlassShatter(lane);
      else if (laneResult.winner === 'you') playLaneWin(lane);
      this.mark();
    }, null, '+=0.2');
    tl.to({}, { duration: 0.3 });
  }

  applyLaneVerdict(lane, verdict, instant = false) {
    const mesh = this.lanes?.[lane];
    if (!mesh) return;
    if (!verdict) {
      disposeLaneVerdictFx(mesh);
      mesh.userData.top.color.setHex(LANE_DIM);
      return;
    }
    attachLaneVerdictFx(mesh, verdict, {
      len: this.L.len,
      tip: this.L.tip,
      laneIndex: lane,
      reducedMotion: this.reducedMotion,
      instant,
      onUpdate: this.mark,
    });
  }

  skip() {
    if (this.phase === 'resolve' && this.timeline) this.timeline.progress(1);
  }

  emit() {
    this.onState?.({
      phase: this.phase,
      legal: isLegalPlacement(this.slots.filter(slot => slot != null)),
      placed: this.slots.filter(slot => slot != null).length,
      rotated: Boolean(this.lockedSlots?.some((slot, index) => slot !== this.slots[index])),
      moves: this.game ? rotateMoves(this.game.you) : 1,
      result: this.result ?? null,
      layout: this.L.name,
    });
  }

  // The picked hand chip, for the page to show its payout just above it.
  emitChip() {
    const chip = this.selected?.kind === 'chip' ? this.selected : null;
    if (!chip) {
      this.onChipView?.(null);
      return;
    }
    const to = this.spot(chip);
    const [x, y] = this.toScreen(to.x, to.y + to.s + 0.25, to.z);
    this.onChipView?.({ selected: chip.instance.key, anchor: { x, y } });
  }

  // A picked card already on a lane, for the page to show in full where it sits:
  // `at` is the card's centre on screen.
  emitCard() {
    // Any picked card that isn't face down, wherever it is: the page shows what it does.
    const pick = this.selected?.kind === 'card' && !this.selected.hidden ? this.selected : null;
    let view = null;
    if (pick) {
      const lane = this.laneOf(pick);
      view = {
        card: pick.card,
        side: pick.side,
        igl: pick.i === 0,
        lane,
        canMove: this.canMove(pick),
        canReturn: pick.side === 'you' && lane != null && this.phase === 'place',
        live: this.liveSkill(pick),
        lanes: this.game.maps.map(map => ({ name: map.name, stat: map.stat })),
      };
    }
    const was = this.cardView;
    if (view?.card === was?.card && view?.lane === was?.lane && view?.canMove === was?.canMove && view?.canReturn === was?.canReturn && view?.live === was?.live) return;
    this.cardView = view;
    this.onCardView?.(view);
  }


  // The page's "back to hand", lane pick, and close actions for the picked card.
  placePicked(lane) {
    const pick = this.selected;
    if (pick?.kind !== 'card' || !this.canMove(pick)) return;
    this.dropOn(pick, lane);
    playUiSound('drop');
    this.selected = null;
    this.place();
    this.emit();
  }

  unplace() {
    const pick = this.selected;
    if (pick?.kind !== 'card' || this.phase !== 'place') return;
    this.dropOn(pick, null);
    this.selected = null;
    this.place();
    this.emit();
  }

  deselect() {
    this.selected = null;
    this.place();
  }

  // Where the picked card is on screen, for the page's 2.5D tag to dock onto:
  // projects the card's actual 3D top/bottom chevron peaks and its 2.5D tilt/fan angle.
  cardAnchor() {
    const pick = this.selected?.kind === 'card' ? this.selected : null;
    if (!pick) return null;
    const obj = pick.lift ?? pick.group;
    obj.updateWorldMatrix(true, true);
    const pt = (lx, lz) => {
      const v = new Vector3(lx, CARD_T / 2, lz).applyMatrix4(obj.matrixWorld);
      return this.toScreen(v.x, v.y, v.z);
    };
    const topPeak = pt(0, -CARD_H / 2);
    const bottomPeak = pt(0, CARD_H / 2);
    const tl = pt(-CARD_W / 2, -CARD_H / 2 + CARD_TIP);
    const tr = pt(CARD_W / 2, -CARD_H / 2 + CARD_TIP);
    const bl = pt(-CARD_W / 2, CARD_H / 2 - CARD_TIP);
    const br = pt(CARD_W / 2, CARD_H / 2 - CARD_TIP);
    const xs = [topPeak[0], bottomPeak[0], tl[0], tr[0], bl[0], br[0]];
    const ys = [topPeak[1], bottomPeak[1], tl[1], tr[1], bl[1], br[1]];
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const angle = Math.atan2(tr[1] - tl[1], tr[0] - tl[0]) * (180 / Math.PI);
    const inHand = this.laneOf(pick) == null && pick.side === 'you';
    const rx = inHand ? 10 : 15;
    const ry = -(pick.group.rotation.y || 0) * (180 / Math.PI) * 0.65;
    return {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      top,
      bottom,
      left,
      right,
      topPeak: { x: topPeak[0], y: topPeak[1] },
      bottomPeak: { x: bottomPeak[0], y: bottomPeak[1] },
      angle,
      rx,
      ry,
      width: this.host.clientWidth,
      height: this.host.clientHeight,
    };
  }

  // ── input ────────────────────────────────────────────────────────────────

  ray(event) {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  hit(event) {
    this.ray(event);
    const targets = [...this.cards.filter(c => !c.hidden), ...this.chips].map(entry => entry.group);
    const hit = this.raycaster.intersectObjects(targets, true).find(item => item.object.userData.entry);
    return hit?.object.userData.entry ?? null;
  }

  laneUnder(point) {
    const lane = LANE_X.findIndex(x => Math.abs(point.x - x) <= LANE_W / 2);
    return lane >= 0 && Math.abs(point.z) <= this.L.len / 2 ? lane : null;
  }

  setHover(lane) {
    if (lane === this.hoverLane) return;
    this.hoverLane = lane;
    this.tintLanes();
    this.mine().filter(c => this.slots[c.i] == null).forEach(c => this.paint(c));
    this.mark();
  }

  setHot(lane) {
    if (lane === this.hot) return;
    this.hot = lane;
    if (lane != null) playUiSound('lane_hover', lane);
    this.tintLanes();
    if (this.drag?.entry.kind === 'card') this.paint(this.drag.entry);
    this.mark();
  }

  tintLanes() {
    if (this.shown) return;            // after scoring, the lanes keep their verdict
    const lit = this.hot ?? (this.phase === 'place' ? this.hoverLane : null);
    // A picked hand card lights every lane it could be tapped onto.
    const pick = this.drag ? null : this.picked();
    const open = i => pick && (pick.kind === 'chip' || this.phase !== 'place' || this.room(i));
    this.lanes?.forEach((lane, i) => lane.userData.top.color.setHex(i === lit || open(i) ? LANE_LIT : LANE_DIM));
  }

  bind() {
    const el = this.renderer.domElement;
    this.onDown = (event) => {
      const entry = this.hit(event);
      this.press = entry ? { entry, x: event.clientX, y: event.clientY } : null;
    };
    // Any press on the board or its bars, to tell a tap on a lane from a swipe.
    this.onAnyDown = (event) => { this.tapAt = { x: event.clientX, y: event.clientY }; };
    this.onMove = (event) => {
      if (!this.game) return;
      const press = this.press;
      if (press && !this.drag && this.canMove(press.entry) && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP) {
        const { group } = press.entry;
        gsap.killTweensOf(group.position);
        gsap.killTweensOf(group.rotation);
        // Held, a card takes its lane size, so it shows how it will sit there.
        const lift = press.entry.kind === 'chip' ? this.L.chipR * 1.15 : this.L.card * 1.06;
        gsap.to(group.scale, { x: lift, y: lift, z: lift, duration: 0.2, ease: 'power2.out', onUpdate: this.mark, overwrite: 'auto' });
        this.drag = { entry: press.entry, target: null, vx: 0, vz: 0 };
        this.selected = null;
        this.setHover(null);
        playUiSound(press.entry.kind === 'chip' ? 'chip_lift' : 'lift');
        this.place();
      }
      this.ray(event);
      const point = new Vector3();
      const onBoard = this.raycaster.ray.intersectPlane(this.dragPlane, point);
      if (this.drag) {
        if (!onBoard) return;
        this.drag.target = point;
        this.setHot(this.laneUnder(point));
      } else if (event.pointerType !== 'touch' && el.contains(event.target)) {
        this.setHover(onBoard ? this.laneUnder(point) : null);
      }
      const over = this.hit(event);
      el.style.cursor = this.drag ? 'grabbing' : over && this.canMove(over) ? 'grab' : over ? 'pointer' : '';
    };
    this.onUp = (event) => {
      const press = this.press;
      const tapAt = this.tapAt;
      this.press = null;
      this.tapAt = null;
      // A tap off any card, with a card or chip picked: onto the lane under it,
      // or, off the lanes, just let go of the pick.
      if (!press && !this.drag && tapAt && this.selected && Math.hypot(event.clientX - tapAt.x, event.clientY - tapAt.y) <= TAP) {
        const entry = this.selected;
        this.ray(event);
        const point = new Vector3();
        const lane = this.raycaster.ray.intersectPlane(this.floor, point) ? this.laneUnder(point) : null;
        this.selected = null;
        if (lane != null && this.canMove(entry)) {
          this.dropOn(entry, lane);
          playUiSound(entry.kind === 'chip' ? 'chip_drop' : 'drop');
        }
        this.place();
        this.emit();
        return;
      }
      if (this.drag) {
        const { entry } = this.drag;
        this.drag = null;
        this.dropOn(entry, this.hot);
        this.setHot(null);
        playUiSound(entry.kind === 'chip' ? 'chip_drop' : 'drop');
        this.place();
        this.emit();
        return;
      }
      if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP) return;
      const { entry } = press;
      // A chip on a lane goes back to the hand on a tap, while you can still change it.
      if (entry.kind === 'chip' && this.tacticLane[entry.index] != null && this.phase === 'place') {
        delete this.tacticLane[entry.index];
        playUiSound('chip_lift');
        this.place();
        this.emit();
        return;
      }
      this.selected = this.selected === entry ? null : entry;
      playUiSound(entry.kind === 'chip' ? 'chip_lift' : 'select');
      this.place();
    };
    el.addEventListener('pointerdown', this.onDown);
    this.host.addEventListener('pointerdown', this.onAnyDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', () => { if (!this.drag) this.setHover(null); });
  }

  // Every frame while something is held: it eases toward the pointer, leans into
  // its sideways speed and tips with its forward speed.
  step(dt) {
    const drag = this.drag;
    if (!drag?.target) return;
    const { group } = drag.entry;
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

  // ── skills ───────────────────────────────────────────────────────────────

  // Which of a card's skills can act right now, if any. Like Marvel Snap, a card
  // whose power is live says so on itself: it lifts, tips toward you and plays its
  // own effect (SkillFx). Only your cards, and never while one is held or scoring.
  liveSkill(entry) {
    if (entry.side !== 'you' || entry.hidden || entry === this.drag?.entry || !this.game) return null;
    const { card } = entry;
    if (this.phase === 'rotate') {
      if (entry.i === 0 && hasSkill(card, 'mastermind')) return 'mastermind';
      if (hasSkill(card, 'flex')) return 'flex';
    }
    if (this.phase !== 'place' && this.phase !== 'rotate') return null;
    const lane = this.laneOf(entry);
    if (lane == null) return null;
    if (hasSkill(card, 'flick') && this.slots.filter(slot => slot === lane).length === 1) return 'flick';
    const map = this.game.maps[lane];
    if (hasSkill(card, 'one_trick') && card.agents?.length === 1 && map.agents?.includes(card.agents[0])) return 'one_trick';
    if (hasSkill(card, 'aura')) return 'aura';
    return null;
  }

  stepSkills(dt) {
    if (!this.cards?.length) return;
    const motion = this.reducedMotion ? 0 : 1;
    this.skillTime = (this.skillTime ?? 0) + dt;
    let live = false;
    for (const entry of this.cards) {
      const skill = this.liveSkill(entry);
      if (skill !== entry.skill) {
        entry.fx?.dispose();
        entry.fx = skill ? attachSkillFx(entry.lift, skill, { floorParent: entry.group }) : null;
        // The moment a power comes alive, it flares once and plays its signature sound.
        if (skill) {
          entry.fx?.burst();
          playUiSound(`skill_${skill}`);
        }
        if (entry === this.selected) this.emitCard();
        entry.skill = skill;
      }
      const target = skill ? 0.6 : 0;
      const before = entry.liftAmount ?? 0;
      entry.liftAmount = before + (target - before) * Math.min(1, dt * 8);
      if (entry.liftAmount > 0.002 || before > 0.002) {
        readyPose(entry.lift, this.skillTime + entry.i, entry.liftAmount * (motion || 0.4));
        live = true;
      }
      if (entry.fx) {
        // Ground effects sit on the lane's surface (y 0), whatever height the card is at.
        entry.fx.floor.position.y = (0.004 - entry.group.position.y) / (entry.group.scale.y || 1);
        entry.fx.update(dt * (motion || 0.25));
        live = true;
      }
    }
    for (const lane of this.lanes ?? []) {
      if (lane.userData?.verdictFx?.update(dt)) live = true;
    }
    if (live) this.mark();
  }

  // ── view ─────────────────────────────────────────────────────────────────

  // Frames the board as tightly as the screen allows: close enough that the
  // content fills the space between the page's top and bottom bars, then
  // shifted so it sits centred in that space rather than under the bars.
  fit() {
    const W = this.host.clientWidth;
    const H = this.host.clientHeight;
    if (!W || !H) return;
    const { halfW, zNear, zFar } = this.L;
    const tanV = Math.tan((FOV / 360) * Math.PI);
    const free = Math.max(0.4, (H - this.inset.top - this.inset.bottom) / H);
    const halfDepth = ((zNear - zFar) / 2) * Math.sin(PITCH) + 0.2;
    const d = Math.max(halfW / (tanV * this.camera.aspect), halfDepth / (tanV * free)) * 1.02;
    const target = new Vector3(0, 0, (zNear + zFar) / 2);
    this.view = { target, d };
    this.placeCamera();
    this.camera.setViewOffset(W, H, 0, (this.inset.bottom - this.inset.top) / 2, W, H);
    // The shadow box covers whatever the layout spans.
    const reach = Math.max(halfW, (zNear - zFar) / 2 + Math.abs(target.z)) + 1;
    Object.assign(this.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.mark();
  }

  // The camera sits on the board's framing (`this.view`), raised by `this.lift`:
  // 0 is the playing view; 1 is high overhead, looking straight down, turned a
  // little. The match intro lowers it from 1 to 0 while the first round deals.
  placeCamera() {
    if (!this.view) return;
    const { target, d } = this.view;
    const t = this.lift ?? 0;
    const pitch = PITCH + (DROP_PITCH - PITCH) * t;
    const dist = d * (1 + DROP_HEIGHT * t);
    const yaw = DROP_YAW * t;
    const flat = Math.cos(pitch) * dist;
    this.camera.position.set(target.x + Math.sin(yaw) * flat, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * flat);
    this.camera.lookAt(target);
    this.camera.near = Math.max(0.5, dist * 0.5);
    this.camera.far = dist * 2 + 20;
    this.camera.updateProjectionMatrix();
    this.mark();
  }

  /** Raise the camera now, so the next deal lowers it into place (the match intro). */
  raiseForDrop() {
    if (this.reducedMotion) return;
    this.dropPending = true;
    gsap.killTweensOf(this, 'lift');
    this.lift = 1;
    this.placeCamera();
  }

  dropCamera() {
    this.dropPending = false;
    gsap.to(this, { lift: 0, duration: DROP_SECONDS, ease: 'power3.inOut', onUpdate: () => this.placeCamera() });
  }

  /** A tap during the intro: land the camera at once. */
  skipDrop() {
    this.dropPending = false;
    gsap.killTweensOf(this, 'lift');
    this.lift = 0;
    this.placeCamera();
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h || !this.renderer) return;
    this.renderer.setSize(w, h);
    this.softFocus?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const was = this.L?.name;
    this.L = this.pickLayout(w, h);
    this.fit();
    // Perspective shrinks the far end, so the first guess at the stretch leaves
    // a gap: measure what the lanes really cover on screen and grow them into it.
    const free = h - this.inset.top - this.inset.bottom;
    for (let pass = 0; pass < 4; pass += 1) {
      const used = this.toScreen(0, 0, this.L.zNear)[1] - this.toScreen(0, 0, this.L.zFar)[1];
      const gap = free - used;
      const base = LAYOUTS[this.L.name];
      const f = Math.min(base.stretch, this.L.len / base.len + ((gap / used) * (this.L.zNear - this.L.zFar)) / base.len);
      if (gap < 4 || f <= this.L.len / base.len + 0.005) break;
      this.L = this.layout(this.L.name, f);
      this.fit();
    }
    this.overlay.dataset.layout = this.L.name;
    if (this.board) {
      if (Math.abs(this.builtLen - this.L.len) > 0.01) this.buildLanes();
      this.place(true);
      if (was !== this.L.name) this.emit();
    }
    this.emitChip();
  }

  toScreen(x, y, z) {
    const v = new Vector3(x, y, z).project(this.camera);
    return [((v.x + 1) / 2) * this.host.clientWidth, ((1 - v.y) / 2) * this.host.clientHeight];
  }

  // Lays a flat w×h box onto a lane, edge to edge, centred at z: its corners are
  // pinned to a rectangle on the lane's surface, so it sits in the board's perspective.
  pin(el, lane, z, [w, h]) {
    const hz = (PIN_HW * h) / w;
    const x = this.lanes?.[lane]?.position.x ?? LANE_X[lane];
    const corners = [[x - PIN_HW, z - hz], [x + PIN_HW, z - hz], [x + PIN_HW, z + hz], [x - PIN_HW, z + hz]];
    el.style.transform = quadTransform(w, h, corners.map(([px, pz]) => this.toScreen(px, 0.01, pz)));
  }

  // Pins the headers and score bars to their lanes and fills the bars from the score's steps.
  pinLabels() {
    if (!this.labels) return;
    const L = this.L;
    const [hw, hh] = BOX[L.name].head;
    this.heads.forEach((head, lane) => this.pin(head, lane, -L.len / 2 + (PIN_HW * hh) / hw, [hw, hh]));
    this.labels.forEach(({ bar }, lane) => {
      this.pin(bar, lane, L.bar, BOX[L.name].bar);
      const preview = this.preview(lane);
      // On a phone each card's number shows only while it matters: held, aimed at, or scoring.
      bar.toggleAttribute('data-open', Boolean(this.shown || this.hold === lane || this.hot === lane || preview != null));
      const { mine, theirs, stamp, you, them, share } = this.barLayout(lane);
      const [themRow, tug, youRow, stampEl] = bar.children;
      const [youFill, themFill, youN, themN, split] = tug.children;
      youFill.style.width = you ? `${share * 100}%` : '0';
      themFill.style.width = them ? `${(1 - share) * 100}%` : '0';
      // A held chip shows where the lane's total would land.
      youN.textContent = preview?.total != null ? `${you} → ${preview.total}` : you;
      if (!you) youN.dataset.empty = '';
      else delete youN.dataset.empty;
      themN.textContent = them ?? '?';
      split.style.left = `${share * 100}%`;
      split.hidden = them == null || !you;
      stampEl.textContent = stamp ?? '';
      stampEl.dataset.won = stamp === 'WON' ? 'true' : 'false';
      this.segments(youRow, mine.steps, you ? share : preview != null ? 0.45 : 0, 0, preview);
      this.segments(themRow, theirs?.steps ?? [], them ? 1 - share : 0, them ? share : 1);
    });
    this.syncBarChips();
    this.floatBarChips();
  }

  /**
   * The score bars are page elements over the canvas, so a chip on a lane is
   * drawn on a layer above them: a small lit chip (the shared chip renderer)
   * that follows the board chip, which stays in the scene, hidden, for taps,
   * drags and the scoring tweens to move.
   */
  floatBarChips() {
    for (const chip of [...this.chips, ...this.oppChips]) {
      const onBar = (chip.kind === 'oppChip' || this.tacticLane[chip.index] != null) && chip !== this.drag?.entry;
      if (onBar && !chip.floatEl) {
        const el = document.createElement('div');
        el.className = styles.barChip;
        const canvas = document.createElement('canvas');
        el.appendChild(canvas);
        this.overlay.appendChild(el);
        chip.floatEl = el;
        chip.floatView = createChipView(canvas, chip.key, { reducedMotion: this.reducedMotion, phase: chip.index ?? 2, lean: 0.35 });
      }
      if (!chip.floatEl) continue;
      // Without a second WebGL context, the board chip simply stays visible.
      const floating = onBar && Boolean(chip.floatView);
      chip.group.visible = !floating;
      chip.floatEl.hidden = !floating;
      if (!floating) continue;
      const { x, y, z } = chip.group.position;
      const [sx, sy] = this.toScreen(x, y, z);
      const [ex] = this.toScreen(x + chip.group.scale.x, y, z);
      const size = Math.max(1, Math.abs(ex - sx) * 2 * 1.32);
      chip.floatEl.style.width = `${size}px`;
      chip.floatEl.style.height = `${size}px`;
      chip.floatEl.style.transform = `translate(${sx - size / 2}px, ${sy - size / 2}px)`;
      chip.floatView.print(chip.printed);
    }
  }

  dropFloat(chip) {
    chip.floatView?.destroy();
    chip.floatEl?.remove();
    chip.floatView = null;
    chip.floatEl = null;
  }

  segments(row, steps, width, from, preview = null) {
    row.style.width = `${width * 100}%`;
    row.style.marginLeft = `${from * 100}%`;
    const items = [...segmentItems(steps), ...(preview ? [{ ...preview, ghost: true }] : [])];
    const key = items.map(item => `${item.text}${item.cut ? '/' : ''}`).join();
    if (row.dataset.key === key) return;
    row.dataset.key = key;
    row.replaceChildren(...items.map((item) => {
      const seg = document.createElement('span');
      // A preview is never narrower than its own text, so "×1.5" always reads.
      seg.style.flex = item.ghost ? `${item.value} 0 auto` : `${item.value} 1 0`;
      seg.textContent = item.text;
      if (item.solid) seg.dataset.solid = '';
      if (item.outline) seg.dataset.outline = '';
      if (item.ghost) seg.dataset.ghost = '';
      if (item.cut) seg.dataset.cut = '';
      return seg;
    }));
  }

  render() {
    if (!this.dirty || !this.renderer || !this.game) return;
    this.dirty = false;
    if (this.arena?.root.visible) {
      if (!this.softFocus) {
        this.softFocus = createSoftFocus(this.renderer);
        this.softFocus.setSize(this.host.clientWidth, this.host.clientHeight);
      }
      this.softFocus.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.pinLabels();
  }

  // The arena lives on the scene, not the board, so it stays put between rounds
  // on the same map and only swaps when the map changes.
  async syncArena(mapName) {
    const want = this.arenaPalette !== 'off' && ARENAS[mapName] ? mapName : null;
    if (this.arena && this.arena.name !== want) {
      gsap.killTweensOf(this.arena.root.position);
      this.arena.dispose();
      this.arena = null;
    }
    if (want && !this.arena) {
      this.arenaLoading = want;
      this.syncGround();
      const arena = await loadArena(want, this.arenaPalette).catch(() => null);
      if (!this.alive || this.arenaLoading !== want || !arena) { arena?.dispose(); return; }
      this.arenaLoading = null;
      this.arena = arena;
      this.scene.add(arena.root);
      this.arenaIn();
    }
    this.syncGround();
    this.mark();
  }

  // The plain floor shows only when there is no arena and none on its way.
  syncGround() {
    if (this.ground) this.ground.visible = !this.arena && !this.arenaLoading;
  }

  // Map change: the old set flies out left with the lanes...
  arenaOut() {
    const { arena } = this;
    if (!arena || this.reducedMotion) return Promise.resolve();
    this.arenaSliding = true;
    return new Promise((resolve) => {
      gsap.to(arena.root.position, { x: -ARENA_SHIFT, duration: 0.3, ease: 'power2.in', onUpdate: this.mark, onComplete: resolve });
    });
  }

  // ...and the new one flies in from the right as the new lanes do. The first
  // arena of a series is simply there, like the first lanes.
  arenaIn() {
    const { arena } = this;
    if (!this.arenaSliding || this.reducedMotion) return;
    this.arenaSliding = false;
    arena.root.position.x = ARENA_SHIFT;
    gsap.to(arena.root.position, { x: 0, duration: 0.42, delay: 0.045, ease: 'power3.out', onUpdate: this.mark });
  }

  setArena(palette) {
    this.arenaPalette = palette;
    if (palette !== 'off' && this.arena) {
      this.arena.setPalette(palette);
      this.mark();
      return;
    }
    if (palette === 'off') this.arenaLoading = null;
    this.syncArena(this.game?.mapName);
  }

  destroy() {
    this.alive = false;
    gsap.killTweensOf(this);
    if (this.arena) gsap.killTweensOf(this.arena.root.position);
    this.arena?.dispose();
    this.softFocus?.dispose();
    gsap.ticker.remove(this.tick);
    this.observer?.disconnect();
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.host.removeEventListener('pointerdown', this.onAnyDown);
    this.clear();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.overlay?.remove();
  }
}
