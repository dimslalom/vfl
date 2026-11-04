// A test bench for skill effects: five real cards on a dark floor, one per skill,
// each showing its ready state (lifted, tipped toward you, its own effect) with a
// burst you can fire. Lives at /lab/fx until the effects are approved for the board.

import {
  CanvasTexture, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, Scene, ShapeGeometry, SRGBColorSpace, WebGLRenderer,
} from 'three';
import {
  ART_SCALE, CARD_H, CARD_T, CARD_TIP, CARD_W, PX, PY, cardArt, cutShape, drawCard, loadImage, slab,
} from './TableBlockout.js';
import { playUiSound } from '../../shared/src/lib/gameAudio.js';
import { SKILL_FX, attachSkillFx, readyPose } from './SkillFx.js';

export const FX_SKILLS = Object.keys(SKILL_FX);
const GAP = 1.25;

export default class FxLab {
  constructor(host, { reducedMotion = false } = {}) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.ready = true;
    this.entries = [];
    this.alive = true;
    this.last = 0;
    this.loop = this.loop.bind(this);
  }

  async init(cards) {
    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return false;
    }
    await document.fonts?.load('800 40px "Familjen Grotesk"').catch(() => null);
    const { renderer } = this;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    this.host.appendChild(renderer.domElement);
    this.scene = new Scene();
    this.scene.add(new HemisphereLight(0xffffff, 0x20232c, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1.2, 10, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 1, far: 30 });
    this.scene.add(sun);
    const floor = new Mesh(new PlaneGeometry(30, 20), new MeshStandardMaterial({ color: 0x141824, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.camera = new PerspectiveCamera(28, 1, 0.5, 60);

    const shape = cutShape(CARD_W, CARD_H, CARD_TIP);
    const edge = new MeshStandardMaterial({ color: 0x2a2e39, roughness: 0.7 });
    const arts = await Promise.all(cards.map(card => Promise.all(cardArt(card).map(loadImage))));
    if (!this.alive) return false;
    cards.forEach((card, n) => {
      const el = document.createElement('canvas');
      el.width = PX * ART_SCALE;
      el.height = PY * ART_SCALE;
      drawCard(el.getContext('2d'), card, arts[n], { side: 'you', igl: FX_SKILLS[n] === 'mastermind' });
      const map = new CanvasTexture(el);
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 8;
      map.repeat.set(1 / CARD_W, 1 / CARD_H);
      map.offset.set(0.5, 0.5);
      const group = new Group();
      const body = new Mesh(slab(shape, CARD_T), edge);
      body.position.y = -CARD_T / 2;
      body.castShadow = true;
      const face = new Mesh(new ShapeGeometry(shape), new MeshStandardMaterial({ map, roughness: 0.55 }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = CARD_T / 2 + 0.001;
      group.add(body, face);
      group.position.x = (n - (cards.length - 1) / 2) * GAP;
      this.scene.add(group);
      this.entries.push({ group, fx: attachSkillFx(group, FX_SKILLS[n]), skill: FX_SKILLS[n] });
    });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();
    this.frame = requestAnimationFrame(this.loop);
    return true;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Seen from above and in front, like the board's camera.
    const span = (FX_SKILLS.length - 1) * GAP + CARD_W * 1.6;
    const fit = (span / 2) / Math.tan((this.camera.fov * Math.PI) / 360) / this.camera.aspect;
    const d = Math.max(fit, 4.2);
    this.camera.position.set(0, d * 0.86, d * 0.52);
    this.camera.lookAt(0, 0, 0.1);
    this.camera.updateProjectionMatrix();
  }

  setReady(on) {
    this.ready = on;
    playUiSound(on ? 'rotate_ready' : 'drop');
  }

  fire(index) {
    const entry = this.entries[index];
    if (!entry) return;
    entry.fx.burst();
    playUiSound(`skill_${entry.skill}`);
  }

  /** Where each card sits on screen, for the page's labels. */
  anchors() {
    const box = this.host.getBoundingClientRect();
    return this.entries.map(({ group }) => {
      const v = group.position.clone();
      v.z += CARD_H / 2 + 0.25;
      v.project(this.camera);
      return { x: ((v.x + 1) / 2) * box.width, y: ((1 - v.y) / 2) * box.height };
    });
  }

  loop(now) {
    if (!this.alive) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const speed = this.reducedMotion ? 0.25 : 1;
    this.time = (this.time ?? 0) + dt * speed;
    for (const entry of this.entries) {
      entry.amount = (entry.amount ?? 0) + ((this.ready ? 1 : 0) - (entry.amount ?? 0)) * Math.min(1, dt * 8);
      readyPose(entry.group, this.time + entry.group.position.x, entry.amount);
      entry.fx.setVisible(entry.amount > 0.05);
      entry.fx.floor.position.y = -0.196 - entry.group.position.y;
      if (entry.amount > 0.05) entry.fx.update(dt * speed);
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    for (const entry of this.entries) entry.fx.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
