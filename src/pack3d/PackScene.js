// The 3D card pack: one shared model, foil per pack type, tilt that follows the pointer.
//
// Kept cheap on purpose. It only redraws while something is moving, caps sharpness
// on dense screens, and draws its art on canvases instead of downloading images.
// Glitter and holo film are part of the surface, so they flash as the pack turns
// and nothing has to animate on its own.
//
// Tearing: drag across the top and the strip peels off along the tear line (the shapes
// are in packTear.js). Torn free, it hangs from the pointer and flies off the way it was
// thrown. Then the mouth bows open and the cards rise out of it. A tap tears it for you.

import {
  ACESFilmicToneMapping, BackSide, CanvasTexture, DirectionalLight, DoubleSide, Group, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, PMREMGenerator, PerspectiveCamera, PlaneGeometry,
  Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { gsap } from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { assetPath } from '../../shared/src/lib/utils';
import { playUiSound } from '../../shared/src/lib/gameAudio';
import { packArt } from './packArt';
import { HALF_H, HALF_W, TEAR_Y, curlStrip, openMouth } from './packTear';

const MODEL = '/assets/pack3d/pack.glb';
const MAX_TILT_X = 0.32;
const MAX_TILT_Y = 0.5;
const EASE = 0.12;
const FOV = 28;
const PACK_H = HALF_H * 2;
const TAP = 6;              // px of travel before a press counts as a pull
const GRAVITY = 7;          // model units per second squared, for the strip in flight
const CARDS = [[0.36, -0.07, 0.014], [0.3, 0, 0], [0.24, 0.07, -0.014]];   // rise, lean, depth

let modelPromise = null;
function loadModel() {
  modelPromise ??= new GLTFLoader().loadAsync(assetPath(MODEL));
  return modelPromise;
}

function texture(canvas, color) {
  const map = new CanvasTexture(canvas);
  if (color) map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  map.flipY = false;   // glTF UVs put the art's top at v = 1
  return map;
}

// The inside of the bag is bare silver film, cut to the same serrated outline as the print.
const insides = new WeakMap();
function insideOf(color) {
  if (!insides.has(color)) {
    const el = document.createElement('canvas');
    el.width = color.width;
    el.height = color.height;
    const ctx = el.getContext('2d');
    ctx.drawImage(color, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#c3c7ce';
    ctx.fillRect(0, 0, el.width, el.height);
    insides.set(color, el);
  }
  return insides.get(color);
}

// The back of a card waiting in the pack: the card's own cut outline, plain and dark.
function cardBack() {
  const el = document.createElement('canvas');
  el.width = 256;
  el.height = 370;
  const ctx = el.getContext('2d');
  const outline = (inset) => {
    const w = el.width - inset * 2;
    const h = el.height - inset * 2;
    ctx.beginPath();
    [[0, 0.07], [0.5, 0], [1, 0.07], [1, 0.93], [0.5, 1], [0, 0.93]]
      .forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](inset + x * w, inset + y * h));
    ctx.closePath();
  };
  ctx.fillStyle = '#1b1e27';
  outline(0);
  ctx.fill();
  ctx.fillStyle = '#242835';
  outline(14);
  ctx.fill();
  ctx.fillStyle = '#3a3f4e';
  ctx.font = '800 44px "Familjen Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VFL', el.width / 2, el.height / 2);
  return texture(el, true);
}

export default class PackScene {
  /**
   * fit: how much of the host's height the pack fills, so a host can be larger than
   * the pack and leave the torn strip room to fly. pointerTarget: what tilts the pack.
   * onOpened: called once the cards have come out.
   */
  constructor(host, { reducedMotion = false, onFail, onOpened, fit = 0.83, pointerTarget = host } = {}) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.onFail = onFail;
    this.onOpened = onOpened;
    this.fit = fit;
    this.pointerTarget = pointerTarget;
    this.last = 0;
    this.shake = { x: 0, vx: 0, z: 0, vz: 0 };
    this.tweens = [];
    this.speed = 1;
    this.tearState();
    this.target = new Vector2();
    this.tilt = new Vector2();
    this.flip = 0;
    this.flipTarget = 0;
    this.frame = 0;
    this.visible = true;
    this.stats = { triangles: 0, ms: 0 };
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
    renderer.toneMappingExposure = 0.82;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    this.host.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.onFail?.(); });

    this.scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();
    this.camera = new PerspectiveCamera(FOV, 1, 0.1, 40);
    this.camera.position.set(0, 0, (PACK_H / this.fit) / (2 * Math.tan((FOV / 360) * Math.PI)));
    this.key = new DirectionalLight(0xffffff, 1.6);
    this.scene.add(this.key);

    const gltf = await loadModel();
    // A clone per scene, so two packs on one page never fight over one object.
    this.pack = gltf.scene.clone(true);
    this.scene.add(this.pack);
    this.meshes = [];
    this.pack.traverse((node) => { if (node.isMesh) this.meshes.push(node); });
    this.stats.triangles = this.meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    this.setupTear();

    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.visibility = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.wake(); });
    this.visibility.observe(this.host);
    this.onMove = (event) => {
      if (this.drag || this.torn.phase !== 'closed') return;   // a hand holding the pack, not tilting it
      const box = this.pointerTarget.getBoundingClientRect();
      this.target.set(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
      this.wake();
    };
    this.onLeave = () => { if (!this.drag) { this.target.set(0, 0); this.wake(); } };
    this.pointerTarget.addEventListener('pointermove', this.onMove);
    this.pointerTarget.addEventListener('pointerleave', this.onLeave);
    return true;
  }

  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.wake();
  }

  /** Dress the pack as a type, with an optional cover from packCover.pickCover. */
  async setType(type, cover = null) {
    const request = {};
    this.request = request;
    this.type = type;
    const [frontArt, backArt] = await Promise.all([packArt(type, 'front', cover), packArt(type, 'back')]);
    if (this.request !== request) return;
    const make = (art) => {
      const orm = texture(art.orm);
      const material = new MeshPhysicalMaterial({
        map: texture(art.color, true),
        roughnessMap: orm,
        metalnessMap: orm,
        normalMap: texture(art.normal),
        normalScale: new Vector2(0.55, 0.55),
        roughness: 1,
        metalness: 1,
        clearcoat: type.foil.clearcoat,
        clearcoatRoughness: 0.18,
        iridescence: type.foil.iridescence,
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [120, 480],
        envMapIntensity: 0.85,
        // The art's alpha cuts the serrated crimp edges out of the silhouette.
        alphaTest: 0.5,
      });
      if (art.holo) {
        // Film only where the holo map allows it, its thickness drifting across the pack.
        const holo = texture(art.holo);
        material.iridescenceMap = holo;
        material.iridescenceThicknessMap = holo;
        material.iridescenceThicknessRange = [100, 900];
      }
      return material;
    };
    const materials = { PackFront: make(frontArt), PackBack: make(backArt) };
    const inside = art => new MeshPhysicalMaterial({
      map: texture(insideOf(art.color), true),
      metalness: 1,
      roughness: 0.34,
      envMapIntensity: 0.9,
      side: BackSide,
      alphaTest: 0.5,
      // Where the two sheets meet at the seals, the outside always wins.
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
    const insideMaterials = { PackFront: inside(frontArt), PackBack: inside(backArt) };
    for (const inner of this.inners) {
      this.disposeMaterial(inner.material);
      inner.material = insideMaterials[inner.userData.sheet];
    }
    for (const mesh of this.meshes) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map(material => materials[material.name] ?? material);
      for (const old of list) if (!next.includes(old)) this.disposeMaterial(old);
      next.forEach((material, i) => { material.name = list[i].name; });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    }
    this.wake();
  }

  disposeMaterial(material) {
    if (this.disposed?.has(material)) return;
    (this.disposed ??= new WeakSet()).add(material);
    for (const key of ['map', 'roughnessMap', 'normalMap', 'iridescenceMap']) material[key]?.dispose();
    material.dispose();
  }

  showBack(back) {
    this.flipTarget = back ? Math.PI : 0;
    this.wake();
  }

  // ── tearing ──────────────────────────────────────────────────────────────

  tearState() {
    // phase: closed, tearing (partly torn), free (strip off), open (cards out)
    this.torn = { phase: 'closed', progress: 0, dir: 0, pull: 0, radius: 0.1, roll: 1.3, lift: 0.04, flutter: 0, open: 0, lean: 0 };
    this.flight = null;
  }

  setupTear() {
    const keep = (mesh) => {
      // Each scene bends its own copy, so two packs on a page never share a tear.
      mesh.geometry = mesh.geometry.clone();
      mesh.userData.base = mesh.geometry.attributes.position.array.slice();
      mesh.userData.normals = mesh.geometry.attributes.normal.array.slice();
      mesh.userData.sheet = [].concat(mesh.material)[0].name;
    };
    this.strip = this.pack.getObjectByName('Strip');
    this.body = this.pack.getObjectByName('Body');
    this.stripMeshes = [];
    this.bodyMeshes = [];
    this.strip?.traverse((node) => { if (node.isMesh) { keep(node); this.stripMeshes.push(node); } });
    this.body?.traverse((node) => { if (node.isMesh) { keep(node); this.bodyMeshes.push(node); } });
    // A second skin on the inside of every sheet, sharing its shape, that only shows from behind.
    this.inners = this.meshes.map((mesh) => {
      const inner = new Mesh(mesh.geometry, new MeshStandardMaterial({ visible: false }));
      inner.userData.sheet = mesh.userData.sheet;
      mesh.add(inner);
      return inner;
    });
    // The strip flies about its own middle once it is free.
    this.stripPivot = new Group();
    this.pack.add(this.stripPivot);
    if (this.strip) this.stripPivot.add(this.strip);
    // The cards waiting inside, hidden until the mouth opens.
    const back = cardBack();
    const geometry = new PlaneGeometry(0.72, 1.04);
    this.cards = CARDS.map(([, , depth]) => {
      const card = new Mesh(geometry, new MeshStandardMaterial({ map: back, roughness: 0.8, metalness: 0, envMapIntensity: 0.35, side: DoubleSide, alphaTest: 0.5 }));
      card.position.set(0, TEAR_Y - 0.1 - 0.52, depth);
      card.userData.rest = card.position.clone();
      card.visible = false;
      this.pack.add(card);
      return card;
    });
  }

  kick(x, z) {
    if (this.reducedMotion) return;
    this.shake.vx += x;
    this.shake.vz += z;
    this.wake();
  }

  track(tween) {
    this.tweens = this.tweens.filter(item => item.isActive());
    this.tweens.push(tween.timeScale(this.speed));
    return tween;
  }

  /** Slow motion for the look test: 1 is real time. */
  setSpeed(speed) {
    this.speed = speed;
    this.tweens.forEach(tween => tween.timeScale(speed));
  }

  /** Width of the tear line on screen, in px, so a drag maps onto it one to one. */
  tearSpan() {
    if (!this.pack) return 1;
    const box = this.renderer.domElement.getBoundingClientRect();
    const toScreen = x => new Vector3(x, TEAR_Y, 0).applyMatrix4(this.pack.matrixWorld).project(this.camera).x * box.width / 2;
    return Math.max(40, Math.abs(toScreen(HALF_W) - toScreen(-HALF_W)));
  }

  /** Model units per screen pixel, where the pack stands. */
  unitsPerPixel() {
    const height = this.renderer.domElement.getBoundingClientRect().height || 1;
    return (2 * this.camera.position.z * Math.tan((FOV / 360) * Math.PI)) / height;
  }

  /** Tear to `progress` (0..1). `pull` (0..1) is how hard the strip is pulled up. */
  tearTo(progress, pull = this.torn.pull) {
    const t = this.torn;
    if (t.phase === 'free' || t.phase === 'open') return;
    t.dir ||= 1;
    const next = Math.min(1, Math.max(t.progress, progress));
    if (Math.floor(next * 8) > Math.floor(t.progress * 8)) {
      playUiSound('rattle', Math.floor(next * 8));   // the foil crackles as it goes
      this.kick(-0.25, t.dir * 0.35);
    }
    t.progress = next;
    t.pull = Math.min(1, Math.max(0, pull));
    if (next > 0) t.phase = 'tearing';
    // The further it goes and the harder it is pulled, the tighter the foil rolls.
    t.radius = (0.1 - 0.04 * next) * (1 - 0.3 * t.pull);
    t.roll = Math.min(2.9, 1.3 + 1.4 * next + 0.5 * t.pull);
    t.lift = 0.04 + 0.12 * next + 0.3 * t.pull;
    this.dirty = true;
    if (next >= 1) this.detach();
    this.wake();
  }

  /** Let go mid tear: the torn part relaxes but stays torn. */
  relax() {
    const t = this.torn;
    if (t.phase !== 'tearing') return;
    t.pull = 0;
    this.track(gsap.to(t, {
      radius: 0.12 - 0.03 * t.progress, roll: 1 + 1.1 * t.progress, lift: 0.03 + 0.06 * t.progress,
      duration: 0.5, ease: 'elastic.out(1, 0.45)', onUpdate: () => { this.dirty = true; this.wake(); },
    }));
  }

  /** The tear reaches the far edge and the strip comes off. */
  detach() {
    const t = this.torn;
    t.phase = 'free';
    playUiSound('pack_open');
    this.kick(-1.4, t.dir * 0.9);   // the pack jolts as the strip lets go
    this.bendStrip(0);
    // Pivot about the strip's own middle, wherever the curl left it.
    const { geometry } = this.stripMeshes[0];
    geometry.computeBoundingBox();
    const centre = geometry.boundingBox.getCenter(new Vector3());
    this.stripPivot.position.copy(centre);
    this.strip.position.copy(centre).negate();
    this.flight = { rest: centre.clone(), velocity: new Vector3(), spin: new Vector3(), held: !!this.drag, age: 0 };
    // Foil springs half back from the tight curl, and flutters as it goes.
    this.track(gsap.to(t, { radius: 0.32, roll: 1.1, lift: 0.1, flutter: 1, duration: 0.7, ease: 'elastic.out(1, 0.5)' }));
    if (!this.drag) this.fling(t.dir * 1.6, 2.6);
  }

  /** Throw the free strip, in model units per second. A dead drop still gets tossed. */
  fling(vx, vy) {
    const f = this.flight;
    if (!f || f.thrown) return;
    const speed = Math.hypot(vx, vy);
    const k = speed < 1.6 ? 1.6 / Math.max(speed, 0.01) : 1;
    const dir = this.torn.dir;
    f.held = false;
    f.thrown = true;
    f.velocity.set(speed < 0.3 ? dir * 1.2 : vx * k, (speed < 0.3 ? 2.4 : vy * k) + 0.6, 0.8);
    f.spin.set(-2.2, dir * 1.8, -dir * 2.6 - vx * 0.9);
    this.open();
    this.wake();
  }

  /** The mouth bows open and the cards rise out of it. */
  open() {
    const t = this.torn;
    const timeline = gsap.timeline({ onUpdate: () => { this.dirty = true; this.wake(); } });
    timeline.to(t, { open: 1, duration: 0.5, ease: 'back.out(2.4)' }, 0.06);
    timeline.to(t, { lean: 1, duration: 0.6, ease: 'power2.out' }, 0.06);
    this.cards.forEach((card, i) => {
      const [rise, lean] = CARDS[i];
      timeline.call(() => { card.visible = true; }, null, 0.12);
      timeline.to(card.position, { y: card.userData.rest.y + rise, duration: 0.55, ease: 'power3.out' }, 0.14 + i * 0.07);
      timeline.to(card.rotation, { z: lean, duration: 0.55, ease: 'power3.out' }, 0.14 + i * 0.07);
    });
    timeline.call(() => { t.phase = 'open'; this.onOpened?.(); }, null, 0.82);
    this.track(timeline);
  }

  /** Tear it all in one go: a tap, a key, or someone else's pack. */
  autoTear() {
    const t = this.torn;
    if (t.phase === 'free' || t.phase === 'open' || this.auto) return;
    this.auto = true;
    t.dir ||= 1;
    if (this.reducedMotion) {
      this.tearTo(1);
      return;
    }
    const from = { p: t.progress };
    // Slow to start, then it gives: the way foil tears.
    this.track(gsap.to(from, {
      p: 1, duration: 0.55 * (1 - t.progress) + 0.12, ease: 'power2.in',
      onUpdate: () => this.tearTo(from.p, from.p * 0.7),
    }));
  }

  /** Back to a sealed pack, for the look test. */
  reset() {
    this.tweens.forEach(tween => tween.kill());
    this.tweens = [];
    this.auto = false;
    this.drag = null;
    this.tearState();
    for (const mesh of [...this.stripMeshes, ...this.bodyMeshes]) {
      mesh.geometry.attributes.position.array.set(mesh.userData.base);
      mesh.geometry.attributes.normal.array.set(mesh.userData.normals);
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.attributes.normal.needsUpdate = true;
    }
    this.stripPivot.position.set(0, 0, 0);
    this.stripPivot.rotation.set(0, 0, 0);
    this.strip.position.set(0, 0, 0);
    this.strip.visible = true;
    for (const card of this.cards) {
      card.position.copy(card.userData.rest);
      card.rotation.set(0, 0, 0);
      card.visible = false;
    }
    this.target.set(0, 0);
    this.wake();
  }

  /** Drag on `target` to tear. Returns a function that stops listening. */
  bindTear(target) {
    const down = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (this.torn.phase === 'free' || this.torn.phase === 'open' || this.auto) return;
      try { target.setPointerCapture(event.pointerId); } catch { /* a pointer that is already gone */ }
      this.drag = { x: event.clientX, y: event.clientY, from: this.torn.progress, moved: false, trail: [] };
      this.target.set(0, -0.1);
      this.wake();
    };
    const move = (event) => {
      const drag = this.drag;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > TAP) drag.moved = true;
      drag.trail = [...drag.trail.slice(-5), { x: event.clientX, y: event.clientY, t: event.timeStamp }];
      const t = this.torn;
      if (t.phase === 'free') {
        // Torn loose: the strip hangs from the pointer.
        const f = this.flight;
        if (!f.held) return;
        f.grab ??= { x: event.clientX, y: event.clientY };
        const unit = this.unitsPerPixel();
        this.stripPivot.position.set(f.rest.x + (event.clientX - f.grab.x) * unit, f.rest.y - (event.clientY - f.grab.y) * unit, f.rest.z + 0.05);
        this.stripPivot.rotation.z = Math.max(-0.5, Math.min(0.5, -(event.clientX - f.grab.x) * unit * 0.8));
        this.wake();
        return;
      }
      if (!t.dir) {
        if (Math.abs(dx) < TAP) return;
        t.dir = Math.sign(dx);   // tear from whichever side the pull starts
      }
      // The hand holding the pack gives a little towards the pull.
      this.target.set(-t.dir * 0.18, -0.1 - Math.min(0.25, Math.max(0, -dy) / 400));
      this.tearTo(drag.from + Math.max(0, dx * t.dir) / this.tearSpan(), (-dy / this.tearSpan()) * 1.6);
    };
    const up = (event) => {
      const drag = this.drag;
      if (!drag) return;
      move(event);   // the release point counts, even if no move event landed there
      this.drag = null;
      this.target.set(0, 0);
      if (this.torn.phase === 'free') {
        const first = drag.trail[0] ?? { x: event.clientX, y: event.clientY, t: event.timeStamp - 16 };
        const dt = Math.max(16, event.timeStamp - first.t) / 1000;
        const unit = this.unitsPerPixel();
        this.fling(((event.clientX - first.x) * unit) / dt, (-(event.clientY - first.y) * unit) / dt);
      } else if (!drag.moved) this.autoTear();   // a tap tears it for you
      else this.relax();
      this.wake();
    };
    const cancel = () => {
      if (!this.drag) return;
      this.drag = null;
      if (this.torn.phase === 'free') this.fling(0, 0);
      else this.relax();
    };
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
    return () => {
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
    };
  }

  bendStrip(time) {
    const t = this.torn;
    for (const mesh of this.stripMeshes) {
      const position = mesh.geometry.attributes.position;
      curlStrip(mesh.userData.base, position.array, { ...t, progress: t.phase === 'free' ? 1 : t.progress, time });
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }

  bendBody() {
    for (const mesh of this.bodyMeshes) {
      const position = mesh.geometry.attributes.position;
      openMouth(mesh.userData.base, position.array, mesh.userData.sheet === 'PackBack' ? -1 : 1, this.torn.open);
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }

  stepTear(dt, now) {
    const t = this.torn;
    const s = this.shake;
    // A stiff spring, so the pack shivers with each crackle and settles fast.
    s.vx += (-200 * s.x - 14 * s.vx) * dt;
    s.vz += (-200 * s.z - 14 * s.vz) * dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    if (Math.abs(s.x) + Math.abs(s.vx) + Math.abs(s.z) + Math.abs(s.vz) < 1e-4) Object.assign(s, { x: 0, vx: 0, z: 0, vz: 0 });
    const f = this.flight;
    if (f && !f.held && this.strip.visible) {
      f.age += dt;
      f.velocity.y -= GRAVITY * dt;
      f.velocity.multiplyScalar(1 - 0.6 * dt);   // air catches the foil
      this.stripPivot.position.addScaledVector(f.velocity, dt);
      this.stripPivot.rotation.x += f.spin.x * dt;
      this.stripPivot.rotation.y += f.spin.y * dt;
      this.stripPivot.rotation.z += f.spin.z * dt;
      if (f.age > 2.5) this.strip.visible = false;
    }
    if (this.dirty || (t.flutter && this.strip.visible)) {
      if (t.phase !== 'closed') this.bendStrip(now / 1000);
      if (t.open) this.bendBody();
      this.dirty = false;
    }
  }

  moving() {
    const t = this.torn;
    const s = this.shake;
    return !!(s.x || s.vx || s.z || s.vz) || (this.flight && this.strip.visible && !this.flight.held && t.flutter > 0)
      || this.tweens.some(tween => tween.isActive());
  }

  animating() {
    const settling = this.tilt.distanceTo(this.target) > 0.002 || Math.abs(this.flip - this.flipTarget) > 0.002;
    return this.visible && !document.hidden && (settling || this.moving());
  }

  wake() {
    if (!this.frame && this.renderer) this.frame = requestAnimationFrame(() => this.tick());
  }

  tick() {
    this.frame = 0;
    const started = performance.now();
    const dt = (this.last ? Math.min(0.05, (started - this.last) / 1000) : 1 / 60) * this.speed;
    this.last = started;
    const ease = this.reducedMotion ? 1 : EASE;
    this.tilt.lerp(this.target, ease);
    this.flip += (this.flipTarget - this.flip) * ease;
    if (this.pack) {
      this.stepTear(dt, started);
      const { lean } = this.torn;
      // Opened, the pack tips back a touch so you look into it.
      this.pack.rotation.set(this.tilt.y * MAX_TILT_X + this.shake.x * 0.05 - lean * 0.22, this.tilt.x * MAX_TILT_Y + this.flip, this.shake.z * 0.04);
      this.pack.position.y = -lean * 0.08;
      // The key light swings the other way, so the glint slides across the foil.
      this.key.position.set(-this.tilt.x * 3 + 1.5, this.tilt.y * 2 + 2.5, 3);
    }
    this.renderer.render(this.scene, this.camera);
    this.stats.ms = performance.now() - started;
    if (this.animating()) this.wake();
    else this.last = 0;
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.tweens.forEach(tween => tween.kill());
    this.observer?.disconnect();
    this.visibility?.disconnect();
    this.pointerTarget.removeEventListener('pointermove', this.onMove);
    this.pointerTarget.removeEventListener('pointerleave', this.onLeave);
    for (const mesh of [...(this.meshes ?? []), ...(this.inners ?? []), ...(this.cards ?? [])]) {
      for (const material of [].concat(mesh.material)) this.disposeMaterial(material);
    }
    this.cards?.[0]?.geometry.dispose();
    for (const mesh of this.meshes ?? []) mesh.geometry.dispose();
    this.scene?.environment?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
