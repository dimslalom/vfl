// The Apex evo card in 3D. Metal comes from the Blender model
// (tools/evo3d/build_apex.py -> public/assets/evo3d/apex.glb); the face art,
// portrait and type change per card, so they are drawn here onto planes that
// sit between the model's parts. One unit is 100 card pixels.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetPath, roleAbbr } from '../../shared/src/lib/utils';
import { evoFace, outlinePts, floorPts, insetPts } from '../../shared/src/components/evoArt';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SpecialtyIcon from '../../shared/src/components/SpecialtyIcon';
import { EVO_SKILLS, getCardSpecialties } from '../../shared/src/data/specialties';
import { STAT_KEYS, STAT_LABELS } from '../../shared/src/data/statFields';

const MODELS = {
  apex: '/assets/evo3d/apex.glb',
  valkyrie: '/assets/evo3d/valkyrie.glb',
  sovereign: '/assets/evo3d/sovereign.glb',
  singularity: '/assets/evo3d/singularity.glb',
};
const U = 100;
const BASE = 0.16;
const X = px => (px - 200) / U;
const Y = py => (290 - py) / U;
// The canvas reaches past the card like EvoFx does: 22% each side, 18% each end.
export const SPILL = { x: 0.22, y: 0.18 };
const VIEW_H = 5.8 * (1 + SPILL.y * 2);

const modelPromises = new Map();
const loadModel = (theme = 'apex') => {
  const modelUrl = MODELS[theme] ?? MODELS.apex;
  if (!modelPromises.has(modelUrl)) {
    modelPromises.set(modelUrl, new GLTFLoader().loadAsync(assetPath(modelUrl)));
  }
  return modelPromises.get(modelUrl);
};

const loadImg = src => new Promise(resolve => {
  if (!src) return resolve(null);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

// flag-icons is a stylesheet sprite, so ask the browser which file a code uses.
function flagSrc(code) {
  const span = document.createElement('span');
  span.className = `fi fi-${String(code ?? '').toLowerCase()}`;
  span.style.cssText = 'position:absolute;visibility:hidden';
  document.body.appendChild(span);
  const bg = getComputedStyle(span).backgroundImage;
  span.remove();
  return bg.match(/url\("?(.*?)"?\)/)?.[1] ?? null;
}

function shapeOf(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(X(x), Y(y)) : s.moveTo(X(x), Y(y))));
  s.closePath();
  return s;
}

function faceCanvas(pad = 0) {
  const c = document.createElement('canvas');
  c.width = (400 + pad * 2) * 2;
  c.height = (580 + pad * 2) * 2;
  const x = c.getContext('2d');
  x.scale(2, 2);
  x.translate(pad, pad);
  return [c, x];
}

function texture(canvas, onCard) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // Extruded caps take UVs from their x,y in units; map those onto the card.
  if (onCard) { t.repeat.set(1 / 4, 1 / 5.8); t.offset.set(0.5, 0.5); }
  return t;
}

function polyPath(ctx, points) {
  ctx.beginPath();
  points.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
  ctx.closePath();
}

const FONT = '"Familjen Grotesk", sans-serif';

async function drawFace(card, level, theme = 'apex') {
  const face = evoFace(theme, level);
  // The specialty rail, drawn the way PlayerCard prints it: a bare crest of
  // icon over code in card ink, evo-earned skills in their evo's brightest metal.
  const specs = getCardSpecialties(card).map(spec => {
    const color = EVO_SKILLS.has(spec.key) ? face.metal[1] : face.ink;
    const svg = renderToStaticMarkup(createElement(SpecialtyIcon, { spec: spec.key, size: 34 })).replaceAll('currentColor', color).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return { spec, color, icon: loadImg(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))) };
  });
  const icons = await Promise.all(specs.map(s => s.icon));
  const [bgImg, portrait, org, region, flag] = await Promise.all([
    loadImg(URL.createObjectURL(new Blob([face.back], { type: 'image/svg+xml' }))),
    loadImg(card.photo ? assetPath(card.photo) : null),
    loadImg(card.org_logo ? assetPath(card.org_logo) : null),
    loadImg(card.region ? assetPath(`/assets/regions/${card.region.toLowerCase()}.png`) : null),
    loadImg(flagSrc(card.nationality)),
    document.fonts?.load(`700 40px ${FONT}`).catch(() => {}),
  ]);
  const ink = face.ink;

  const [plate, px] = faceCanvas();
  if (bgImg) px.drawImage(bgImg, 0, 0, 400, 580);

  const [floor, fx] = faceCanvas();
  polyPath(fx, floorPts(theme, level));
  fx.fillStyle = face.floor;
  fx.fill();
  fx.strokeStyle = face.line;
  fx.lineWidth = 1.2;
  fx.beginPath(); fx.moveTo(0, 411); fx.lineTo(400, 411); fx.stroke();
  if (level === 2) { fx.strokeStyle = `${face.line}55`; fx.beginPath(); fx.moveTo(0, 417); fx.lineTo(400, 417); fx.stroke(); }
  fx.textAlign = 'center';
  fx.fillStyle = ink;
  fx.font = `700 44px ${FONT}`;
  fx.fillText(card.player, 200, 456, 340);
  [59.2, 129.6, 200, 270.4, 340.8].forEach((x, i) => {
    const key = STAT_KEYS[i];
    fx.fillStyle = `${ink}aa`; fx.font = `600 18px ${FONT}`; fx.fillText(STAT_LABELS[key], x, 486);
    fx.fillStyle = ink; fx.font = `700 36px ${FONT}`; fx.fillText(card.stats[key], x, 522);
  });
  if (org) fx.drawImage(org, 164, 530, 30, 30);
  if (region) fx.drawImage(region, 206, 530, 30, 30);

  const [top, tx] = faceCanvas();
  tx.textAlign = 'center';
  tx.fillStyle = ink;
  tx.font = `700 68px ${FONT}`; tx.fillText(card.rating, 62, 112);
  tx.font = `600 28px ${FONT}`; tx.fillText(roleAbbr(card.role), 62, 152);
  if (flag) tx.drawImage(flag, 39, 166, 46, 34);
  specs.forEach(({ spec, color }, i) => {
    const y = 58 + i * 66;
    // Same outline as the flat card's rail: a tight halo in the floor tone.
    tx.font = `700 22px ${FONT}`;
    tx.shadowColor = face.floor;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      tx.shadowOffsetX = dx * 2; tx.shadowOffsetY = dy * 2;
      if (icons[i]) tx.drawImage(icons[i], 327, y, 34, 34);
      tx.fillStyle = color; tx.fillText(spec.code, 344, y + 54);
    }
    tx.shadowColor = 'transparent';
    if (icons[i]) tx.drawImage(icons[i], 327, y, 34, 34);
    tx.fillText(spec.code, 344, y + 54);
  });

  return { plate, floor, top, portrait };
}

function environment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0a0604);
  [[0xffffff, [-6, 6, 4], 8], [0xffc870, [7, 2, 3], 7], [0xffe6b0, [-5, -4, 5], 4], [0x7a0a1c, [0, -7, 3], 4], [0xd8a860, [0, 1.5, 10], 5], [0x1a0e06, [0, -2.5, 10], 4]].forEach(([color, pos, size]) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    panel.position.set(...pos);
    panel.lookAt(0, 0, 0);
    env.add(panel);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const map = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return map;
}

/**
 * Mounts the card on a canvas. Returns null when WebGL is not available, so
 * the caller keeps the flat card; otherwise a function that tears it down.
 */
export async function mountApex(canvas, card, { level = 2, theme, still = false, onLost } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  // If the browser takes the context back, hand the card back to the flat version.
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onLost?.(); });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const evoTheme = theme || card.evoTheme || 'apex';
  const [gltf, art] = await Promise.all([loadModel(evoTheme), drawFace(card, level, evoTheme)]);
  const disposables = [];
  const keep = thing => { disposables.push(thing); return thing; };

  const group = new THREE.Group();
  const prefix = level === 2 ? 'L2_' : 'L1_';
  gltf.scene.children.filter(node => node.name.startsWith(prefix)).forEach(node => group.add(node.clone()));

  const goldSide = keep(new THREE.MeshStandardMaterial({ color: 0x8a5a1c, metalness: 1, roughness: 0.42 }));
  const ext = (points, depth) => keep(new THREE.ExtrudeGeometry(shapeOf(points), { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 4 }));
  const add = (geometry, material, z) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.z = z; group.add(mesh); return mesh; };
  const depth = level === 2 ? 1 : 0.6;

  // Card plate carrying the face art, then the portrait floating above the
  // rakes, then a raised stat plinth that hides the portrait's cut line.
  add(ext(outlinePts(evoTheme, level), 0.14), [keep(new THREE.MeshBasicMaterial({ map: keep(texture(art.plate, true)) })), goldSide], 0);
  if (art.portrait) {
    const map = keep(new THREE.Texture(art.portrait));
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    const portrait = add(keep(new THREE.PlaneGeometry(4, 4.12)), keep(new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.04 })), BASE + 0.2 * depth);
    portrait.position.y = Y(206);
  }
  add(ext(floorPts(evoTheme, level), 0.26 * depth), [keep(new THREE.MeshBasicMaterial({ map: keep(texture(art.floor, true)) })), goldSide], BASE);
  add(keep(new THREE.PlaneGeometry(4, 5.8)), keep(new THREE.MeshBasicMaterial({ map: keep(texture(art.top)), transparent: true })), BASE + 0.3 * depth);

  // Light running round the border, drawn per frame onto a plane on the bezel.
  const PAD = 24;
  const [borderCanvas, bx] = faceCanvas(PAD);
  const track = level === 2 ? outlinePts(evoTheme, 2) : insetPts(8.5);
  const trackPath = new Path2D(`M${track.map(p => p.join(',')).join(' L')} Z`);
  const perimeter = track.reduce((sum, p, i) => { const q = track[(i + 1) % track.length]; return sum + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  const borderMap = keep(texture(borderCanvas));
  add(keep(new THREE.PlaneGeometry((400 + PAD * 2) / U, (580 + PAD * 2) / U)), keep(new THREE.MeshBasicMaterial({ map: borderMap, transparent: true, depthWrite: false })), level === 2 ? BASE + 0.38 + 0.03 : BASE + 0.24);
  const drawBorder = seconds => {
    bx.clearRect(-PAD, -PAD, 400 + PAD * 2, 580 + PAD * 2);
    bx.lineJoin = 'round';
    bx.lineCap = 'round';
    const speed = level === 2 ? 260 : 120, seg = 9, n = level === 2 ? 14 : 9;
    for (const phase of level === 2 ? [0, 0.5] : [0]) {
      const head = (seconds * speed + phase * perimeter) % perimeter;
      for (let k = n - 1; k >= 0; k--) {
        const a = 1 - k / n;
        bx.setLineDash([seg + 1, perimeter - seg - 1]);
        bx.lineDashOffset = -(head - k * seg);
        bx.strokeStyle = k < 2 ? `rgba(255,246,220,${a})` : `rgba(255,${Math.round(40 + 60 * a)},${Math.round(70 * a)},${a * 0.9})`;
        bx.lineWidth = (level === 2 ? 5 : 3) * (0.4 + 0.6 * a);
        bx.stroke(trackPath);
      }
    }
    // The whole border flares on the swipe's beat (EvoFx runs it every 3.2s).
    const beat = seconds % 3.2;
    if (level === 2 && beat < 0.5) {
      const a = 1 - beat / 0.5;
      bx.setLineDash([]);
      const strokeColor = evoTheme === 'singularity' ? `rgba(34,184,207,${a * 0.85})` : (evoTheme === 'valkyrie' || evoTheme === 'sovereign') ? `rgba(255,212,59,${a * 0.85})` : `rgba(255,40,80,${a * 0.85})`;
      const innerColor = evoTheme === 'singularity' ? `rgba(177,151,252,${a * 0.6})` : (evoTheme === 'valkyrie' || evoTheme === 'sovereign') ? `rgba(255,250,210,${a * 0.6})` : `rgba(255,240,210,${a * 0.6})`;
      bx.strokeStyle = strokeColor; bx.lineWidth = 6; bx.stroke(trackPath);
      bx.strokeStyle = innerColor; bx.lineWidth = 1.5; bx.stroke(trackPath);
    }
    borderMap.needsUpdate = true;
  };

  // Card art is already in display colour, so keep tone mapping off it.
  group.traverse(node => { [].concat(node.material ?? []).forEach(mat => { if (mat.isMeshBasicMaterial) mat.toneMapped = false; }); });
  const scene = new THREE.Scene();
  scene.add(group);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.8); key.position.set(-3, 4, 6); scene.add(key);
  const rimColor = evoTheme === 'singularity' ? 0x22b8cf : (evoTheme === 'valkyrie' || evoTheme === 'sovereign') ? 0xffd43b : 0xff2a4a;
  const rim = new THREE.DirectionalLight(rimColor, 1.2); rim.position.set(4, -2, 3); scene.add(rim);
  scene.environment = keep(environment(renderer));
  scene.environmentIntensity = 1.6;

  const aspect = (1 + SPILL.x * 2) * 4 / VIEW_H;
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 100);
  camera.position.z = VIEW_H / 2 / Math.tan(THREE.MathUtils.degToRad(15));

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
  };
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);
  resize();

  let target = null, rx = 0, ry = 0, visible = true, frame = 0;
  const point = event => {
    const box = canvas.getBoundingClientRect();
    target = [((event.clientY - box.top) / box.height - 0.5) * -0.5, ((event.clientX - box.left) / box.width - 0.5) * 0.7];
  };
  const leave = () => { target = null; };
  canvas.addEventListener('pointermove', point);
  canvas.addEventListener('pointerdown', point);
  canvas.addEventListener('pointerleave', leave);
  const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  seen.observe(canvas);

  const loop = time => {
    frame = requestAnimationFrame(loop);
    if (!visible) return;
    const s = time / 1000;
    const [tx, ty] = target ?? (still ? [0, 0] : [Math.sin(s * 0.7) * 0.05, Math.sin(s * 0.5) * 0.22]);
    rx += (tx - rx) * 0.08;
    ry += (ty - ry) * 0.08;
    group.rotation.set(rx, ry, 0);
    drawBorder(still ? 0 : s);
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    sizer.disconnect();
    seen.disconnect();
    canvas.removeEventListener('pointermove', point);
    canvas.removeEventListener('pointerdown', point);
    canvas.removeEventListener('pointerleave', leave);
    disposables.forEach(thing => thing.dispose?.());
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
