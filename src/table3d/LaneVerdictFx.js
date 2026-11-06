// Verdict effects for each lane on the 2.5D board once its score resolves:
// - Winning lane ('you'): bright surface + a luminous emerald/mint 6-sided border VFX
//   with travelling perimeter energy pulses and a victory shockwave flash.
// - Losing lane ('them'): physically shatters the 3D lane into polygonal glass/stone
//   shard slabs that split apart along the seams, tilt slightly, tint crimson-red,
//   and show internal glass fractures and glowing red seam edges.

import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  Group, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  ShaderMaterial, Shape, ShapeGeometry, SRGBColorSpace,
} from 'three';
import { gsap } from 'gsap';
import { LANE_W, cutShape, slab } from './TableBlockout.js';
import { mulberry32 } from '../../shared/src/engine/perfectRun.js';

const WIN_OUTSET = 0.14;
// How long the cracks show on the whole lane before it breaks apart, in seconds.
const CRACK = 0.09;
const HIDDEN_MAT = new MeshBasicMaterial({ visible: false });

export function attachLaneVerdictFx(laneMesh, verdict, { len, tip, laneIndex = 0, reducedMotion = false, instant = false, onUpdate } = {}) {
  disposeLaneVerdictFx(laneMesh);
  if (!verdict) return null;

  if (verdict === 'you') {
    return attachWinBorderFx(laneMesh, { len, tip, reducedMotion, instant, onUpdate });
  }
  if (verdict === 'them') {
    return attachLossShatterFx(laneMesh, { len, tip, laneIndex, reducedMotion, instant, onUpdate });
  }
  return null;
}

export function disposeLaneVerdictFx(laneMesh) {
  const prev = laneMesh?.userData?.verdictFx;
  if (!prev) return;
  prev.dispose();
  laneMesh.userData.verdictFx = null;
}

/**
 * Celebratory 3-lane sweep surge: pulses the border flash and top surface emissive
 * across all winning lanes with an emerald-cyan wave.
 */
export function triggerFlawlessSweepFx(laneMeshes, { reducedMotion = false, onUpdate } = {}) {
  if (!laneMeshes || reducedMotion) return;
  laneMeshes.forEach((laneMesh, index) => {
    const fx = laneMesh?.userData?.verdictFx;
    if (!fx || fx.verdict !== 'you') return;
    const { top } = laneMesh.userData;
    if (fx.uniforms?.uFlash) {
      fx.uniforms.uFlash.value = 1.35;
      gsap.to(fx.uniforms.uFlash, {
        value: 0,
        duration: 0.85,
        delay: index * 0.08,
        ease: 'power2.out',
        onUpdate,
      });
    }
    if (top?.emissive) {
      const orig = top.emissive.getHex();
      top.emissive.setHex(0x1fd5a8);
      gsap.to(top.emissive, {
        r: ((orig >> 16) & 255) / 255,
        g: ((orig >> 8) & 255) / 255,
        b: (orig & 255) / 255,
        duration: 0.95,
        delay: index * 0.08,
        ease: 'power2.out',
        onUpdate,
      });
    }
  });
}

// ── WINNING LANE: BRIGHT + LUMINOUS BORDER VFX ──────────────────────────────

function attachWinBorderFx(laneMesh, { len, tip, reducedMotion, instant, onUpdate }) {
  const { top, fade } = laneMesh.userData;
  if (top) {
    top.color.setHex(0xffffff);
    top.emissive?.setHex(0x123028);
    top.roughness = 0.78;
  }
  if (fade?.material) {
    fade.material.opacity = 0.42;
  }

  const hw = LANE_W / 2;
  const hh = len / 2;
  const shape = cutShape(LANE_W + WIN_OUTSET * 2, len + WIN_OUTSET * 2, tip + 0.02);
  const geometry = new ShapeGeometry(shape);

  const uniforms = {
    uTime: { value: 0 },
    uFlash: { value: instant || reducedMotion ? 0 : 1 },
    uHw: { value: hw },
    uHh: { value: hh },
    uTip: { value: tip },
  };

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms,
    vertexShader: `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlash;
      uniform float uHw;
      uniform float uHh;
      uniform float uTip;
      varying vec2 vPos;

      void main() {
        vec2 p = abs(vPos);
        float dSide = uHw - p.x;
        float roofSlope = uTip / uHw;
        float invRoof = inversesqrt(1.0 + roofSlope * roofSlope);
        float dRoof = (uHh - p.y - roofSlope * p.x) * invRoof;
        // Signed perpendicular distance to the 6-sided lane boundary (+ inside, - outside)
        float d = min(dSide, dRoof);

        // Proximity to the 6 hexagon vertices (top/bottom peaks + 4 shoulder corners)
        float dPeak = length(vec2(vPos.x, p.y - uHh));
        float dShoulder = length(vec2(p.x - uHw, p.y - (uHh - uTip)));
        float corner = smoothstep(0.62, 0.0, min(dPeak, dShoulder));

        // 1. Crisp primary border along all 6 edges
        float rimWidth = mix(0.048, 0.072, corner);
        float outerRim = smoothstep(rimWidth, 0.008, abs(d - 0.012));

        // 2. Tactical inner double-frame hairline
        float innerLine = smoothstep(0.016, 0.0, abs(d - 0.115)) * (0.45 + 0.55 * corner);

        // 3. Soft external halo + inward edge bloom
        float outerHalo = exp(-abs(d) * 15.0) * 0.65;
        float innerBloom = exp(-max(d, 0.0) * 5.2) * smoothstep(-0.02, 0.02, d) * 0.48;
        float surfaceLift = exp(-max(d, 0.0) * 1.4) * step(0.0, d) * 0.11;

        // 4. Travelling perimeter energy pulses
        float angle = atan(vPos.y, vPos.x);
        float pulse1 = pow(0.5 + 0.5 * sin(angle * 2.0 - uTime * 3.2), 5.0);
        float pulse2 = pow(0.5 + 0.5 * sin(angle * 3.0 + uTime * 2.1 + 1.7), 6.0);
        float energy = (pulse1 * 0.85 + pulse2 * 0.5) * smoothstep(0.26, 0.0, abs(d - 0.02));

        // 5. Subtle diagonal light sheen across the winning lane
        float sweepCoord = vPos.x * 0.55 + vPos.y * 0.32;
        float sweepCenter = mod(uTime * 1.4, 5.2) - 2.6;
        float sweep = smoothstep(0.55, 0.0, abs(sweepCoord - sweepCenter)) * step(0.0, d) * 0.12;

        // 6. Victory shockwave on verdict impact
        float waveDist = (1.0 - uFlash) * 0.95;
        float flashWave = smoothstep(0.18, 0.0, abs(d - waveDist)) * uFlash * 0.95;
        float flashGlow = uFlash * step(-0.04, d) * 0.32;

        vec3 emerald = vec3(0.0, 0.92, 0.72);
        vec3 mintCore = vec3(0.82, 1.0, 0.95);
        vec3 goldTint = vec3(0.55, 1.0, 0.86);

        float coreMix = clamp(outerRim * 0.8 + energy * 0.65 + corner * 0.35 + uFlash * 0.7, 0.0, 1.0);
        vec3 col = mix(emerald, mintCore, coreMix);
        col = mix(col, goldTint, innerLine * 0.5);

        float alpha = clamp(
          outerRim * 1.25 +
          innerLine * 0.8 +
          outerHalo +
          innerBloom +
          surfaceLift +
          energy +
          sweep +
          flashWave +
          flashGlow,
          0.0,
          1.0
        );

        gl_FragColor = vec4(col * alpha, alpha);
      }
    `,
  });

  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.085;
  mesh.renderOrder = 2;
  laneMesh.add(mesh);

  let tween = null;
  if (!instant && !reducedMotion) {
    tween = gsap.to(uniforms.uFlash, {
      value: 0,
      duration: 0.62,
      ease: 'power2.out',
      onUpdate,
    });
  }

  const fx = {
    verdict: 'you',
    uniforms,
    animated: !reducedMotion,
    update(dt) {
      if (reducedMotion) return false;
      uniforms.uTime.value += dt;
      return true;
    },
    dispose() {
      tween?.kill();
      if (fade?.material) fade.material.opacity = 1;
      if (top) {
        top.emissive?.setHex(0x000000);
        top.roughness = 0.95;
      }
      laneMesh.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };

  laneMesh.userData.verdictFx = fx;
  return fx;
}

// ── LOSING LANE: 3D VORONOI SHATTER + SEAM SPLIT + RED TINT ─────────────────

function baseLanePolygon(w, h, tip) {
  const hw = w / 2;
  const hh = h / 2;
  return [
    [-hw, hh - tip],
    [0, hh],
    [hw, hh - tip],
    [hw, -hh + tip],
    [0, -hh],
    [-hw, -hh + tip],
  ];
}

// Sutherland-Hodgman half-plane clipping: keeps points where (p - m) · n >= 0
function clipPolygon(poly, mx, my, nx, ny) {
  const n = poly.length;
  if (n < 3) return [];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const da = (a[0] - mx) * nx + (a[1] - my) * ny;
    const db = (b[0] - mx) * nx + (b[1] - my) * ny;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function polygonCentroidAndArea(poly) {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area2) < 1e-5) {
    const sx = poly.reduce((s, p) => s + p[0], 0) / (n || 1);
    const sy = poly.reduce((s, p) => s + p[1], 0) / (n || 1);
    return { cx: sx, cy: sy, area: 0 };
  }
  return {
    cx: cx / (3 * area2),
    cy: cy / (3 * area2),
    area: Math.abs(area2) * 0.5,
  };
}

function buildVoronoiShards(w, len, tip, rng) {
  const hw = w / 2;
  const hh = len / 2;

  // Primary impact center (near the score bar / player side) & secondary upper impact
  const c1 = [
    (rng() - 0.5) * 0.42,
    -len * 0.08 + (rng() - 0.5) * 0.32,
  ];
  const c2 = [
    (rng() - 0.5) * 0.48,
    len * 0.22 + (rng() - 0.5) * 0.28,
  ];

  const seeds = [c1, c2];
  const tryPushSeed = (x, y) => {
    const sx = Math.max(-hw * 0.88, Math.min(hw * 0.88, x));
    const maxY = (hh - tip) * 0.92;
    const sy = Math.max(-maxY, Math.min(maxY, y));
    for (const [ex, ey] of seeds) {
      if (Math.hypot(sx - ex, sy - ey) < 0.28) return;
    }
    seeds.push([sx, sy]);
  };

  // Concentric radial rings around primary impact for authentic glass shard geometry
  const rings = [
    { r: 0.44, count: 6 },
    { r: 0.96, count: 7 },
    { r: 1.62, count: 7 },
    { r: 2.45, count: 6 },
  ];
  for (const { r, count } of rings) {
    const offsetAng = rng() * Math.PI * 2;
    for (let i = 0; i < count; i += 1) {
      const ang = offsetAng + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.25;
      const rad = r * (0.86 + rng() * 0.28);
      tryPushSeed(c1[0] + Math.cos(ang) * rad * 0.82, c1[1] + Math.sin(ang) * rad);
    }
  }

  // Ensure tips of the lane also have well-proportioned shards
  const endY = hh * 0.78;
  [-endY, endY].forEach((ey) => {
    tryPushSeed(-hw * 0.48 + (rng() - 0.5) * 0.2, ey + (rng() - 0.5) * 0.25);
    tryPushSeed(hw * 0.48 + (rng() - 0.5) * 0.2, ey + (rng() - 0.5) * 0.25);
    tryPushSeed((rng() - 0.5) * 0.25, ey * 1.08);
  });

  const basePoly = baseLanePolygon(w, len, tip);
  const shards = [];

  for (let i = 0; i < seeds.length; i += 1) {
    let poly = basePoly;
    const [sx, sy] = seeds[i];
    for (let j = 0; j < seeds.length; j += 1) {
      if (i === j) continue;
      const [ox, oy] = seeds[j];
      const dx = sx - ox;
      const dy = sy - oy;
      const d = Math.hypot(dx, dy);
      if (d < 1e-5) continue;
      // Offset the clip plane inward by 0.011 units so a crisp seam gap opens between shards
      const seamGap = 0.011;
      const mx = (sx + ox) * 0.5 + (dx / d) * seamGap;
      const my = (sy + oy) * 0.5 + (dy / d) * seamGap;
      poly = clipPolygon(poly, mx, my, dx / d, dy / d);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    const { cx, cy, area } = polygonCentroidAndArea(poly);
    if (area < 0.015) continue;
    shards.push({ poly, cx, cy, area });
  }

  return { shards, c1, c2 };
}

function buildCrackOverlayTexture(len, seed, c1, c2) {
  const W = 768;
  const H = Math.max(1024, Math.round(W * (len / LANE_W)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(seed);

  // Transparent background: no dark or tinted full-tile backdrop
  ctx.clearRect(0, 0, W, H);

  // Convert shape coords (x in [-hw, hw], y in [-hh, hh]) to canvas coords (top-down y)
  const toCanvas = ([sx, sy]) => ({
    x: (sx / LANE_W + 0.5) * W,
    y: (0.5 - sy / len) * H,
  });

  const p1 = toCanvas(c1);
  const p2 = toCanvas(c2);

  drawMicroCrackWeb(ctx, p1.x, p1.y, 14, Math.hypot(W, H) * 0.72, rng, 1.0);
  drawMicroCrackWeb(ctx, p2.x, p2.y, 11, Math.hypot(W, H) * 0.55, rng, 0.85);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.repeat.set(1 / LANE_W, 1 / len);
  texture.offset.set(0.5, 0.5);
  texture.needsUpdate = true;
  return texture;
}

function drawMicroCrackWeb(ctx, cx, cy, rayCount, maxRadius, rng, scale) {
  const rings = [0, 26 * scale, 62 * scale, 115 * scale, 190 * scale, 295 * scale, 430 * scale, maxRadius];
  const rays = [];

  for (let i = 0; i < rayCount; i += 1) {
    let angle = (i / rayCount) * Math.PI * 2 + (rng() - 0.5) * 0.22;
    const pts = [{ x: cx, y: cy }];
    for (let r = 1; r < rings.length; r += 1) {
      angle += (rng() - 0.5) * 0.18;
      const step = (rings[r] - rings[r - 1]) * (0.85 + rng() * 0.3);
      const prev = pts[r - 1];
      pts.push({
        x: prev.x + Math.cos(angle) * step,
        y: prev.y + Math.sin(angle) * step,
      });
    }
    rays.push(pts);
  }

  // Faint specular facet highlights
  for (let i = 0; i < rayCount; i += 1) {
    const next = (i + 1) % rayCount;
    for (let r = 0; r < rings.length - 1; r += 1) {
      const a = rays[i][r];
      const b = rays[i][r + 1];
      const c = rays[next][r + 1];
      const d = rays[next][r];
      const roll = rng();
      if (roll < 0.24) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 238, 242, ${(0.025 + rng() * 0.045).toFixed(3)})`;
        ctx.fill();
      }
    }
  }

  // Concentric spiderweb bridges
  for (let r = 1; r < rings.length - 1; r += 1) {
    for (let i = 0; i < rayCount; i += 1) {
      if (rng() > (r <= 3 ? 0.85 : 0.52)) continue;
      const a = rays[i][r];
      const b = rays[(i + 1) % rayCount][r];
      strokeGlassFissure(ctx, a.x, a.y, b.x, b.y, Math.max(0.9, (2.2 - r * 0.22) * scale));
    }
  }

  // Radial fissures
  for (let i = 0; i < rayCount; i += 1) {
    const pts = rays[i];
    for (let r = 0; r < pts.length - 1; r += 1) {
      strokeGlassFissure(ctx, pts[r].x, pts[r].y, pts[r + 1].x, pts[r + 1].y, Math.max(1.0, (3.0 - r * 0.28) * scale));
    }
  }
}

function strokeGlassFissure(ctx, x1, y1, x2, y2, width) {
  ctx.lineCap = 'round';
  // Subtle shadow gap
  ctx.beginPath();
  ctx.moveTo(x1 + 1.2, y1 + 1.5);
  ctx.lineTo(x2 + 1.2, y2 + 1.5);
  ctx.strokeStyle = 'rgba(8, 10, 16, 0.65)';
  ctx.lineWidth = width * 1.35;
  ctx.stroke();

  // Subtle warm-glass refraction halo
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = 'rgba(255, 115, 128, 0.18)';
  ctx.lineWidth = width * 1.8;
  ctx.stroke();

  // Bright glass specular cut
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = 'rgba(245, 248, 255, 0.88)';
  ctx.lineWidth = width * 0.85;
  ctx.stroke();
}

function attachLossShatterFx(laneMesh, { len, tip, laneIndex, reducedMotion, instant, onUpdate }) {
  const { top, fade } = laneMesh.userData;
  const origMaterials = laneMesh.material;
  const seed = (laneIndex + 1) * 5381 + Math.round(len * 100);
  const rng = mulberry32(seed);

  // Hide the unbroken lane slab while keeping its children visible
  laneMesh.material = HIDDEN_MAT;
  if (fade) fade.visible = false;

  const { shards, c1, c2 } = buildVoronoiShards(LANE_W, len, tip, rng);
  const crackTexture = buildCrackOverlayTexture(len, seed + 19, c1, c2);

  const root = new Group();
  laneMesh.add(root);

  // Shared materials for the shard sides, crack overlay, and glass rim
  const shardSideMat = new MeshStandardMaterial({
    color: 0x1a1c22,
    roughness: 0.82,
  });
  const animate = !instant && !reducedMotion;
  // Animated, the cracks and broken edges start unseen: they flash in first.
  const crackOverlayMat = new MeshBasicMaterial({
    map: crackTexture,
    transparent: true,
    opacity: animate ? 0 : 0.85,
    depthWrite: false,
  });
  const rimMat = new LineBasicMaterial({
    color: 0xf2d6dc,
    transparent: true,
    opacity: animate ? 0 : 0.36,
  });

  const disposables = [shardSideMat, crackOverlayMat, crackTexture, rimMat];
  const shardTargets = [];

  for (const shard of shards) {
    const { poly, cx, cy } = shard;

    // Build local centered 2D shape around (cx, cy) so rotations pivot around the shard's own center
    const shape = new Shape();
    poly.forEach(([px, py], idx) => {
      const lx = px - cx;
      const ly = py - cy;
      if (idx === 0) shape.moveTo(lx, ly);
      else shape.lineTo(lx, ly);
    });
    shape.closePath();

    // Extruded 3D slab for this shard
    const slabGeo = slab(shape, 0.08);
    // Shift UVs back by (+cx, +cy) so the map texture and crack overlay align seamlessly across shards
    const uv = slabGeo.attributes.uv;
    if (uv) {
      for (let k = 0; k < uv.count; k += 1) {
        uv.setXY(k, uv.getX(k) + cx, uv.getY(k) + cy);
      }
    }

    // Tasteful, subtle red tint on the shard map: slightly cooled/dimmed with a soft rose-red cast
    const topFadeFactor = cy > len * 0.22 ? Math.max(0.65, 1 - ((cy - len * 0.22) / (len * 0.28)) * 0.35) : 1;
    const rLuma = (0.64 + (rng() - 0.5) * 0.08) * topFadeFactor;
    const gbLuma = (0.50 + (rng() - 0.5) * 0.06) * topFadeFactor;
    const shardTopMat = new MeshStandardMaterial({
      map: top?.map ?? null,
      color: new Color(rLuma, gbLuma, gbLuma),
      roughness: 0.88,
    });

    const slabMesh = new Mesh(slabGeo, [shardTopMat, shardSideMat]);
    slabMesh.receiveShadow = true;
    slabMesh.castShadow = true;

    // Top surface micro-crack overlay on this shard
    const topFaceGeo = new ShapeGeometry(shape);
    const faceUv = topFaceGeo.attributes.uv;
    if (faceUv) {
      for (let k = 0; k < faceUv.count; k += 1) {
        faceUv.setXY(k, faceUv.getX(k) + cx, faceUv.getY(k) + cy);
      }
    }
    const crackMesh = new Mesh(topFaceGeo, crackOverlayMat);
    crackMesh.rotation.x = -Math.PI / 2;
    crackMesh.position.y = 0.0815;
    crackMesh.renderOrder = 2;

    // Subtle crystalline highlight tracing the broken perimeter of the shard
    const rimVerts = [];
    for (const [px, py] of poly) {
      rimVerts.push(px - cx, 0.082, -(py - cy));
    }
    const rimGeo = new BufferGeometry();
    rimGeo.setAttribute('position', new Float32BufferAttribute(rimVerts, 3));
    const rimLoop = new LineLoop(rimGeo, rimMat);
    rimLoop.renderOrder = 3;

    const shardGroup = new Group();
    // Shape +y runs toward 3D -z
    const baseX = cx;
    const baseZ = -cy;
    shardGroup.position.set(baseX, 0, baseZ);
    shardGroup.add(slabMesh, crackMesh, rimLoop);
    root.add(shardGroup);

    disposables.push(slabGeo, shardTopMat, topFaceGeo, rimGeo);

    // Compute outward split vector from nearest impact center
    const d1 = Math.hypot(cx - c1[0], cy - c1[1]);
    const d2 = Math.hypot(cx - c2[0], cy - c2[1]);
    const origin = d1 <= d2 ? c1 : c2;
    const dist = Math.min(d1, d2);
    const vx = cx - origin[0];
    const vy = cy - origin[1];
    const vLen = Math.hypot(vx, vy) || 1;
    const ux = vx / vLen;
    const uy = vy / vLen;

    // Split outward along the seams + 3D tilt and step sink (never rising into the cards above)
    const splitMag = (0.044 + 0.038 * Math.exp(-dist * 0.5) + rng() * 0.020) * 1.6;
    const targetX = baseX + ux * splitMag + (rng() - 0.5) * 0.018;
    const targetZ = baseZ - uy * splitMag + (rng() - 0.5) * 0.018;
    const targetY = -0.012 - rng() * 0.02;
    const targetRx = (rng() - 0.5) * 0.064;
    const targetRz = (rng() - 0.5) * 0.064;
    const targetRy = (rng() - 0.5) * 0.04;
    const targetScale = 0.965 - rng() * 0.015;

    let area = 0;
    for (let k = 0; k < poly.length; k += 1) {
      const [ax, ay] = poly[k];
      const [bx, by] = poly[(k + 1) % poly.length];
      area += ax * by - bx * ay;
    }
    area = Math.abs(area) / 2;
    if (!animate) {
      shardGroup.position.set(targetX, targetY, targetZ);
      shardGroup.rotation.set(targetRx, targetRy, targetRz);
      shardGroup.scale.set(targetScale, 1, targetScale);
      shardTargets.push({ shardGroup, dist, area, ux, uy });
    } else {
      shardTargets.push({
        shardGroup,
        dist,
        area,
        ux,
        uy,
        targetX,
        targetY,
        targetZ,
        targetRx,
        targetRy,
        targetRz,
        targetScale,
      });
    }
  }

  // Debris: the three smallest pieces near the impact chip off and fall away
  // through the gaps. Restored or reduced-motion boards simply don't have them.
  const debris = new Set(
    [...shardTargets]
      .filter(item => item.dist < len * 0.45)
      .sort((a, b) => a.area - b.area)
      .slice(0, 3),
  );
  if (!animate) for (const item of debris) item.shardGroup.visible = false;

  const tl = animate ? gsap.timeline({ onUpdate }) : null;
  if (tl) {
    // Crack: the fracture lines flash across the whole lane before it gives.
    tl.to(crackOverlayMat, { opacity: 1, duration: 0.06, ease: 'power2.out' }, 0)
      .to(crackOverlayMat, { opacity: 0.85, duration: 0.2, ease: 'power2.out' }, 0.06)
      .to(rimMat, { opacity: 0.7, duration: 0.06, ease: 'power2.out' }, 0.03)
      .to(rimMat, { opacity: 0.36, duration: 0.3, ease: 'power2.out' }, 0.09);

    // One heavy sink as it breaks, then back: a single impulse, no stepped shake.
    const laneBaseY = laneMesh.position.y;
    tl.to(laneMesh.position, { y: laneBaseY - 0.035, duration: 0.07, ease: 'power2.out' }, CRACK)
      .to(laneMesh.position, { y: laneBaseY, duration: 0.26, ease: 'power2.inOut' }, CRACK + 0.07);

    for (const item of debris) {
      const group = item.shardGroup;
      const spin = (item.area * 1000) % 1 > 0.5 ? 1 : -1;
      tl.to(group.position, {
        x: group.position.x + item.ux * 0.42,
        z: group.position.z - item.uy * 0.42,
        duration: 0.62,
        ease: 'power1.out',
      }, CRACK)
        .to(group.position, {
          keyframes: [
            { y: 0.05, duration: 0.14, ease: 'power2.out' },
            { y: -1.1, duration: 0.48, ease: 'power2.in' },
          ],
        }, CRACK)
        .to(group.rotation, { x: spin * 1.9, z: spin * -1.3, duration: 0.62, ease: 'power1.in' }, CRACK)
        .to(group.scale, { x: 0.55, y: 0.55, z: 0.55, duration: 0.62, ease: 'power1.in' }, CRACK)
        .set(group, { visible: false }, CRACK + 0.62);
    }

    // Propagate the shatter split outward from the impact centers
    for (const item of shardTargets) {
      if (debris.has(item)) continue;
      const delay = CRACK + Math.min(0.11, item.dist * 0.028);
      tl.to(item.shardGroup.position, {
        x: item.targetX,
        y: item.targetY,
        z: item.targetZ,
        duration: 0.28,
        ease: 'power3.out',
      }, delay)
        .to(item.shardGroup.rotation, {
          x: item.targetRx,
          y: item.targetRy,
          z: item.targetRz,
          duration: 0.30,
          ease: 'power3.out',
        }, delay)
        .to(item.shardGroup.scale, {
          x: item.targetScale,
          z: item.targetScale,
          duration: 0.26,
          ease: 'power3.out',
        }, delay);
    }
  }

  const fx = {
    verdict: 'them',
    animated: false,
    update() {
      return false;
    },
    dispose() {
      tl?.kill();
      laneMesh.material = origMaterials;
      if (fade) fade.visible = true;
      laneMesh.remove(root);
      for (const item of disposables) {
        item?.dispose?.();
      }
    },
  };

  laneMesh.userData.verdictFx = fx;
  return fx;
}
