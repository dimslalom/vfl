// The evo skills firing on the board at resolve. Each beat shows what its rule
// did, where it did it: the source card acts, something crosses the board, the
// target reacts. Like chipFx, everything is built when it plays and disposed
// when done, and every position is board-local.

import {
  AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry, RingGeometry, ShapeGeometry,
} from 'three';
import { gsap } from 'gsap';
import { impact, lightning } from './chipFx.js';
import { CARD_H, CARD_TIP, CARD_W, cutShape } from './TableBlockout.js';

const flatPlane = new PlaneGeometry(1, 1);
flatPlane.rotateX(-Math.PI / 2);
const flatRing = new RingGeometry(0.86, 1, 64);
flatRing.rotateX(-Math.PI / 2);
const cardFlat = new ShapeGeometry(cutShape(CARD_W, CARD_H, CARD_TIP));
cardFlat.rotateX(-Math.PI / 2);

let dotMap = null;
function dot() {
  if (dotMap) return dotMap;
  const el = document.createElement('canvas');
  el.width = el.height = 64;
  const ctx = el.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotMap = new CanvasTexture(el);
  return dotMap;
}

const shared = (mesh, order = 11) => {
  mesh.userData.sharedGeometry = true;
  mesh.renderOrder = order;
  return mesh;
};
const glow = (color, opacity = 1, map = null) => new MeshBasicMaterial({ color, map, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
const shade = (color, opacity = 1, map = null) => new MeshBasicMaterial({ color, map, transparent: true, opacity, blending: NormalBlending, depthWrite: false, toneMapped: false });

function done(parent, nodes, onUpdate) {
  for (const node of nodes) {
    parent.remove(node);
    node.traverse((child) => { if (child.material) child.material.dispose(); });
  }
  onUpdate?.();
}

/** The face and edge materials of a board card, for tinting it. */
function cardMaterials(entry) {
  return entry.lift.children.filter(mesh => mesh.isMesh && mesh !== entry.outline).flatMap(mesh => [].concat(mesh.material));
}

/** Tints a card toward `rgb` (multiplied): dims it, burns it, drains it. Stays for the round. */
export function tintCard(entry, [r, g, b], { duration = 0.35, delay = 0, onUpdate } = {}) {
  for (const material of cardMaterials(entry)) {
    if (!material.color) continue;
    if (!material.userData.base) material.userData.base = material.color.clone();
    const base = material.userData.base;
    gsap.to(material.color, { r: base.r * r, g: base.g * g, b: base.b * b, duration, delay, onUpdate });
  }
}

const centre = entry => entry.group.position;

/** Lurk: smoke tears off the card in puffs as it turns face up. */
export function smokePeel(parent, entry, { onUpdate }) {
  const { x, z } = centre(entry);
  const puffs = Array.from({ length: 9 }, (_, i) => {
    const puff = shared(new Mesh(flatPlane, shade(0x6c8f8a, 0.6, dot())));
    const a = (i / 9) * Math.PI * 2;
    puff.position.set(x + Math.cos(a) * 0.15, 0.4 + (i % 3) * 0.05, z + Math.sin(a) * 0.2);
    puff.scale.setScalar(0.6);
    puff.userData.a = a;
    parent.add(puff);
    return puff;
  });
  const tl = gsap.timeline({ onUpdate, onComplete: () => done(parent, puffs, onUpdate) });
  puffs.forEach((puff, i) => {
    const a = puff.userData.a;
    tl.to(puff.position, { x: x + Math.cos(a) * 1.1, z: z + Math.sin(a) * 1.3, y: 0.7, duration: 0.7, ease: 'power2.out' }, i * 0.02)
      .to(puff.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 0.7, ease: 'power2.out' }, i * 0.02)
      .to(puff.material, { opacity: 0, duration: 0.55, ease: 'power1.in' }, 0.15 + i * 0.02);
  });
  return tl;
}

/**
 * Black Hole: the pulled card stretches along its flight, lands smaller and
 * drained (it scores half there), and the floor implodes under it.
 */
export function pullIn(parent, entry, { onUpdate }) {
  const { lift } = entry;
  const tl = gsap.timeline({ onUpdate });
  tl.to(lift.scale, { z: 1.9, x: 0.7, duration: 0.25, ease: 'power2.in' }, 0)
    .to(lift.scale, { z: 0.82, x: 0.82, duration: 0.25, ease: 'back.out(3)' }, 0.32)
    .call(() => {
      const { x, z } = centre(entry);
      const core = shared(new Mesh(flatPlane, shade(0x000000, 0.9, dot())));
      core.position.set(x, 0.05, z);
      core.scale.setScalar(2.4);
      const ring = shared(new Mesh(flatRing, glow(0xbff6ff, 1)));
      ring.position.set(x, 0.06, z);
      ring.scale.setScalar(1.6);
      parent.add(core, ring);
      gsap.timeline({ onUpdate, onComplete: () => done(parent, [core, ring], onUpdate) })
        .to(ring.scale, { x: 0.1, y: 0.1, z: 0.1, duration: 0.35, ease: 'power3.in' }, 0)
        .to(core.scale, { x: 0.2, y: 0.2, z: 0.2, duration: 0.4, ease: 'power3.in' }, 0)
        .to([ring.material, core.material], { opacity: 0, duration: 0.15 }, 0.3);
    }, null, 0.3);
  tintCard(entry, [0.55, 0.62, 0.7], { delay: 0.35, onUpdate });
  return tl;
}

/** Velocity: ghosts of the card left along its run, a lime streak, and it arrives dim. */
export function dash(parent, entry, from, { onUpdate }) {
  const to = centre(entry);
  const s = entry.group.scale.x || 1;
  const ghosts = [0.2, 0.45, 0.7].map((t, i) => {
    const ghost = shared(new Mesh(cardFlat, glow(0xa3e635, 0.5 - i * 0.12)));
    ghost.position.set(from.x + (to.x - from.x) * t, 0.08, from.z + (to.z - from.z) * t);
    ghost.scale.setScalar(s);
    parent.add(ghost);
    return ghost;
  });
  const streak = shared(new Mesh(flatPlane, glow(0xd9f99d, 0.8)));
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  streak.position.set((from.x + to.x) / 2, 0.04, (from.z + to.z) / 2);
  streak.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
  streak.scale.set(len, 1, 0.12);
  parent.add(streak);
  gsap.timeline({ onUpdate, onComplete: () => done(parent, [...ghosts, streak], onUpdate) })
    .to(ghosts.map(g => g.material), { opacity: 0, duration: 0.5, stagger: 0.06 }, 0.1)
    .to(streak.material, { opacity: 0, duration: 0.45 }, 0.15);
  // It scores a fraction of itself here, and looks it.
  tintCard(entry, [0.45, 0.5, 0.42], { delay: 0.35, duration: 0.5, onUpdate });
}

/** Combustion's fuel: the card flickers like a burning wick and settles a little darker. */
export function burnDown(entry, { onUpdate }) {
  const steps = [0.7, 1, 0.6, 0.95, 0.82];
  steps.forEach((v, i) => tintCard(entry, [v * 1.05, v * 0.85, v * 0.7], { delay: i * 0.06, duration: 0.05, onUpdate }));
}

/** Combustion's flare: a fireball arcs to the enemy star, bursts and scorches it. */
export function flare(parent, from, target, { onUpdate, onHit }) {
  const to = centre(target);
  const ball = shared(new Mesh(flatPlane, glow(0xffb347, 1, dot())), 12);
  ball.scale.setScalar(0.55);
  ball.position.set(from.x, 0.3, from.z);
  const halo = shared(new Mesh(flatPlane, glow(0xff5a1f, 0.6, dot())), 12);
  halo.scale.setScalar(1.2);
  ball.add(halo);
  parent.add(ball);
  const arc = { t: 0 };
  return gsap.timeline({ onUpdate, onComplete: () => done(parent, [ball], onUpdate) })
    .to(arc, {
      t: 1,
      duration: 0.36,
      ease: 'power1.in',
      onUpdate: () => {
        ball.position.set(from.x + (to.x - from.x) * arc.t, 0.3 + Math.sin(arc.t * Math.PI) * 1.4, from.z + (to.z - from.z) * arc.t);
        onUpdate?.();
      },
    })
    .call(() => {
      onHit?.();
      impact(parent, { x: to.x, z: to.z, color: 0xff7a1a, size: 0.9, onUpdate });
      impact(parent, { x: to.x, z: to.z, color: 0xffe08a, size: 0.5, onUpdate });
      tintCard(target, [0.75, 0.42, 0.3], { onUpdate });
    })
    .to(ball.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 0.15 })
    .to([ball.material, halo.material], { opacity: 0, duration: 0.15 }, '<');
}

/** Phase: a rift opens under a card, which sinks into it and goes dark. `deep` for the one voided. */
export function riftSink(parent, entry, { deep = true, onUpdate }) {
  const { x, z } = centre(entry);
  const s = entry.group.scale.x || 1;
  const hole = shared(new Mesh(flatPlane, shade(0x05010c, 0.9, dot())), 9);
  hole.position.set(x, 0.03, z);
  hole.scale.setScalar(0.1);
  const lip = shared(new Mesh(flatRing, glow(0x8b5cf6, 0.9)), 9);
  lip.position.set(x, 0.035, z);
  lip.scale.setScalar(0.1);
  parent.add(hole, lip);
  const size = CARD_W * s * (deep ? 1.6 : 1.1);
  gsap.timeline({ onUpdate })
    .to([hole.scale, lip.scale], { x: size, y: size, z: size, duration: 0.3, ease: 'power3.out' })
    .to(entry.lift.position, { y: deep ? -0.06 : -0.02, duration: 0.35, ease: 'power2.in' }, 0.12)
    .to(lip.material, { opacity: 0.35, duration: 0.4 }, 0.35)
    .to(hole.material, { opacity: 0.6, duration: 0.4 }, 0.35);
  entry.rift = [hole, lip];
  tintCard(entry, deep ? [0.25, 0.22, 0.32] : [0.6, 0.55, 0.7], { delay: 0.15, duration: 0.4, onUpdate });
}

/** Surge: chain lightning from the storm card to every enemy card on the next lane, a thin branch to yours. */
export function chainLightning(parent, from, foes, allies, { onUpdate }) {
  foes.forEach((entry, i) => {
    gsap.delayedCall(i * 0.08, () => lightning(parent, { from: i ? centre(foes[i - 1]) : from, to: centre(entry), onUpdate, onHit: () => tintCard(entry, [0.7, 0.78, 0.9], { onUpdate }) }));
  });
  allies.forEach((entry, i) => {
    gsap.delayedCall(0.2 + i * 0.06, () => {
      impact(parent, { x: centre(entry).x, z: centre(entry).z, color: 0xffffff, size: 0.3, onUpdate });
      gsap.fromTo(entry.lift.position, { x: 0.04 }, { x: 0, duration: 0.25, ease: 'elastic.out(1, 0.3)', onUpdate });
    });
  });
}

/** Ascendance: she lifts off her lost lane, feathers falling where she was. */
export function rise(parent, entry, { onUpdate }) {
  const { x, z } = centre(entry);
  const feathers = Array.from({ length: 10 }, (_, i) => {
    const f = shared(new Mesh(flatPlane, glow(0xfff1f4, 0.9, dot())), 12);
    f.position.set(x + (Math.random() - 0.5) * CARD_W, 1.2 + Math.random() * 0.6, z + (Math.random() - 0.5) * CARD_H * 0.6);
    f.scale.set(0.08, 1, 0.22);
    f.rotation.y = i;
    parent.add(f);
    return f;
  });
  gsap.timeline({ onUpdate, onComplete: () => done(parent, feathers, onUpdate) })
    .to(entry.lift.position, { y: 1.1, duration: 0.45, ease: 'power2.out' }, 0)
    .to(entry.lift.position, { y: 0, duration: 0.3, ease: 'power2.in' }, 0.75)
    .to(feathers.map(f => f.position), { y: 0.05, duration: 1.1, ease: 'sine.inOut', stagger: 0.03 }, 0.1)
    .to(feathers.map(f => f.material), { opacity: 0, duration: 0.4, stagger: 0.03 }, 0.8);
  // Gone from this lane: her place goes grey.
  tintCard(entry, [0.35, 0.33, 0.36], { delay: 0.6, onUpdate });
}

/**
 * Ascendance landing: light falls on the lane she flew to. Seen from above that
 * is a bright pool that blooms out, rings riding it, and feathers settling in.
 */
export function blessing(parent, at, { onUpdate }) {
  const pool = shared(new Mesh(flatPlane, glow(0xffe4ec, 0, dot())), 12);
  pool.position.set(at.x, 0.08, at.z);
  pool.scale.setScalar(0.4);
  const feathers = Array.from({ length: 8 }, (_, i) => {
    const f = shared(new Mesh(flatPlane, glow(0xfff1f4, 0.9, dot())), 12);
    const a = (i / 8) * Math.PI * 2;
    f.position.set(at.x + Math.cos(a) * 0.9, 1.4, at.z + Math.sin(a) * 0.6);
    f.scale.set(0.08, 1, 0.22);
    f.rotation.y = a;
    return f;
  });
  parent.add(pool, ...feathers);
  gsap.timeline({ onUpdate, onComplete: () => done(parent, [pool, ...feathers], onUpdate) })
    .to(pool.material, { opacity: 1, duration: 0.12 }, 0)
    .to(pool.scale, { x: 2.6, y: 2.6, z: 2.6, duration: 0.45, ease: 'power3.out' }, 0)
    .call(() => {
      impact(parent, { x: at.x, z: at.z, color: 0xffd1dc, size: 1.2, onUpdate });
      gsap.delayedCall(0.12, () => impact(parent, { x: at.x, z: at.z, color: 0xffffff, size: 0.7, onUpdate }));
    }, null, 0.05)
    .to(feathers.map(f => f.position), { y: 0.06, x: `-=${0.2}`, duration: 0.9, ease: 'sine.out', stagger: 0.03 }, 0.05)
    .to([pool.material, ...feathers.map(f => f.material)], { opacity: 0, duration: 0.5 }, 0.7);
}

/** Overdrive: the lane's top surges red, or drains grey for the tilt. Returns to its colour after. */
export function laneSurge(lane, up, { onUpdate }) {
  const color = lane?.userData?.top?.color;
  if (!color) return;
  const was = color.clone();
  const hot = up ? { r: 1, g: 0.25, b: 0.3 } : { r: 0.22, g: 0.22, b: 0.24 };
  gsap.timeline({ onUpdate })
    .to(color, { ...hot, duration: 0.18 })
    .to(color, { r: was.r, g: was.g, b: was.b, duration: 0.5, delay: 0.25 });
}

/** Ironclad: the chip on a plated lane bounces off and greys out. */
export function wardBlock(parent, chip, { onUpdate }) {
  const { position } = chip.group;
  const y = position.y;
  impact(parent, { x: position.x, z: position.z, color: 0xf59e0b, size: 0.5, onUpdate });
  gsap.timeline({ onUpdate })
    .to(position, { y: y + 0.5, duration: 0.14, ease: 'power2.out' })
    .to(position, { y, duration: 0.3, ease: 'bounce.out' });
  chip.group.traverse((node) => {
    for (const material of [].concat(node.material ?? [])) {
      if (material.color) gsap.to(material.color, { r: 0.35, g: 0.36, b: 0.38, duration: 0.3, delay: 0.1, onUpdate });
    }
  });
}

/** Sovereign's decree: a gold seal stamps down over the enemy chip, which greys out under it. */
export function sealStamp(parent, chip, { onUpdate }) {
  const { x, z } = chip.group.position;
  const ring = shared(new Mesh(flatRing, glow(0xffd76a, 1)), 13);
  ring.position.set(x, 1.2, z);
  ring.scale.setScalar(1.4);
  parent.add(ring);
  gsap.timeline({ onUpdate, onComplete: () => done(parent, [ring], onUpdate) })
    .to(ring.position, { y: chip.group.position.y + 0.1, duration: 0.2, ease: 'power3.in' })
    .to(ring.scale, { x: 0.45, y: 0.45, z: 0.45, duration: 0.2, ease: 'power3.in' }, 0)
    .call(() => {
      impact(parent, { x, z, color: 0xffd76a, size: 0.8, onUpdate });
      chip.group.traverse((node) => {
        for (const material of [].concat(node.material ?? [])) {
          if (material.color) gsap.to(material.color, { r: 0.3, g: 0.28, b: 0.25, duration: 0.25, onUpdate });
        }
      });
    })
    .to(ring.material, { opacity: 0.0, duration: 0.6, delay: 0.3 });
}

/** Chronos: a huge brass dial over the board, spinning backwards while it rewinds. */
export function rewindDial(parent, { x = 0, z = 0, size = 5, duration = 1.3, onUpdate }) {
  const el = document.createElement('canvas');
  el.width = el.height = 512;
  const ctx = el.getContext('2d');
  ctx.translate(256, 256);
  ctx.strokeStyle = '#ffe08a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 240, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 60; k += 1) {
    const a = (k / 60) * Math.PI * 2;
    ctx.lineWidth = k % 5 ? 3 : 9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (k % 5 ? 214 : 190), Math.sin(a) * (k % 5 ? 214 : 190));
    ctx.lineTo(Math.cos(a) * 232, Math.sin(a) * 232);
    ctx.stroke();
  }
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -170);
  ctx.moveTo(0, 0);
  ctx.lineTo(110, 0);
  ctx.stroke();
  const map = new CanvasTexture(el);
  const dial = shared(new Mesh(flatPlane, glow(0xffffff, 0, map)), 14);
  dial.position.set(x, 0.3, z);
  dial.scale.setScalar(size);
  parent.add(dial);
  return gsap.timeline({ onUpdate, onComplete: () => { map.dispose(); done(parent, [dial], onUpdate); } })
    .to(dial.material, { opacity: 0.85, duration: 0.2 }, 0)
    .to(dial.rotation, { y: Math.PI * 4, duration, ease: 'power2.inOut' }, 0)
    .to(dial.scale, { x: size * 0.6, y: size * 0.6, z: size * 0.6, duration, ease: 'power2.in' }, 0)
    .to(dial.material, { opacity: 0, duration: 0.25 }, duration - 0.15);
}
