// A map's arena: the 3D set the board's lanes float over, built in Blender by
// tools/arena3d/build_arena.py (one GLB per map, flat colours, no textures).
//
// The model's materials are named by role (Stone, Plaster, Roof, Water, Glow…)
// and recoloured here, so palettes are tuned in code: 'grey' is the mid-fi
// blockout, 'tint' each map's own colours. Effects come from names too:
//   Water      lifted into slow waves
//   Glow       lit from within, pulsing
//   Cloud_*    drift toward the player and wrap round; Mist_* the same
//   Float_*    bob and turn in place
// plus each map's own particles (snow, dust, petals, bubbles, embers).
// Under reduced motion all of it holds still.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, HalfFloatType, Mesh, MeshBasicMaterial, NoBlending,
  NormalBlending, OrthographicCamera, PlaneGeometry, Points, PointsMaterial, Scene, ShaderMaterial, UniformsUtils, Vector2,
  WebGLRenderTarget,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetPath } from '../../shared/src/lib/utils.js';

// Kept darker than the lanes, which show the map art dimmed to about 55%: the
// set frames the board and must never outshine the cards.
const GREY = {
  Stone: 0x2c2e33, Paving: 0x24262a, Plaster: 0x45474d, Roof: 0x37393e, Wood: 0x222327, Metal: 0x3a3c42,
  Foliage: 0x303236, Rock: 0x1b1c20, Cloud: 0x5a5c62, Sand: 0x34363b, Grass: 0x2a2c30, Snow: 0x55575d,
  Water: 0x26282d, Glow: 0x8a8c92, Marking: 0x404247, Accent: 0x3f4147, Accent2: 0x36383d, Concrete: 0x3a3c41,
};

const file = name => `/assets/arena3d/${name}.glb`;

// particles: count, colour, size (board units), velocity, sway (side-to-side drift).
// glow: how strongly Glow parts light up (default 0.9).
export const ARENAS = {
  Ascent: {
    file: file('ascent'),
    tint: {
      Stone: 0x3a342e, Paving: 0x2c2723, Plaster: 0x5e5246, Roof: 0x5a2c20, Wood: 0x2a1d16,
      Metal: 0x2d3f52, Foliage: 0x22301f, Rock: 0x221d1b, Cloud: 0x6f7787,
    },
  },
  Bind: {
    file: file('bind'),
    tint: {
      Sand: 0x58442e, Stone: 0x4a3c2c, Paving: 0x3a2f23, Plaster: 0x66533e, Wood: 0x2c1f16, Metal: 0x34363c,
      Foliage: 0x26361f, Accent: 0x6e3424, Glow: 0xff8a3a, Rock: 0x3c2e22,
    },
    particles: { count: 160, color: 0xd8b07a, size: 0.06, velocity: [0.9, -0.04, 0.15], sway: 0.15 },
  },
  Breeze: {
    file: file('breeze'),
    tint: {
      Stone: 0x6a6458, Paving: 0x57524a, Sand: 0x5a4e38, Water: 0x0f5b66, Foliage: 0x2a4a24, Wood: 0x3a2a1c,
      Rock: 0x4a4540, Accent: 0xa8402c, Metal: 0x3a3a3a,
    },
  },
  Haven: {
    file: file('haven'),
    tint: {
      Grass: 0x23301c, Stone: 0x3d3832, Paving: 0x302c26, Plaster: 0x6a6458, Roof: 0x5a2a1e, Wood: 0x3a2416,
      Foliage: 0x2a3f22, Accent: 0x8a3a2a, Accent2: 0x2e5a6a, Cloud: 0x5a6470,
    },
    particles: { count: 90, color: 0xd0703a, size: 0.1, velocity: [0.2, -0.35, 0.25], sway: 0.5 },
  },
  Icebox: {
    file: file('icebox'),
    tint: {
      Snow: 0x5e6878, Water: 0x0e2c3c, Paving: 0x4c5462, Marking: 0x6e6430, Accent: 0x7a2a26, Accent2: 0x1f5a66, Metal: 0x3a4250,
      Wood: 0x3a2c22, Plaster: 0x6a6e76,
    },
    particles: { count: 420, color: 0xeef4ff, size: 0.07, velocity: [0.15, -0.7, 0.1], sway: 0.25 },
  },
  Split: {
    file: file('split'),
    tint: {
      Concrete: 0x404044, Paving: 0x343438, Marking: 0x5e5a34, Plaster: 0x6e5458, Accent: 0x5c4048, Accent2: 0x2a5a3a,
      Glow: 0xff4fa0, Metal: 0x3a3a40, Stone: 0x55555a, Wood: 0x3a2c22,
    },
    particles: { count: 50, color: 0xffc4dc, size: 0.08, velocity: [0.25, -0.3, 0.2], sway: 0.5 },
  },
  Fracture: {
    file: file('fracture'),
    tint: {
      Concrete: 0x464644, Paving: 0x383836, Grass: 0x24321e, Accent: 0x5e3618, Glow: 0x38e0d0, Rock: 0x3a3632,
      Foliage: 0x2a4022, Plaster: 0x6a6a68, Metal: 0x3a3c40, Wood: 0x34261c,
    },
  },
  Pearl: {
    file: file('pearl'),
    tint: {
      Sand: 0x2a3a40, Stone: 0x3c4a52, Paving: 0x324048, Plaster: 0x5a6268, Accent: 0x6a5440, Accent2: 0x3a5a5e,
      Roof: 0x2a4a62, Water: 0x1a6a7a, Metal: 0x3f7f8f, Foliage: 0x1e3a2e, Glow: 0x7fe8ff, Rock: 0x2a3236, Wood: 0x2a2a2a,
    },
    particles: { count: 170, color: 0xb8f4ff, size: 0.07, velocity: [0, 0.6, 0], sway: 0.3 },
  },
  Lotus: {
    file: file('lotus'),
    tint: {
      Grass: 0x223420, Stone: 0x4a463e, Paving: 0x3a3630, Foliage: 0x264222, Accent: 0xc0608e, Accent2: 0x8a2a24,
      Water: 0x1a5a5a, Plaster: 0x5e5a50, Wood: 0x3a2a1e,
    },
    particles: { count: 80, color: 0xf08ac0, size: 0.09, velocity: [0.15, -0.28, 0.2], sway: 0.5 },
  },
  Sunset: {
    file: file('sunset'),
    tint: {
      Concrete: 0x2e2c30, Stone: 0x34302e, Paving: 0x2a2624, Marking: 0x5a5852, Plaster: 0x6e5a4a, Accent: 0x8a3a2a, Accent2: 0x4a6a6a,
      Roof: 0x6a3a28, Glow: 0x4ad6ff, Foliage: 0x2e3e22, Wood: 0x3a2a1e, Metal: 0x3a3a3e,
    },
    glow: 0.32,
  },
  Abyss: {
    file: file('abyss'),
    tint: {
      Stone: 0x3a3e46, Paving: 0x30343a, Roof: 0x2a2e36, Wood: 0x3a2c22, Rock: 0x26282e, Glow: 0x4ab8ff,
      Cloud: 0x2c3644, Metal: 0x3a3c42,
    },
  },
  Corrode: {
    file: file('corrode'),
    tint: {
      Plaster: 0x5a3628, Roof: 0x362c44, Stone: 0x4e4440, Paving: 0x3e3632, Concrete: 0x77716d, Glow: 0xb070ff,
      Wood: 0x3a2a20, Rock: 0x2e2626, Metal: 0x3a3a40, Cloud: 0x5a5468,
    },
    particles: { count: 120, color: 0xc890ff, size: 0.06, velocity: [0.05, 0.4, 0], sway: 0.3 },
  },
};

const cache = new Map();

function loadModel(path) {
  if (!cache.has(path)) {
    const loading = new GLTFLoader().loadAsync(assetPath(path));
    loading.catch(() => cache.delete(path));
    cache.set(path, loading);
  }
  return cache.get(path);
}

/** Start loading a map's arena; resolves once it is in, or after `wait` ms so a slow line never holds up the deal. */
export function preloadArena(mapName, wait = 0) {
  const spec = ARENAS[mapName];
  if (!spec) return Promise.resolve();
  const loading = loadModel(spec.file).catch(() => null);
  return wait ? Promise.race([loading, new Promise(resolve => setTimeout(resolve, wait))]) : loading;
}

const DRIFT = 0.35;       // board units a second, toward the player
const WRAP = 20;          // drifters leave past |z| = WRAP and come back at the far end
const BOX = { x: 16, y: [-2.4, 5], z: 18 };   // where particles live

// Water rises and falls in two crossing swells; flat shading picks up each facet.
function makeWater(material, clock) {
  material.flatShading = true;
  material.roughness = 0.35;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        transformed.y += sin(worldPos.x * 0.9 + uTime * 0.9) * 0.07 + cos(worldPos.z * 0.7 - uTime * 1.2) * 0.07;`);
  };
  material.customProgramCacheKey = () => 'arena-water';
}

function makeParticles({ count, color, size, velocity, sway }) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() * 2 - 1) * BOX.x;
    positions[i * 3 + 1] = BOX.y[0] + Math.random() * (BOX.y[1] - BOX.y[0]);
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * BOX.z;
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color, size, transparent: true, opacity: 0.85, depthWrite: false,
    blending: velocity[1] > 0 ? AdditiveBlending : NormalBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.layers.set(ARENA_LAYER);
  const [vx, vy, vz] = velocity;
  const height = BOX.y[1] - BOX.y[0];
  return {
    points,
    update(dt, time) {
      for (let i = 0; i < count; i += 1) {
        const k = i * 3;
        const wobble = Math.sin(time * 1.3 + seeds[i]) * sway;
        positions[k] += (vx + wobble) * dt;
        positions[k + 1] += vy * dt * (0.7 + 0.3 * Math.sin(seeds[i]));
        positions[k + 2] += (vz + Math.cos(time + seeds[i]) * sway * 0.5) * dt;
        if (positions[k] > BOX.x) positions[k] -= BOX.x * 2;
        if (positions[k] < -BOX.x) positions[k] += BOX.x * 2;
        if (positions[k + 1] < BOX.y[0]) positions[k + 1] += height;
        if (positions[k + 1] > BOX.y[1]) positions[k + 1] -= height;
        if (positions[k + 2] > BOX.z) positions[k + 2] -= BOX.z * 2;
        if (positions[k + 2] < -BOX.z) positions[k + 2] += BOX.z * 2;
      }
      geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export async function loadArena(mapName, palette = 'tint') {
  const spec = ARENAS[mapName];
  if (!spec) return null;
  const gltf = await loadModel(spec.file);
  const root = gltf.scene.clone(true);
  const materials = new Map();
  const drifters = [];
  const floaters = [];
  const clock = { value: 0 };
  root.traverse((node) => {
    if (!node.isMesh) return;
    // Each arena gets its own materials, so recolouring one never touches the cached model.
    node.material = [].concat(node.material).map((material) => {
      if (!materials.has(material.name)) {
        const copy = material.clone();
        copy.roughness = 1;
        copy.metalness = 0;
        copy.flatShading = true;   // the models carry no normals; every face is flat
        if (material.name === 'Water') makeWater(copy, clock);
        materials.set(material.name, copy);
      }
      return materials.get(material.name);
    });
    if (node.material.length === 1) [node.material] = node.material;
    node.layers.set(ARENA_LAYER);
    const entry = { node, bob: Math.random() * Math.PI * 2, y: node.position.y };
    if (node.name.startsWith('Cloud') || node.name.startsWith('Mist')) drifters.push(entry);
    else if (node.name.startsWith('Float')) floaters.push(entry);
    else node.receiveShadow = true;
  });
  const particles = spec.particles ? makeParticles(spec.particles) : null;
  if (particles) root.add(particles.points);
  const glow = materials.get('Glow');
  const glowBase = spec.glow ?? 0.9;
  let glowScale = 1;
  const hasWater = materials.has('Water');

  const arena = {
    name: mapName,
    root,
    animated: Boolean(drifters.length || floaters.length || particles || glow || hasWater),
    setPalette(name) {
      const colours = name === 'grey' ? GREY : { ...GREY, ...spec.tint };
      glowScale = name === 'grey' ? 0.22 : 1;
      for (const [key, material] of materials) {
        if (colours[key] != null) material.color = new Color(colours[key]);
        if (key === 'Cloud') {
          material.transparent = true;
          material.opacity = 0.85;
        }
        if (key === 'Glow') {
          material.emissive = new Color(colours.Glow);
          material.emissiveIntensity = name === 'grey' ? 0.2 : glowBase;
        }
      }
      if (particles) particles.points.material.color = new Color(name === 'grey' ? 0x9a9ca2 : spec.particles.color);
    },
    update(dt) {
      clock.value += dt;
      const time = clock.value;
      for (const cloud of drifters) {
        cloud.node.position.z += DRIFT * dt;
        if (cloud.node.position.z > WRAP) cloud.node.position.z -= WRAP * 2;
        cloud.bob += dt * 0.4;
        cloud.node.position.y = cloud.y + Math.sin(cloud.bob) * 0.15;
      }
      for (const rock of floaters) {
        rock.bob += dt * 0.6;
        rock.node.position.y = rock.y + Math.sin(rock.bob) * 0.25;
        rock.node.rotation.y += dt * 0.15;
      }
      if (glow) glow.emissiveIntensity = glowBase * glowScale * (0.83 + Math.sin(time * 1.7) * 0.33);
      particles?.update(dt, time);
    },
    dispose() {
      root.removeFromParent();
      particles?.dispose();
      for (const material of materials.values()) material.dispose();
      // Geometry is shared with the cached model, so it stays.
    },
  };
  arena.setPalette(palette);
  return arena;
}

// ── soft focus ───────────────────────────────────────────────────────────────
// The arena is drawn on its own layer into a half-size target, blurred, and laid
// down first; the board then draws sharp on top. The shadow map is built once a
// frame with the board included, so lanes and cards still shade the blurred floor.

export const ARENA_LAYER = 1;
const BLUR = 1.1;   // blur radius in half-size pixels: "a bit out of focus"

const blurShader = {
  uniforms: { map: { value: null }, step: { value: new Vector2() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D map; uniform vec2 step; varying vec2 vUv;
    void main() {
      vec4 sum = texture2D(map, vUv) * 0.2270270;
      sum += texture2D(map, vUv + step * 1.3846154) * 0.3162162;
      sum += texture2D(map, vUv - step * 1.3846154) * 0.3162162;
      sum += texture2D(map, vUv + step * 3.2307692) * 0.0702703;
      sum += texture2D(map, vUv - step * 3.2307692) * 0.0702703;
      gl_FragColor = sum;
    }`,
};

const copyShader = {
  uniforms: { map: { value: null } },
  vertexShader: blurShader.vertexShader,
  fragmentShader: `
    uniform sampler2D map; varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(map, vUv);
      #include <colorspace_fragment>
    }`,
};

export function createSoftFocus(renderer) {
  const options = { type: HalfFloatType, depthBuffer: true };
  const a = new WebGLRenderTarget(1, 1, options);
  const b = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const blur = new ShaderMaterial({ ...blurShader, uniforms: UniformsUtils.clone(blurShader.uniforms), depthTest: false, depthWrite: false });
  const copy = new ShaderMaterial({ ...copyShader, uniforms: UniformsUtils.clone(copyShader.uniforms), depthTest: false, depthWrite: false, blending: NoBlending });
  const quad = new Mesh(new PlaneGeometry(2, 2), blur);
  quad.frustumCulled = false;
  const quadScene = new Scene();
  quadScene.add(quad);
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hidden = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const size = new Vector2();

  function pass(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(quadScene, quadCamera);
  }

  return {
    setSize(w, h) {
      const s = renderer.getPixelRatio() / 2;
      a.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
      b.setSize(a.width, a.height);
    },
    render(scene, camera) {
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.getSize(size);
      // 1. Shadows only: every layer, nothing drawn.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      camera.layers.enableAll();
      scene.overrideMaterial = hidden;
      renderer.setRenderTarget(a);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      // 2. The arena alone, at half size, then blurred both ways.
      camera.layers.set(ARENA_LAYER);
      renderer.clear();
      renderer.render(scene, camera);
      blur.uniforms.map.value = a.texture;
      blur.uniforms.step.value.set(BLUR / a.width, 0);
      pass(blur, b);
      blur.uniforms.map.value = b.texture;
      blur.uniforms.step.value.set(0, BLUR / a.height);
      pass(blur, a);
      // 3. Blurred arena on screen, then the board sharp over it.
      copy.uniforms.map.value = a.texture;
      pass(copy, null);
      camera.layers.set(0);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.shadowMap.autoUpdate = true;
      renderer.autoClear = autoClear;
    },
    dispose() {
      a.dispose();
      b.dispose();
      blur.dispose();
      copy.dispose();
      hidden.dispose();
      quad.geometry.dispose();
    },
  };
}
