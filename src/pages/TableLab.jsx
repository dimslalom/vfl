import { useEffect, useRef, useState } from 'react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import styles from './TableLab.module.css';

const VIEWS = [['top', 'Top-down'], ['tilt', 'Tilted'], ['low', 'Low']];

// A grey blockout of the 2.5D board: judge the camera and readability before art.
export default function TableLab() {
  const hostRef = useRef(null);
  const overlayRef = useRef(null);
  const sceneRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [view, setView] = useState({ view: 'tilt', placed: 0, hidden: 3, seed: 1, map: '' });
  const [state, setState] = useState('loading');

  useEffect(() => {
    let scene;
    let cancelled = false;
    (async () => {
      try {
        const { default: TableBlockout } = await import('../table3d/TableBlockout.js');
        // Headers and card faces are painted on canvases: the type must be loaded first.
        await document.fonts?.load('800 40px "Familjen Grotesk"').catch(() => null);
        if (cancelled) return;
        scene = new TableBlockout(hostRef.current, overlayRef.current, { reducedMotion, onChange: setView, seed: (Date.now() % 9973) + 1 });
        sceneRef.current = scene;
        if (import.meta.env.DEV) window.table = scene;
        const ok = await scene.init();
        if (!cancelled) setState(ok ? 'ready' : 'failed');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => { cancelled = true; scene?.destroy(); sceneRef.current = null; };
  }, [reducedMotion]);

  return (
    <main className={styles.lab}>
      <section className={styles.side}>
        <h1>Board in 2.5D</h1>
        <p className={styles.hint}>A real round. Drag a hand card onto a lane, tap a card to pick it, then reveal the enemy.</p>
        <div className={styles.group} role="group" aria-label="Camera">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view.view === id} data-on={view.view === id || undefined} onClick={() => sceneRef.current?.setView(id)}>{label}</button>
          ))}
        </div>
        <div className={styles.pair}>
          <button type="button" className={styles.solid} onClick={() => sceneRef.current?.reveal()} disabled={!view.hidden}>Reveal</button>
          <button type="button" className={styles.ghost} onClick={() => sceneRef.current?.reset()}>Reset</button>
        </div>
        <button type="button" className={styles.ghost} onClick={() => sceneRef.current?.deal(view.seed + 1 + Math.floor(Math.random() * 997))}>New deal</button>
        <dl className={styles.stats}>
          <div><dt>Map</dt><dd>{view.map}</dd></div>
          <div><dt>Your cards placed</dt><dd>{view.placed}/5</dd></div>
          <div><dt>Enemy hidden</dt><dd>{view.hidden}</dd></div>
        </dl>
      </section>
      <div className={styles.stage}>
        <div className={styles.host} ref={hostRef} />
        <div className={styles.overlay} ref={overlayRef} aria-hidden="true" />
        {state === 'loading' && <p className={styles.notice} role="status">Dealing the board</p>}
        {state === 'failed' && <p className={styles.notice} role="alert">3D isn't available here.</p>}
      </div>
    </main>
  );
}
