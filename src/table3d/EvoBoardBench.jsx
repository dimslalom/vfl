import { useEffect, useRef, useState } from 'react';
import {
  CanvasTexture, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, Scene, ShapeGeometry, SRGBColorSpace, WebGLRenderer,
} from 'three';
import {
  ART_SCALE, CARD_H, CARD_T, CARD_TIP, CARD_W, PX, PY, cardArt, cutShape, drawCard, loadImage, slab,
} from './TableBlockout.js';
import { SKILL_FX, attachSkillFx, readyPose } from './SkillFx.js';
import { BOARD_SKILLS } from '../engine/board/board.js';
import { SPECIALTIES } from '../../shared/src/data/specialties.js';
import { playUiSound } from '../../shared/src/lib/gameAudio.js';
import { playSkillSound } from '../lib/evoSfx.js';
import useReducedMotion from '../../shared/src/lib/useReducedMotion.js';
import styles from './EvoBoardBench.module.css';

const ALL_SKILLS = [
  'anchor', 'first_blood', 'clutch', 'synergy_link', 'overdrive',
  'ironclad', 'lurk', 'velocity', 'combustion', 'phase',
  'timewarp', 'timewarp_spent', 'surge', 'ascendance', 'dominion', 'black_hole',
];

export default function EvoBoardBench({ card, defaultSkill = 'black_hole' }) {
  const hostRef = useRef(null);
  const benchRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [chosenSkill, setChosenSkill] = useState(null);
  const [prevDefault, setPrevDefault] = useState(defaultSkill);
  if (prevDefault !== defaultSkill) {
    setPrevDefault(defaultSkill);
    setChosenSkill(null);
  }
  const activeSkill = chosenSkill ?? defaultSkill;
  const [ready, setReady] = useState(true);
  const [status, setStatus] = useState('loading');

  const activeSkillRef = useRef(activeSkill);
  const readyRef = useRef(ready);

  useEffect(() => {
    activeSkillRef.current = activeSkill;
  }, [activeSkill]);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setStatus('failed'));
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    host.replaceChildren(renderer.domElement);

    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0x20232c, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1.2, 10, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
    scene.add(sun);

    const floor = new Mesh(new PlaneGeometry(16, 12), new MeshStandardMaterial({ color: 0x141824, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new PerspectiveCamera(28, 1, 0.5, 50);
    const fit = 3.6;
    camera.position.set(0, fit * 0.88, fit * 0.56);
    camera.lookAt(0, 0, 0.08);

    const shape = cutShape(CARD_W, CARD_H, CARD_TIP);
    const edge = new MeshStandardMaterial({ color: 0x2a2e39, roughness: 0.7 });
    const group = new Group();
    const body = new Mesh(slab(shape, CARD_T), edge);
    body.position.y = -CARD_T / 2;
    body.castShadow = true;

    const faceGeom = new ShapeGeometry(shape);
    const faceMat = new MeshStandardMaterial({ roughness: 0.55 });
    const face = new Mesh(faceGeom, faceMat);
    face.rotation.x = -Math.PI / 2;
    face.position.y = CARD_T / 2 + 0.001;
    group.add(body, face);
    scene.add(group);

    let fx = null;
    let cancelled = false;
    let cardTexture = null;

    const setupFx = (skill) => {
      if (fx) fx.dispose();
      fx = attachSkillFx(group, skill, { floorParent: scene });
    };

    const drawFace = async () => {
      await document.fonts?.load('800 40px "Familjen Grotesk"').catch(() => null);
      if (cancelled) return;
      const arts = await Promise.all(cardArt(card).map(loadImage));
      if (cancelled) return;

      const el = document.createElement('canvas');
      el.width = PX * ART_SCALE;
      el.height = PY * ART_SCALE;
      drawCard(el.getContext('2d'), card, arts, { side: 'you' });

      if (cardTexture) cardTexture.dispose();
      cardTexture = new CanvasTexture(el);
      cardTexture.colorSpace = SRGBColorSpace;
      cardTexture.anisotropy = 8;
      cardTexture.repeat.set(1 / CARD_W, 1 / CARD_H);
      cardTexture.offset.set(0.5, 0.5);
      faceMat.map = cardTexture;
      faceMat.needsUpdate = true;
    };

    drawFace();
    setupFx(activeSkillRef.current);
    queueMicrotask(() => setStatus('ready'));

    let time = 0;
    let last = 0;
    let amount = 1;
    let frame = 0;

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const sizer = new ResizeObserver(resize);
    sizer.observe(host);
    resize();

    const loop = (now) => {
      if (cancelled) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const speed = reducedMotion ? 0.25 : 1;
      time += dt * speed;
      amount += ((readyRef.current ? 1 : 0) - amount) * Math.min(1, dt * 8);

      readyPose(group, time, amount);
      if (fx) {
        fx.setVisible(amount > 0.05);
        fx.floor.position.y = -0.196;
        if (amount > 0.05) fx.update(dt * speed);
      }

      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);

    benchRef.current = {
      fire() {
        fx?.burst();
        playSkillSound(activeSkillRef.current);
      },
      changeSkill(skill) {
        setupFx(skill);
      },
    };

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      sizer.disconnect();
      fx?.dispose();
      cardTexture?.dispose();
      body.geometry.dispose();
      edge.dispose();
      faceGeom.dispose();
      faceMat.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      benchRef.current = null;
    };
  }, [card, reducedMotion]);

  useEffect(() => {
    benchRef.current?.changeSkill(activeSkill);
  }, [activeSkill]);

  const toggleReady = () => {
    const next = !ready;
    setReady(next);
    playUiSound(next ? 'rotate_ready' : 'drop');
  };

  const handleFire = () => {
    benchRef.current?.fire();
  };

  const spec = SPECIALTIES[activeSkill.replace(/_spent$/, '')] || { name: activeSkill, code: activeSkill.slice(0, 3).toUpperCase(), color: '#00c8a0' };
  const boardRule = BOARD_SKILLS[activeSkill]?.text || 'Active specialty trigger on board';
  const fxInfo = SKILL_FX[activeSkill] || { name: 'Effect', note: 'Visual board effect' };

  return (
    <section className={styles.bench} aria-label="Board skill effect preview">
      <div className={styles.benchHead}>
        <div>
          <h2>Board skill effect</h2>
          <p>Lifts and tilts when ready to act on the match table, running its board particle and ground effect.</p>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.stageBox}>
          <div ref={hostRef} className={styles.stageCanvas} />
          {status === 'failed' && <div className={styles.fallback}>3D preview unavailable</div>}

          <div className={styles.overlayControls}>
            <div className={styles.actions}>
              <button type="button" className={styles.fireBtn} onClick={handleFire}>
                Fire board effect
              </button>
              <button
                type="button"
                className={styles.toggleBtn}
                data-on={ready || undefined}
                aria-pressed={ready}
                onClick={toggleReady}
              >
                {ready ? 'Ready: on' : 'Ready: off'}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.sidePanel}>
          <div className={styles.skillDetail}>
            <div className={styles.skillHead}>
              <span className={styles.badge} style={{ color: spec.color }}>
                {spec.code}
              </span>
              <div className={styles.skillTitle}>
                <b>{spec.name}</b>
                <span>{fxInfo.name}</span>
              </div>
            </div>

            <dl className={styles.metaList}>
              <div>
                <dt>Match board rule</dt>
                <dd>{boardRule}</dd>
              </div>
              <div>
                <dt>3D effect styling</dt>
                <dd>{fxInfo.note}</dd>
              </div>
              <div>
                <dt>Progression tier</dt>
                <dd>Unlocks at Evo II</dd>
              </div>
            </dl>
          </div>

          <div className={styles.skillSelector}>
            <span className={styles.selectorLabel}>Evo board skills</span>
            <div className={styles.skillPills} role="group" aria-label="Evo board skills">
              {ALL_SKILLS.map(skill => {
                const s = SPECIALTIES[skill.replace(/_spent$/, '')];
                const on = skill === activeSkill;
                return (
                  <button
                    key={skill}
                    type="button"
                    className={styles.skillPill}
                    data-on={on || undefined}
                    aria-pressed={on}
                    style={{ borderColor: on ? (s?.color || 'var(--win)') : undefined }}
                    onClick={() => setChosenSkill(skill)}
                  >
                    <span style={{ color: s?.color }}>{s?.code || skill.slice(0, 3).toUpperCase()}</span>
                    <span>{skill.endsWith('_spent') ? 'Spent' : s?.name || skill}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
