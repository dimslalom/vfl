// One WebGL renderer for every chip shown in the page (the chip pick, the hand,
// the codex), so ten chips cost one context, not ten. Each view is a plain 2D
// canvas: the shared renderer draws that chip into a corner of its own canvas
// and the view copies it across. Views off screen are skipped, and with reduced
// motion nothing moves after the first draw.

import {
  ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeChip, makeChip } from './ChipStack.js';

const FOV = 30;
const DISTANCE = 4.9;
const LEAN = 0.5;                 // face tipped back from the viewer, so the rim shows
const SWAY = 0.2;                 // idle turn either side, in radians
const MAX_DPR = 2;

let shared = null;

function boot() {
  if (shared) return shared;
  try {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setScissorTest(true);
    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // A key light from the top left, and a rim light behind so the bevel picks
    // up a bright edge against the dark page.
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 5, 4);
    const rim = new DirectionalLight(0xffffff, 1.3);
    rim.position.set(3, 1.5, -3);
    scene.add(key, rim, new HemisphereLight(0xffffff, 0x1a1d27, 0.35));
    const camera = new PerspectiveCamera(FOV, 1, 0.5, 20);
    camera.position.set(0, 0, DISTANCE);
    shared = { renderer, scene, camera, views: new Set(), size: [0, 0], frame: 0, failed: false };
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      shared.failed = true;
      shared.views.forEach(view => view.onFail?.());
    });
  } catch {
    shared = { failed: true, views: new Set() };
  }
  return shared;
}

export function chipRendererWorks() {
  return !boot().failed;
}

function loop() {
  const s = shared;
  if (!s || s.failed || !s.views.size) {
    if (s) s.frame = 0;
    return;
  }
  const now = performance.now() / 1000;
  for (const view of s.views) view.draw(now);
  s.frame = requestAnimationFrame(loop);
}

function wake() {
  if (shared && !shared.frame && !shared.failed) shared.frame = requestAnimationFrame(loop);
}

/**
 * Draws `key` into `canvas` (sized in CSS pixels by the page). Returns a handle:
 * hover(x, y) with -1..1 offsets from the centre, or hover(null) to let go;
 * destroy() when the element leaves.
 */
export function createChipView(canvas, key, { reducedMotion = false, onFail, phase = 0 } = {}) {
  const s = boot();
  if (s.failed) return null;
  const ctx = canvas.getContext('2d');
  const pivot = new Group();
  const chip = makeChip(key, 0);
  chip.group.rotation.x = Math.PI / 2;
  pivot.add(chip.group);
  const state = { yaw: 0, tilt: 0, lift: 1, aimYaw: 0, aimTilt: 0, aimLift: 1, visible: true, drawn: false };
  const visibility = new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; if (state.visible) wake(); });
  visibility.observe(canvas);

  const view = {
    onFail,
    hover(x, y) {
      if (x == null) Object.assign(state, { aimYaw: 0, aimTilt: 0, aimLift: 1 });
      else Object.assign(state, { aimYaw: x * 0.55, aimTilt: -y * 0.35, aimLift: 1.06 });
      state.drawn = false;
      wake();
    },
    draw(now) {
      if (!state.visible) return;
      const settle = reducedMotion ? 1 : 0.16;
      const before = state.yaw + state.tilt + state.lift;
      state.yaw += (state.aimYaw - state.yaw) * settle;
      state.tilt += (state.aimTilt - state.tilt) * settle;
      state.lift += (state.aimLift - state.lift) * settle;
      const still = Math.abs(before - (state.yaw + state.tilt + state.lift)) < 1e-4;
      if (reducedMotion && still && state.drawn) return;
      const idle = reducedMotion ? 0.35 : Math.sin(now * 0.7 + phase) * SWAY + 0.15;
      pivot.rotation.set(-LEAN + state.tilt + (reducedMotion ? 0 : Math.sin(now * 0.9 + phase) * 0.04), idle + state.yaw, 0);
      pivot.scale.setScalar(state.lift);

      const w = Math.max(1, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, MAX_DPR)));
      const h = Math.max(1, Math.round(canvas.clientHeight * Math.min(window.devicePixelRatio || 1, MAX_DPR)));
      if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
      // The shared canvas only grows, so switching views never reallocates it.
      if (w > s.size[0] || h > s.size[1]) {
        s.size = [Math.max(w, s.size[0]), Math.max(h, s.size[1])];
        s.renderer.setSize(s.size[0], s.size[1], false);
      }
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
      s.renderer.setViewport(0, 0, w, h);
      s.renderer.setScissor(0, 0, w, h);
      s.scene.add(pivot);
      s.renderer.clear();
      s.renderer.render(s.scene, s.camera);
      s.scene.remove(pivot);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(s.renderer.domElement, 0, s.size[1] - h, w, h, 0, 0, w, h);
      state.drawn = true;
    },
    destroy() {
      visibility.disconnect();
      s.views.delete(view);
      disposeChip(chip);
    },
  };
  s.views.add(view);
  wake();
  return view;
}
