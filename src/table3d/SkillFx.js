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
  MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, RingGeometry, ShaderMaterial, ShapeGeometry,
} from 'three';
import { CARD_H, CARD_T, CARD_TIP, CARD_W, cutShape } from './TableBlockout.js';

export const SKILL_FX = {
  mastermind: { name: 'Electric', color: 0x7fd8ff, note: 'Arcs crawl the edge while the IGL can rotate' },
  flex: { name: 'Hologram', color: 0x9be7ff, note: 'A rainbow sheen sweeps while it can move free' },
  flick: { name: 'Glint', color: 0xffd36b, note: 'A gold glint and sparks when it stands alone' },
  one_trick: { name: 'Ember', color: 0xff8a3d, note: 'Embers rise from a warm glow on its map' },
  aura: { name: 'Shockwave', color: 0xb98cff, note: 'Rings roll out across the lane at the enemy' },
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

function particles(count, color, size) {
  const geometry = new BufferGeometry();
  const pos = new Float32Array(count * 3);
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  const points = new Points(geometry, new PointsMaterial({ color, size, map: softDot(), transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }));
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

  const noHit = (node) => { node.raycast = () => {}; };
  fx.traverse(noHit);
  floor.traverse(noHit);

  const edge = outline(90);
  function edgePoint() {
    const [x, z] = edge[Math.floor(Math.random() * edge.length)];
    return [x, z];
  }
  function emit(p, dt, rate, spawn, lifeMax) {
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
        p.vel[k * 3 + 1] -= 1.2 * dt;
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
