// Scoring effects for the board: each rare chip has its own show, and every
// player card hits the score bar as its number lands. Everything here is flat
// unlit geometry laid on the board, built when it plays and disposed when done,
// so nothing lingers between rounds. All positions are board-local.

import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, SRGBColorSpace,
} from 'three';
import { gsap } from 'gsap';
import { ICON_PATHS } from '../chip3d/chipIcons.js';

const plane = new PlaneGeometry(1, 1);
plane.rotateX(-Math.PI / 2);
const ring = new RingGeometry(0.7, 1, 48);
ring.rotateX(-Math.PI / 2);
const shard = new BoxGeometry(1, 0.35, 1);

function glow(color, opacity = 1) {
  return new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
}

function flat(color, opacity = 1) {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
}

// Removes what an effect added once it is done. Shared geometries stay.
function cleanup(parent, nodes, onUpdate) {
  for (const node of nodes) {
    parent.remove(node);
    node.traverse((child) => {
      if (child.material) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    });
  }
  onUpdate?.();
}

const tag = (mesh) => {
  mesh.userData.sharedGeometry = true;
  mesh.renderOrder = 10;
  return mesh;
};

/** A ring that bursts flat on the board where a card's hit lands. */
export function impact(parent, { x, z, color = 0xffffff, size = 0.35, onUpdate }) {
  const mesh = tag(new Mesh(ring, glow(color, 0.9)));
  mesh.position.set(x, 0.09, z);
  mesh.scale.setScalar(size * 0.2);
  parent.add(mesh);
  gsap.timeline({ onUpdate, onComplete: () => cleanup(parent, [mesh], onUpdate) })
    .to(mesh.scale, { x: size, y: size, z: size, duration: 0.3, ease: 'power3.out' }, 0)
    .to(mesh.material, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0.05);
}

/**
 * A card attacks the bar: a short pull back, a lunge toward the bar, an impact
 * ring where it lands, and a settle. Moves the card's lift layer only, so it
 * never fights the tweens that place the card.
 */
export function attack(parent, entry, { barZ, color, onUpdate }) {
  const { group, lift } = entry;
  const scale = group.scale.x || 1;
  const reach = ((barZ - group.position.z) * 0.38) / scale;
  gsap.killTweensOf(lift.position);
  gsap.timeline({ onUpdate })
    .to(lift.position, { z: -reach * 0.15, duration: 0.07, ease: 'power2.out' })
    .to(lift.position, { z: reach, duration: 0.09, ease: 'power3.in' })
    .call(() => impact(parent, { x: group.position.x, z: group.position.z + reach * 0.9 * scale, color, onUpdate }))
    .to(lift.position, { z: 0, duration: 0.24, ease: 'back.out(2)' });
}

function bolt(from, to, jag) {
  const points = [];
  const n = 9;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = i === 0 || i === n ? 0 : (Math.random() - 0.5) * jag;
    points.push({ x: from.x + dx * t + (-dz / len) * off, z: from.z + dz * t + (dx / len) * off });
  }
  return points;
}

function drawBolt(group, points, width) {
  group.children.forEach((seg, i) => {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    seg.position.set((a.x + b.x) / 2, 0.3, (a.z + b.z) / 2);
    seg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    seg.scale.set(len + width, 1, width);
  });
}

/** Second Call: lightning jumps from the chip to the lane it chains to, flickering. */
export function lightning(parent, { from, to, onUpdate, onHit }) {
  const make = (color, width, opacity) => {
    const group = new Group();
    for (let i = 0; i < 9; i++) group.add(tag(new Mesh(plane, glow(color, opacity))));
    group.userData.width = width;
    parent.add(group);
    return group;
  };
  const halo = make(0x3f6fd8, 0.16, 0.55);
  const core = make(0xe8f3ff, 0.045, 1);
  const flash = () => {
    const points = bolt(from, to, 0.5);
    drawBolt(halo, points, halo.userData.width);
    drawBolt(core, points, core.userData.width);
    onUpdate?.();
  };
  flash();
  const fade = [...halo.children, ...core.children].map(mesh => mesh.material);
  gsap.timeline({ onUpdate, onComplete: () => cleanup(parent, [halo, core], onUpdate) })
    .call(flash, null, 0.06)
    .call(() => { onHit?.(); impact(parent, { x: to.x, z: to.z, color: 0xcfe0ff, size: 0.55, onUpdate }); }, null, 0.1)
    .call(flash, null, 0.14)
    .call(flash, null, 0.22)
    .to(fade, { opacity: 0, duration: 0.25, ease: 'power1.in' }, 0.28);
}

/**
 * No Respect: a slash cuts across the enemy's best card and it stays dimmed for
 * the rest of the round, scored out.
 */
export function slash(parent, entry, { onUpdate }) {
  const { group, lift } = entry;
  const s = group.scale.x || 1;
  const cut = tag(new Mesh(plane, glow(0xffffff, 1)));
  cut.position.set(group.position.x, 0.35, group.position.z);
  cut.rotation.y = -0.75;
  cut.scale.set(0.01, 1, 0.05);
  parent.add(cut);
  // The dimmer rides on the card, so it moves with it and goes when the board is cleared.
  const dim = tag(new Mesh(plane, flat(0x05060a, 0)));
  dim.position.y = 0.06;
  dim.scale.set(1.25, 1, 1.75);
  lift.add(dim);
  gsap.timeline({ onUpdate, onComplete: () => cleanup(parent, [cut], onUpdate) })
    .to(cut.scale, { x: 1.6 * s, duration: 0.12, ease: 'power4.out' })
    .to(lift.rotation, { z: 0.08, duration: 0.05, yoyo: true, repeat: 3 }, 0.08)
    .to(dim.material, { opacity: 0.6, duration: 0.2 }, 0.1)
    .to(cut.material, { opacity: 0, duration: 0.25 }, 0.2);
}

function lockTexture() {
  const el = document.createElement('canvas');
  el.width = 128;
  el.height = 128;
  const ctx = el.getContext('2d');
  ctx.fillStyle = '#d8b34c';
  ctx.fillRect(8, 8, 112, 112);
  ctx.translate(16, 16);
  ctx.scale(96 / 24, 96 / 24);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'square';
  ctx.strokeStyle = '#211b06';
  for (const d of ICON_PATHS.lock) ctx.stroke(new Path2D(d));
  const map = new CanvasTexture(el);
  map.colorSpace = SRGBColorSpace;
  return map;
}

/**
 * Lock the Map: a lock flies from the lock chip, slams onto the chip it cancels,
 * and that chip shatters.
 */
export function lockShatter(parent, { from, chip, color = 0x8d93a3, onUpdate, onBreak }) {
  const target = chip.group.position;
  const lock = tag(new Mesh(plane, new MeshBasicMaterial({ map: lockTexture(), transparent: true, depthWrite: false, toneMapped: false })));
  lock.scale.setScalar(0.32);
  lock.position.set(from.x, 0.9, from.z);
  parent.add(lock);
  const shards = Array.from({ length: 10 }, () => {
    const mesh = tag(new Mesh(shard, flat(color, 1)));
    mesh.scale.setScalar(0.07);
    mesh.visible = false;
    parent.add(mesh);
    return mesh;
  });
  const tl = gsap.timeline({ onUpdate, onComplete: () => cleanup(parent, [lock, ...shards], onUpdate) });
  tl.to(lock.position, { x: target.x, z: target.z, duration: 0.22, ease: 'power2.in' })
    .to(lock.position, { y: target.y + 0.2, duration: 0.1, ease: 'power3.in' })
    .to(lock.scale, { x: 0.45, y: 0.45, z: 0.45, duration: 0.06, yoyo: true, repeat: 1 })
    .call(() => {
      onBreak?.();
      impact(parent, { x: target.x, z: target.z, color: 0xd8b34c, size: 0.5, onUpdate });
      shards.forEach((mesh, i) => {
        const a = (i / shards.length) * Math.PI * 2;
        mesh.visible = true;
        mesh.position.set(target.x, target.y + 0.05, target.z);
        gsap.to(mesh.position, { x: target.x + Math.cos(a) * 0.5, z: target.z + Math.sin(a) * 0.5, y: target.y + 0.25, duration: 0.35, ease: 'power2.out', onUpdate });
        gsap.to(mesh.rotation, { x: Math.random() * 6, y: Math.random() * 6, duration: 0.35 });
        gsap.to(mesh.material, { opacity: 0, duration: 0.3, delay: 0.12 });
      });
    })
    .to(chip.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.18, ease: 'power3.in' }, '<')
    .to(lock.material, { opacity: 0, duration: 0.3 }, '+=0.15');
}

/** A chip firing: hops, spins once and lands with a ring, for a multiplier landing. */
export function chipFire(parent, chip, { onUpdate, color = 0xffffff }) {
  const { position, rotation, scale } = chip.group;
  const y = position.y;
  const s = scale.x;
  gsap.timeline({ onUpdate })
    .to(position, { y: y + 0.42, duration: 0.14, ease: 'power2.out' }, 0)
    .to(rotation, { y: rotation.y + Math.PI * 2, duration: 0.32, ease: 'power2.out' }, 0)
    .to(scale, { x: s * 1.22, y: s * 1.22, z: s * 1.22, duration: 0.14, ease: 'power2.out' }, 0)
    .to(position, { y, duration: 0.18, ease: 'power2.in' }, 0.14)
    .to(scale, { x: s, y: s, z: s, duration: 0.18, ease: 'back.out(2)' }, 0.14)
    .call(() => impact(parent, { x: position.x, z: position.z, color, size: 0.4, onUpdate }), null, 0.32);
}
