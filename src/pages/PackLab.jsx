import { useEffect, useRef, useState } from 'react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import allCards from '../../shared/src/data/cards.json';
import { pickCover } from '../pack3d/packCover';
import { PACK_TYPE_LIST } from '../pack3d/packTypes';
import styles from './PackLab.module.css';

// A test page for the 3D pack: shape, foil, art and the tear.
export default function PackLab() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [type, setType] = useState(PACK_TYPE_LIST[0]);
  const [back, setBack] = useState(false);
  const [seed, setSeed] = useState(() => (Date.now() % 100000) + 1);
  const [squadStyle, setSquadStyle] = useState('map');
  const seedRef = useRef(seed);
  const [state, setState] = useState('loading');
  const [stats, setStats] = useState(null);
  const [opened, setOpened] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let scene;
    let unbind;
    let cancelled = false;
    (async () => {
      try {
        const { default: PackScene } = await import('../pack3d/PackScene.js');
        if (cancelled) return;
        scene = new PackScene(hostRef.current, { reducedMotion, onFail: () => setState('failed'), onOpened: () => setOpened(true) });
        sceneRef.current = scene;
        if (import.meta.env.DEV) window.packScene = scene;   // for poking at the tear from the console
        if (!(await scene.init())) return;
        unbind = scene.bindTear(hostRef.current);
        await scene.setType(PACK_TYPE_LIST[0], pickCover(PACK_TYPE_LIST[0], seedRef.current, allCards));
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    const timer = setInterval(() => { if (sceneRef.current) setStats({ ...sceneRef.current.stats }); }, 1000);
    return () => { cancelled = true; clearInterval(timer); unbind?.(); scene?.destroy(); sceneRef.current = null; };
  }, [reducedMotion]);

  // The pack as drawn: its type, with the squad style being compared on top.
  const dressed = (base, style = squadStyle) => ({ ...base, squadStyle: style });

  function pick(next) {
    setType(next);
    sceneRef.current?.setType(dressed(next), pickCover(next, seed, allCards));
  }

  function restyle(style) {
    setSquadStyle(style);
    sceneRef.current?.setType(dressed(type, style), pickCover(type, seed, allCards));
  }

  // A new pack is a new seed: a different star, map and layout on the cover.
  function roll() {
    const next = seed + 1 + Math.floor(Math.random() * 9973);
    setSeed(next);
    seedRef.current = next;
    sceneRef.current?.setType(dressed(type), pickCover(type, next, allCards));
  }

  function tear() {
    turn(false);
    sceneRef.current?.autoTear();
  }

  function slowDown() {
    setSlow(!slow);
    sceneRef.current?.setSpeed(slow ? 1 : 0.2);
  }

  function reseal() {
    setOpened(false);
    sceneRef.current?.reset();
  }

  function turn(showBack) {
    setBack(showBack);
    sceneRef.current?.showBack(showBack);
  }

  return (
    <main className={styles.lab}>
      <section className={styles.side}>
        <h1>Card pack</h1>
        <p className={styles.hint}>Move your pointer over the pack to tilt it. Drag across the top to tear it, or tap it.</p>
        <div className={styles.group} role="group" aria-label="Pack type">
          {PACK_TYPE_LIST.map(item => (
            <button key={item.id} type="button" aria-pressed={type.id === item.id} data-on={type.id === item.id || undefined} onClick={() => pick(item)}>
              <i style={{ background: item.palette.base }} aria-hidden="true" />
              {item.title}
            </button>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label="Players">
          {[['photo', 'Photos'], ['dots', 'Silhouette, dots'], ['lines', 'Silhouette, lines'], ['map', 'Silhouette, map']].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={squadStyle === id} data-on={squadStyle === id || undefined} onClick={() => restyle(id)}>{label}</button>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label="Side">
          <button type="button" aria-pressed={!back} data-on={!back || undefined} onClick={() => turn(false)}>Front</button>
          <button type="button" aria-pressed={back} data-on={back || undefined} onClick={() => turn(true)}>Back</button>
        </div>
        <div className={styles.pair}>
          <button type="button" className={styles.roll} onClick={tear} disabled={opened}>Tear</button>
          <button type="button" className={styles.ghost} onClick={reseal}>Reset</button>
        </div>
        <div className={styles.group} role="group" aria-label="Speed">
          <button type="button" aria-pressed={slow} data-on={slow || undefined} onClick={slowDown}>Slow motion</button>
        </div>
        <button type="button" className={styles.roll} onClick={roll}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" /></svg>
          New pack
        </button>
        <dl className={styles.stats}>
          <div><dt>Cover seed</dt><dd>{seed}</dd></div>
          <div><dt>Model</dt><dd>126 KB</dd></div>
          <div><dt>Triangles</dt><dd>{stats?.triangles ?? '...'}</dd></div>
          <div><dt>Frame</dt><dd>{stats ? `${stats.ms.toFixed(1)} ms` : '...'}</dd></div>
        </dl>
      </section>
      <div className={styles.stage}>
        <div className={styles.host} ref={hostRef} />
        {state === 'loading' && <p className={styles.notice} role="status">Loading the pack</p>}
        {state === 'failed' && <p className={styles.notice} role="alert">3D isn't available here, so the game would use the flat pack.</p>}
      </div>
    </main>
  );
}
