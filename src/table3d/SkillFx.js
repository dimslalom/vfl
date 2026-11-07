// Skill effects for a card on the 2.5D board, in the spirit of Marvel Snap: a card
// that can act right now says so itself. It lifts and tips toward you, and its skill
// shows as a material on or around it. Each skill has its own effect so a glance
// tells you which power is live.
//
// Every effect is built around a card group lying flat (face up +y, CARD_W across x,
// CARD_H along z). attach() returns { update(dt), burst(), dispose(), floor }: update
// runs each frame while the card is ready, burst plays once when the skill fires.
// Glows and rings that belong on the ground go in `floor`, a group the caller keeps
// pinned just above the surface the card stands on, so they never sink into it.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, Mesh,
  MeshBasicMaterial, NormalBlending, PlaneGeometry, Points, PointsMaterial, RingGeometry, ShaderMaterial, ShapeGeometry,
} from 'three';
import { CARD_H, CARD_T, CARD_TIP, CARD_W, cutShape } from './TableBlockout.js';

export const SKILL_FX = {
  mastermind: { name: 'Electric', color: 0x7fd8ff, note: 'Arcs crawl the edge while the IGL can rotate' },
  flex: { name: 'Hologram', color: 0x9be7ff, note: 'A rainbow sheen sweeps while it can move free' },
  flick: { name: 'Glint', color: 0xffd36b, note: 'A gold glint and sparks when it stands alone' },
  one_trick: { name: 'Ember', color: 0xff8a3d, note: 'Embers rise from a warm glow on its map' },
  aura: { name: 'Shockwave', color: 0xb98cff, note: 'Rings roll out across the lane at the enemy' },
  anchor: { name: 'Bastion', color: 0x60a5fa, note: 'Defensive shield pulses along site boundary' },
  first_blood: { name: 'Duelist', color: 0xf87171, note: 'Fiery crimson sparks and opening aggression trail' },
  clutch: { name: 'Focus', color: 0xc084fc, note: 'Violet focus flare when holding the site alone' },
  synergy_link: { name: 'Resonance', color: 0x22d3ee, note: 'Harmonic resonance rings connecting to lane allies' },
  overdrive: { name: 'Overdrive', color: 0xff003c, note: 'Crimson fury shockwave and electric sparks radiating across lanes' },
  ironclad: { name: 'Fortress', color: 0x8a96a3, note: 'A steel plate edge and an amber scan line' },
  lurk: { name: 'Smoke', color: 0x5fa59a, note: 'Slow smoke curling from its feet' },
  velocity: { name: 'Slipstream', color: 0x84cc16, note: 'Streaks running off its back edge' },
  combustion: { name: 'Heat', color: 0xff8a3d, note: 'Heat shimmer and embers off the top edge' },
  phase: { name: 'Rift', color: 0x7c5cff, note: 'A dark hole under it, motes spiralling in' },
  timewarp: { name: 'Dial', color: 0xd8b34c, note: 'A brass dial ticking backwards' },
  surge: { name: 'Weather', color: 0xcfe3ff, note: 'Rain over the card and the odd lightning flash' },
  ascendance: { name: 'Column', color: 0xffd1dc, note: 'A column of light and falling feathers' },
  dominion: { name: 'Seal', color: 0xffd76a, note: 'A gold seal turning under her' },
  timewarp_spent: { name: 'Stopped', color: 0x6b5a33, note: 'The dial stopped and cracked: used this series' },
  black_hole: { name: 'Lensing', color: 0x22d3ee, note: 'A dark core, a hot rim, dust spiralling in' },
};

const TOP = CARD_T / 2 + 0.004;

// The card outline as points around its six corners, at the face's height.
function outline(samples, grow = 0) {
  const hw = CARD_W / 2 + grow;
  const hh = CARD_H / 2 + grow;
  const tip = CARD_TIP;
  const corners = [[-hw, hh - tip], [0, hh], [hw, hh - tip], [hw, -hh + tip], [0, -hh], [-hw, -hh + tip]];
  const edges = corners.map((p, i) => [p, corners[(i + 1) % corners.length]]);
  const lengths = edges.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lengths.reduce((sum, l) => sum + l, 0);
  const out = [];
  for (let k = 0; k < samples; k += 1) {
    let d = (k / samples) * total;
    let e = 0;
    while (d > lengths[e]) { d -= lengths[e]; e += 1; }
    const [a, b] = edges[e];
    const t = d / lengths[e];
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    // shape y runs to -z once the face is laid flat
    out.push([x, -y, (b[1] - a[1]) / lengths[e], -(b[0] - a[0]) / lengths[e]]);
  }
  return out;
}

function softDot() {
  const el = document.createElement('canvas');
  el.width = el.height = 64;
  const ctx = el.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(el);
}

// The Chronos dial: hour ticks round a ring. Spent, it is dull and cracked across.
function dialTexture(spent) {
  const el = document.createElement('canvas');
  el.width = el.height = 256;
  const ctx = el.getContext('2d');
  ctx.translate(128, 128);
  ctx.strokeStyle = spent ? '#6b5a33' : '#ffe08a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0, Math.PI * 2);
  ctx.stroke();
  for (let h = 0; h < 60; h += 1) {
    const a = (h / 60) * Math.PI * 2;
    const r0 = h % 5 ? 100 : 86;
    ctx.lineWidth = h % 5 ? 2 : 5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * 108, Math.sin(a) * 108);
    ctx.stroke();
  }
  if (spent) {
    ctx.strokeStyle = '#c9c1a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    [[-104, -30], [-40, -8], [-12, 30], [36, 18], [70, 60], [96, 52]].forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
    ctx.moveTo(-12, 30);
    ctx.lineTo(-30, 90);
    ctx.stroke();
  }
  return new CanvasTexture(el);
}

// The Sovereign's seal: a crown of points inside two gold rings.
function sealTexture() {
  const el = document.createElement('canvas');
  el.width = el.height = 256;
  const ctx = el.getContext('2d');
  ctx.translate(128, 128);
  ctx.strokeStyle = '#ffd76a';
  for (const [r, w] of [[116, 3], [98, 6]]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffd76a';
  for (let k = 0; k < 24; k += 1) {
    const a = (k / 24) * Math.PI * 2;
    const r1 = k % 3 ? 100 : 112;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.05) * 98, Math.sin(a - 0.05) * 98);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + 0.05) * 98, Math.sin(a + 0.05) * 98);
    ctx.fill();
  }
  return new CanvasTexture(el);
}

// A soft glow the shape of the card, a little larger than it, lying just under it.
function glowTexture() {
  const pad = 60;
  const w = 400 + pad * 2;
  const h = 580 + pad * 2;
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  ctx.translate(pad, pad);
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 40;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 18;
  ctx.beginPath();
  [[0, 40], [200, 0], [400, 40], [400, 540], [200, 580], [0, 540]].forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  ctx.closePath();
  ctx.stroke();
  ctx.stroke();
  return { map: new CanvasTexture(el), scaleX: w / 400, scaleY: h / 580 };
}

function rimGlow(color) {
  const { map, scaleX, scaleY } = glowTexture();
  const mesh = new Mesh(
    new PlaneGeometry(CARD_W * scaleX, CARD_H * scaleY),
    new MeshBasicMaterial({ map, color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -CARD_T / 2 - 0.002;
  mesh.renderOrder = 2;
  return mesh;
}

// A band of light that sweeps across the face, clipped to the card's own shape.
function sweep({ hue, width, speed, rainbow }) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { t: { value: 0 }, strength: { value: 0 }, tint: { value: new Color(hue) } },
    vertexShader: 'varying vec2 vPos; void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float t; uniform float strength; uniform vec3 tint; varying vec2 vPos;
      vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float d = vPos.x * 0.8 + vPos.y - (mod(t * ${speed.toFixed(2)}, 3.6) - 1.8);
        float band = smoothstep(${width.toFixed(2)}, 0.0, abs(d));
        vec3 c = ${rainbow ? 'mix(tint, hue(fract(vPos.y * 0.6 + t * 0.15)), 0.75)' : 'tint'};
        gl_FragColor = vec4(c * band * strength, band * strength);
      }`,
  });
  const mesh = new Mesh(new ShapeGeometry(cutShape(CARD_W, CARD_H, CARD_TIP)), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = TOP + 0.002;
  mesh.renderOrder = 3;
  return { mesh, material };
}

function particles(count, color, size, blending = AdditiveBlending) {
  const geometry = new BufferGeometry();
  const pos = new Float32Array(count * 3);
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  const points = new Points(geometry, new PointsMaterial({ color, size, map: softDot(), transparent: true, depthWrite: false, blending, sizeAttenuation: true }));
  points.renderOrder = 4;
  const life = new Float32Array(count).fill(-1);
  const vel = new Float32Array(count * 3);
  return { points, pos, life, vel, geometry };
}

/** The ready pose: lifted and tipped toward the camera, with a slow breathing bob. */
export function readyPose(group, time, amount = 1) {
  group.position.y = (0.18 + Math.sin(time * 2.2) * 0.025) * amount;
  group.rotation.x = 0.32 * amount;
  group.rotation.z = Math.sin(time * 1.3) * 0.03 * amount;
}

export function attachSkillFx(group, skill, { floorParent = group } = {}) {
  const fx = new Group();
  group.add(fx);
  const floor = new Group();
  floorParent.add(floor);
  const spec = SKILL_FX[skill];
  const rim = rimGlow(spec.color);
  fx.add(rim);
  let time = 0;
  let burst = 0;
  const parts = [];
  const disposers = [() => { rim.geometry.dispose(); rim.material.map.dispose(); rim.material.dispose(); }];

  let update = () => {};

  if (skill === 'mastermind') {
    // Lightning drawn on a canvas laid over the card's edge and redrawn many times a
    // second: arcs crawl round the outline and now and then jump off it.
    const pad = 70;
    const el = document.createElement('canvas');
    el.width = 400 + pad * 2;
    el.height = 580 + pad * 2;
    const ctx = el.getContext('2d');
    const map = new CanvasTexture(el);
    const plane = new Mesh(
      new PlaneGeometry(CARD_W * (el.width / 400), CARD_H * (el.height / 580)),
      new MeshBasicMaterial({ map, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = TOP + 0.006;
    plane.renderOrder = 5;
    fx.add(plane);
    const corners = [[0, 40], [200, 0], [400, 40], [400, 540], [200, 580], [0, 540]];
    const perimeter = [];
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % corners.length];
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12);
      for (let k = 0; k < steps; k += 1) perimeter.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
    });
    const bolt = (from, length, spread) => {
      ctx.beginPath();
      for (let k = 0; k <= length; k += 1) {
        const [x, y] = perimeter[(from + k) % perimeter.length];
        const jx = x + (Math.random() - 0.5) * spread + pad;
        const jy = y + (Math.random() - 0.5) * spread + pad;
        if (k) ctx.lineTo(jx, jy); else ctx.moveTo(jx, jy);
      }
      ctx.stroke();
    };
    let redraw = 0;
    update = (dt) => {
      rim.material.opacity = 0.5 + Math.random() * 0.3 + burst;
      redraw -= dt;
      if (redraw > 0) return;
      redraw = 0.06;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.lineJoin = 'round';
      const arcs = 3 + (burst > 0 ? 4 : 0);
      for (let n = 0; n < arcs; n += 1) {
        const from = Math.floor(Math.random() * perimeter.length);
        const length = 8 + Math.floor(Math.random() * 14) + (burst > 0 ? 10 : 0);
        ctx.shadowColor = '#5fd0ff';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(120, 215, 255, .9)';
        ctx.lineWidth = 7;
        bolt(from, length, 22);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        bolt(from, length, 14);
      }
      map.needsUpdate = true;
    };
    disposers.push(() => { plane.geometry.dispose(); map.dispose(); plane.material.dispose(); });
  }

  if (skill === 'flex') {
    const band = sweep({ hue: spec.color, width: 0.5, speed: 1.4, rainbow: true });
    fx.add(band.mesh);
    update = () => {
      band.material.uniforms.t.value = time;
      band.material.uniforms.strength.value = 0.85 + burst * 0.8;
      rim.material.opacity = 0.35 + Math.sin(time * 3) * 0.1 + burst;
    };
    disposers.push(() => { band.mesh.geometry.dispose(); band.material.dispose(); });
  }

  if (skill === 'flick') {
    const band = sweep({ hue: spec.color, width: 0.12, speed: 2.4, rainbow: false });
    fx.add(band.mesh);
    const sparks = particles(40, spec.color, 0.07);
    fx.add(sparks.points);
    parts.push(sparks);
    update = (dt) => {
      band.material.uniforms.t.value = time;
      band.material.uniforms.strength.value = 1 + burst;
      rim.material.opacity = 0.3 + burst;
      emit(sparks, dt, 18 + burst * 60, () => {
        const [x, z] = edgePoint();
        return [x, TOP, z, (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6, 0.5];
      }, 1.6);
    };
    disposers.push(() => { band.mesh.geometry.dispose(); band.material.dispose(); });
  }

  if (skill === 'one_trick') {
    const glow = new Mesh(new PlaneGeometry(CARD_W * 2.2, CARD_H * 1.8), new MeshBasicMaterial({ map: softDot(), color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    glow.rotation.x = -Math.PI / 2;
    floor.add(glow);
    const embers = particles(50, spec.color, 0.06);
    fx.add(embers.points);
    parts.push(embers);
    update = (dt) => {
      glow.material.opacity = 0.45 + Math.sin(time * 4) * 0.12 + burst * 0.6;
      rim.material.opacity = 0.45 + Math.sin(time * 4) * 0.1 + burst;
      emit(embers, dt, 22 + burst * 50, () => [
        (Math.random() - 0.5) * CARD_W * 1.1, -0.1, (Math.random() - 0.5) * CARD_H * 0.9,
        (Math.random() - 0.5) * 0.15, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.15, 0.2,
      ], 2.2);
    };
    disposers.push(() => { glow.geometry.dispose(); glow.material.dispose(); });
  }

  if (skill === 'aura') {
    // Rings that start at the card's feet and roll out across its lane.
    const rings = [0, 1, 2].map(() => {
      const mesh = new Mesh(new RingGeometry(0.9, 1, 64), new MeshBasicMaterial({ color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.002;
      floor.add(mesh);
      return mesh;
    });
    const glow = new Mesh(new PlaneGeometry(CARD_W * 1.8, CARD_H * 1.5), new MeshBasicMaterial({ map: softDot(), color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.35 }));
    glow.rotation.x = -Math.PI / 2;
    floor.add(glow);
    update = () => {
      rings.forEach((ring, n) => {
        const phase = ((time * (0.6 + burst)) + n / rings.length) % 1;
        const r = 0.45 + phase * 0.75;
        ring.scale.set(r, r, 1);
        ring.material.opacity = (1 - phase) * 0.8;
      });
      glow.material.opacity = 0.3 + Math.sin(time * 2.5) * 0.08 + burst * 0.4;
      rim.material.opacity = 0.4 + burst;
    };
    disposers.push(() => { rings.forEach(ring => { ring.geometry.dispose(); ring.material.dispose(); }); glow.geometry.dispose(); glow.material.dispose(); });
  }

  if (skill === 'anchor') {
    const band = sweep({ hue: spec.color, width: 0.22, speed: 1.8, rainbow: false });
    fx.add(band.mesh);
    const rings = [0, 1].map(() => {
      const mesh = new Mesh(new RingGeometry(0.7, 0.8, 48), new MeshBasicMaterial({ color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.002;
      floor.add(mesh);
      return mesh;
    });
    const glow = new Mesh(new PlaneGeometry(CARD_W * 1.8, CARD_H * 1.5), new MeshBasicMaterial({ map: softDot(), color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.35 }));
    glow.rotation.x = -Math.PI / 2;
    floor.add(glow);
    update = () => {
      band.material.uniforms.t.value = time;
      band.material.uniforms.strength.value = 0.8 + burst;
      rings.forEach((ring, n) => {
        const phase = ((time * (0.5 + burst * 0.8)) + n * 0.5) % 1;
        const r = 0.6 + phase * 0.5;
        ring.scale.set(r, r, 1);
        ring.material.opacity = (1 - phase) * 0.7;
      });
      glow.material.opacity = 0.3 + Math.sin(time * 2.5) * 0.08 + burst * 0.4;
      rim.material.opacity = 0.4 + burst;
    };
    disposers.push(() => {
      band.mesh.geometry.dispose(); band.material.dispose();
      rings.forEach(r => { r.geometry.dispose(); r.material.dispose(); });
      glow.geometry.dispose(); glow.material.dispose();
    });
  }

  if (skill === 'first_blood') {
    const band = sweep({ hue: spec.color, width: 0.15, speed: 2.8, rainbow: false });
    fx.add(band.mesh);
    const sparks = particles(50, spec.color, 0.08);
    fx.add(sparks.points);
    parts.push(sparks);
    update = (dt) => {
      band.material.uniforms.t.value = time;
      band.material.uniforms.strength.value = 1.1 + burst * 1.2;
      rim.material.opacity = 0.45 + burst * 0.6;
      emit(sparks, dt, 22 + burst * 80, () => {
        const [x, z] = edgePoint();
        return [x, TOP, z, (Math.random() - 0.5) * 0.7, 1.8 + Math.random() * 1.4, (Math.random() - 0.5) * 0.7, 0.45];
      }, 1.4);
    };
    disposers.push(() => { band.mesh.geometry.dispose(); band.material.dispose(); });
  }

  if (skill === 'clutch') {
    const glow = new Mesh(new PlaneGeometry(CARD_W * 2.0, CARD_H * 1.7), new MeshBasicMaterial({ map: softDot(), color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    glow.rotation.x = -Math.PI / 2;
    floor.add(glow);
    const motes = particles(45, spec.color, 0.07);
    fx.add(motes.points);
    parts.push(motes);
    update = (dt) => {
      glow.material.opacity = 0.4 + Math.sin(time * 3.5) * 0.14 + burst * 0.6;
      rim.material.opacity = 0.5 + burst * 0.5;
      emit(motes, dt, 18 + burst * 60, () => [
        (Math.random() - 0.5) * CARD_W * 1.1, 0, (Math.random() - 0.5) * CARD_H * 1.1,
        (Math.random() - 0.5) * 0.2, 0.8 + Math.random() * 0.7, (Math.random() - 0.5) * 0.2, 0.25,
      ], 1.8);
    };
    disposers.push(() => { glow.geometry.dispose(); glow.material.dispose(); });
  }

  if (skill === 'synergy_link') {
    const rings = [0, 1, 2].map(() => {
      const mesh = new Mesh(new RingGeometry(0.85, 0.95, 64), new MeshBasicMaterial({ color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.002;
      floor.add(mesh);
      return mesh;
    });
    const band = sweep({ hue: spec.color, width: 0.3, speed: 2.0, rainbow: false });
    fx.add(band.mesh);
    update = () => {
      band.material.uniforms.t.value = time;
      band.material.uniforms.strength.value = 0.9 + burst;
      rings.forEach((ring, n) => {
        const phase = ((time * (0.7 + burst * 0.9)) + n / rings.length) % 1;
        const r = 0.35 + phase * 0.8;
        ring.scale.set(r, r, 1);
        ring.material.opacity = (1 - phase) * 0.8;
      });
      rim.material.opacity = 0.4 + burst * 0.5;
    };
    disposers.push(() => {
      band.mesh.geometry.dispose(); band.material.dispose();
      rings.forEach(r => { r.geometry.dispose(); r.material.dispose(); });
    });
  }

  if (skill === 'overdrive') {
    const rings = [0, 1, 2].map(() => {
      const mesh = new Mesh(new RingGeometry(0.85, 0.98, 64), new MeshBasicMaterial({ color: spec.color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.003;
      floor.add(mesh);
      return mesh;
    });
    const sparks = particles(50, spec.color, 0.08);
    fx.add(sparks.points);
    parts.push(sparks);
    update = (dt) => {
      rings.forEach((ring, n) => {
        const phase = ((time * (1.1 + burst * 1.5)) + n / rings.length) % 1;
        const r = 0.4 + phase * 1.1;
        ring.scale.set(r, r, 1);
        ring.material.opacity = (1 - phase) * (0.85 + burst * 0.15);
      });
      rim.material.opacity = 0.55 + burst * 0.45;
      emit(sparks, dt, 26 + burst * 90, () => {
        const [x, z] = edgePoint();
        return [x, TOP, z, (Math.random() - 0.5) * 1.1, 2.0 + Math.random() * 1.6, (Math.random() - 0.5) * 1.1, 0.5];
      }, 1.3);
    };
    disposers.push(() => {
      rings.forEach(r => { r.geometry.dispose(); r.material.dispose(); });
    });
  }

  // ── evo skills: each keeps its effect inside the card's footprint ──────────

  if (skill === 'ironclad') {
    // A steel plate's edge round the card and an amber scan line crossing it.
    const plate = new Mesh(new ShapeGeometry(cutShape(CARD_W + 0.08, CARD_H + 0.08, CARD_TIP + 0.01)), new MeshBasicMaterial({ color: 0x8a96a3, transparent: true, opacity: 0.85, depthWrite: false }));
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = -CARD_T / 2 - 0.003;
    fx.add(plate);
    const scan = sweep({ hue: 0xf59e0b, width: 0.06, speed: 0.9, rainbow: false });
    fx.add(scan.mesh);
    const sparks = particles(24, 0xffc46b, 0.06);
    fx.add(sparks.points);
    parts.push(sparks);
    update = (dt) => {
      scan.material.uniforms.t.value = time;
      scan.material.uniforms.strength.value = 0.9 + burst;
      rim.material.opacity = 0.18 + burst * 0.6;
      emit(sparks, dt, burst * 70, () => {
        const [x, z] = edgePoint();
        return [x, TOP, z, x * 1.8, 0.9 + Math.random(), z * 0.8, 0];
      }, 0.5);
    };
    disposers.push(() => { plate.geometry.dispose(); plate.material.dispose(); scan.mesh.geometry.dispose(); scan.material.dispose(); });
  }

  if (skill === 'lurk') {
    // Smoke: big slow puffs curling up from the card's feet, nothing bright.
    const smoke = particles(36, 0x5fa59a, 0.55, NormalBlending);
    smoke.points.material.opacity = 0.32;
    fx.add(smoke.points);
    parts.push(smoke);
    update = (dt) => {
      rim.material.opacity = 0.05 + burst * 0.3;
      emit(smoke, dt, 9 + burst * 40, () => [
        (Math.random() - 0.5) * CARD_W, -0.02, (Math.random() - 0.5) * CARD_H,
        (Math.random() - 0.5) * 0.12, 0.12 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12,
      ], 2.6, 0);
    };
  }

  if (skill === 'velocity') {
    // Slipstream: streaks run off the card's back edge, and a fast sheen.
    const band = sweep({ hue: spec.color, width: 0.18, speed: 3.6, rainbow: false });
    fx.add(band.mesh);
    const streaks = particles(40, spec.color, 0.07);
    fx.add(streaks.points);
    parts.push(streaks);
    update = (dt) => {
      band.material.uniforms.t.value = time;
      band.material.uniforms.strength.value = 0.8 + burst;
      rim.material.opacity = 0.3 + burst;
      emit(streaks, dt, 30 + burst * 80, () => [
        (Math.random() - 0.5) * CARD_W, TOP + 0.02, -CARD_H / 2,
        0, 0, 3 + Math.random() * 2,
      ], 0.35, 0);
    };
    disposers.push(() => { band.mesh.geometry.dispose(); band.material.dispose(); });
  }

  if (skill === 'combustion') {
    // Heat: a warm shimmer, embers lifting off the top edge, a low glow underneath.
    const heat = sweep({ hue: 0xff8a3d, width: 0.4, speed: 0.8, rainbow: false });
    fx.add(heat.mesh);
    const embers = particles(40, 0xffa94d, 0.06);
    fx.add(embers.points);
    parts.push(embers);
    update = (dt) => {
      heat.material.uniforms.t.value = time;
      heat.material.uniforms.strength.value = 0.35 + Math.sin(time * 9) * 0.08 + burst;
      rim.material.opacity = 0.35 + Math.sin(time * 7) * 0.08 + burst;
      emit(embers, dt, 16 + burst * 60, () => {
        const [x, z] = edgePoint();
        return [x, TOP, z, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3];
      }, 1.6, 0.25);
    };
    disposers.push(() => { heat.mesh.geometry.dispose(); heat.material.dispose(); });
  }

  if (skill === 'phase') {
    // A rift: a dark hole under the card (it darkens, it doesn't glow), with
    // violet motes spiralling into it.
    const hole = new Mesh(new PlaneGeometry(CARD_W * 2.3, CARD_W * 2.3), new MeshBasicMaterial({ map: softDot(), color: 0x05010c, transparent: true, depthWrite: false, opacity: 0.85 }));
    hole.rotation.x = -Math.PI / 2;
    floor.add(hole);
    const edge = new Mesh(new RingGeometry(0.46, 0.5, 64), new MeshBasicMaterial({ color: 0x7c5cff, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.002;
    floor.add(edge);
    const motes = particles(30, 0xa78bfa, 0.05);
    floor.add(motes.points);
    parts.push(motes);
    update = (dt) => {
      const r = CARD_W * (0.78 + Math.sin(time * 1.4) * 0.03 + burst * 0.15);
      edge.scale.set(r * 2, r * 2, 1);
      edge.rotation.z = -time * 0.6;
      edge.material.opacity = 0.4 + burst * 0.5;
      rim.material.opacity = 0.08 + burst * 0.3;
      emit(motes, dt, 14 + burst * 40, () => {
        const a = Math.random() * Math.PI * 2;
        const d = CARD_W * 0.95;
        return [Math.cos(a) * d, 0.01, Math.sin(a) * d, -Math.sin(a) * 0.7 - Math.cos(a) * 0.6, 0, Math.cos(a) * 0.7 - Math.sin(a) * 0.6];
      }, 1.2, 0);
    };
    disposers.push(() => { hole.geometry.dispose(); hole.material.map.dispose(); hole.material.dispose(); edge.geometry.dispose(); edge.material.dispose(); });
  }

  if (skill === 'timewarp' || skill === 'timewarp_spent') {
    // A brass dial on the floor. Charged, it ticks backwards and the edge lights;
    // spent, it is stopped, cracked and dull, and nothing glows.
    const spent = skill === 'timewarp_spent';
    const dial = new Mesh(new PlaneGeometry(CARD_W * 1.35, CARD_W * 1.35), new MeshBasicMaterial({ map: dialTexture(spent), transparent: true, depthWrite: false, opacity: spent ? 0.55 : 0.9, blending: spent ? NormalBlending : AdditiveBlending }));
    dial.rotation.x = -Math.PI / 2;
    floor.add(dial);
    const hand = new Mesh(new PlaneGeometry(0.035, CARD_W * 0.55), new MeshBasicMaterial({ color: spent ? 0x6b5a33 : 0xfff1c4, transparent: true, depthWrite: false, blending: spent ? NormalBlending : AdditiveBlending }));
    hand.geometry.translate(0, CARD_W * 0.27, 0);
    hand.rotation.x = -Math.PI / 2;
    hand.position.y = 0.003;
    floor.add(hand);
    if (spent) {
      rim.material.opacity = 0;
      hand.rotation.z = 0.7;
      update = () => {};
    } else {
      let tick = 0;
      update = (dt) => {
        tick += dt;
        // A step back each second, with a little overshoot, like a real escapement.
        const steps = Math.floor(tick);
        const frac = tick - steps;
        hand.rotation.z = (steps + Math.min(1, frac * 8) * (1 + Math.sin(Math.min(1, frac * 8) * Math.PI) * 0.15)) * (Math.PI / 6);
        dial.rotation.z = tick * 0.05;
        dial.material.opacity = 0.7 + burst * 0.3;
        rim.material.opacity = 0.3 + burst;
      };
    }
    disposers.push(() => { dial.geometry.dispose(); dial.material.map.dispose(); dial.material.dispose(); hand.geometry.dispose(); hand.material.dispose(); });
  }

  if (skill === 'surge') {
    // Weather over the card: short rain streaks, and a white flash now and then.
    const rain = particles(40, 0xcfe3ff, 0.035);
    fx.add(rain.points);
    parts.push(rain);
    let flash = 0;
    let next = 1.5;
    update = (dt) => {
      next -= dt;
      if (next < 0) { flash = 1; next = 2 + Math.random() * 3; }
      flash = Math.max(0, flash - dt * 6);
      rim.material.color.setHex(flash > 0.05 ? 0xffffff : spec.color);
      rim.material.opacity = 0.25 + flash * 0.9 + burst;
      emit(rain, dt, 40 + burst * 80, () => [
        (Math.random() - 0.5) * CARD_W, 0.9, (Math.random() - 0.5) * CARD_H,
        0.15, -3.5, 0.1,
      ], 0.28, 0);
    };
  }

  if (skill === 'ascendance') {
    // Light from above: seen top-down, a pale halo pooled round her and a soft
    // sheen down her face, with feathers drifting through it.
    const halo = new Mesh(new PlaneGeometry(CARD_W * 2.1, CARD_H * 1.6), new MeshBasicMaterial({ map: softDot(), color: 0xffd1dc, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    halo.rotation.x = -Math.PI / 2;
    floor.add(halo);
    const sheen = sweep({ hue: 0xfff1f4, width: 0.9, speed: 0.5, rainbow: false });
    fx.add(sheen.mesh);
    const feathers = particles(24, 0xfff1f4, 0.09);
    fx.add(feathers.points);
    parts.push(feathers);
    update = (dt) => {
      halo.material.opacity = 0.4 + Math.sin(time * 2) * 0.08 + burst * 0.4;
      sheen.material.uniforms.t.value = time;
      sheen.material.uniforms.strength.value = 0.25 + burst * 0.6;
      rim.material.opacity = 0.35 + burst;
      emit(feathers, dt, 6 + burst * 30, () => [
        (Math.random() - 0.5) * CARD_W, 1.4, (Math.random() - 0.5) * CARD_H,
        Math.sin(time * 3) * 0.2, -0.35, 0,
      ], 3.5, 0);
    };
    disposers.push(() => { halo.geometry.dispose(); halo.material.map.dispose(); halo.material.dispose(); sheen.mesh.geometry.dispose(); sheen.material.dispose(); });
  }

  if (skill === 'dominion') {
    // The seal: a gold ring pressed into the floor under her, slowly turning.
    const seal = new Mesh(new PlaneGeometry(CARD_W * 1.45, CARD_W * 1.45), new MeshBasicMaterial({ map: sealTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.8 }));
    seal.rotation.x = -Math.PI / 2;
    floor.add(seal);
    const motes = particles(24, 0xffd76a, 0.05);
    fx.add(motes.points);
    parts.push(motes);
    update = (dt) => {
      seal.rotation.z = time * 0.15;
      seal.material.opacity = 0.65 + Math.sin(time * 2) * 0.08 + burst * 0.35;
      rim.material.opacity = 0.4 + burst;
      emit(motes, dt, 8 + burst * 40, () => {
        const [x, z] = edgePoint();
        return [x, TOP, z, 0, 0.4 + Math.random() * 0.3, 0];
      }, 1.8, 0);
    };
    disposers.push(() => { seal.geometry.dispose(); seal.material.map.dispose(); seal.material.dispose(); });
  }

  if (skill === 'black_hole') {
    // Lensing: a dark core, a hot thin rim, and dust spiralling in.
    const core = new Mesh(new PlaneGeometry(CARD_W * 1.1, CARD_W * 1.1), new MeshBasicMaterial({ map: softDot(), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.9 }));
    core.rotation.x = -Math.PI / 2;
    floor.add(core);
    const ring = new Mesh(new RingGeometry(0.47, 0.5, 64), new MeshBasicMaterial({ color: 0xe6fbff, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    floor.add(ring);
    const dust = particles(40, 0x22d3ee, 0.045);
    floor.add(dust.points);
    parts.push(dust);
    update = (dt) => {
      const r = CARD_W * (0.62 + burst * 0.2);
      ring.scale.set(r * 2, r * 2 * 0.9, 1);
      ring.material.opacity = 0.6 + Math.sin(time * 5) * 0.1 + burst * 0.4;
      rim.material.opacity = 0.2 + burst * 0.6;
      emit(dust, dt, 20 + burst * 60, () => {
        const a = Math.random() * Math.PI * 2;
        const d = CARD_W * 0.8;
        return [Math.cos(a) * d, 0.01, Math.sin(a) * d, -Math.sin(a) * 0.9 - Math.cos(a) * 0.7, 0, Math.cos(a) * 0.9 - Math.sin(a) * 0.7];
      }, 1, 0);
    };
    disposers.push(() => { core.geometry.dispose(); core.material.map.dispose(); core.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); });
  }

  const noHit = (node) => { node.raycast = () => {}; };
  fx.traverse(noHit);
  floor.traverse(noHit);

  const edge = outline(90);
  function edgePoint() {
    const [x, z] = edge[Math.floor(Math.random() * edge.length)];
    return [x, z];
  }
  function emit(p, dt, rate, spawn, lifeMax, gravity = 1.2) {
    const arr = p.pos;
    let toSpawn = rate * dt;
    for (let k = 0; k < p.life.length; k += 1) {
      if (p.life[k] < 0 && toSpawn > Math.random()) {
        const [x, y, z, vx, vy, vz] = spawn();
        arr[k * 3] = x; arr[k * 3 + 1] = y; arr[k * 3 + 2] = z;
        p.vel[k * 3] = vx; p.vel[k * 3 + 1] = vy; p.vel[k * 3 + 2] = vz;
        p.life[k] = lifeMax * (0.5 + Math.random() * 0.5);
        toSpawn -= 1;
      }
      if (p.life[k] >= 0) {
        p.life[k] -= dt;
        arr[k * 3] += p.vel[k * 3] * dt;
        arr[k * 3 + 1] += p.vel[k * 3 + 1] * dt;
        arr[k * 3 + 2] += p.vel[k * 3 + 2] * dt;
        p.vel[k * 3 + 1] -= gravity * dt;
        if (p.life[k] < 0) arr[k * 3 + 1] = -99;
      }
    }
    p.geometry.attributes.position.needsUpdate = true;
  }
  for (const p of parts) p.pos.fill(-99);

  return {
    update(dt) {
      time += dt;
      burst = Math.max(0, burst - dt * 1.4);
      update(dt);
    },
    burst() { burst = 1; },
    floor,
    setVisible(on) { fx.visible = on; floor.visible = on; },
    dispose() {
      for (const p of parts) { p.geometry.dispose(); p.points.material.map.dispose(); p.points.material.dispose(); }
      disposers.forEach(fn => fn());
      group.remove(fx);
      floor.parent?.remove(floor);
    },
  };
}
