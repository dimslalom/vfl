import { useEffect, useRef, useState } from 'react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import ChipPayout from '../chip3d/ChipPayout';
import { CHIP_KEYS } from '../chip3d/chipData';
import styles from './ChipLab.module.css';

const HANDS = [
  { id: 'board', label: 'Board hand', keys: ['retake', 'noRespect', 'hit'] },
  { id: 'five', label: 'Five chips', keys: ['pocket', 'layers', 'contact', 'defaults', 'lockout'] },
  { id: 'all', label: 'All ten', keys: CHIP_KEYS },
];
const LANES = ['A', 'B', 'C'];


// A test page for the 3D tactic chips: the stack, reading a chip, and dragging
// one onto a lane. The lanes stand in for the board.
export default function ChipLab() {
  const hostRef = useRef(null);
  const laneRefs = useRef([]);
  const sceneRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [hand, setHand] = useState(HANDS[0]);
  const [view, setView] = useState({ opened: false, selected: null, anchor: null, over: null, placed: {}, count: 0 });
  const [state, setState] = useState('loading');
  const [ms, setMs] = useState(null);

  useEffect(() => {
    let scene;
    let cancelled = false;
    // The board says where a chip can land: the middle of the lane under the pointer.
    const dropTarget = (x, y) => {
      for (const [i, el] of laneRefs.current.entries()) {
        const box = el?.getBoundingClientRect();
        if (box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
          return { id: LANES[i], x: box.left + box.width / 2, y: box.top + box.height / 2 };
        }
      }
      return null;
    };
    (async () => {
      try {
        const { default: ChipStack } = await import('../chip3d/ChipStack.js');
        if (cancelled) return;
        scene = new ChipStack(hostRef.current, { reducedMotion, onFail: () => setState('failed'), onChange: setView, dropTarget });
        sceneRef.current = scene;
        if (import.meta.env.DEV) window.chipStack = scene;
        if (!(await scene.init())) return;
        scene.setChips(HANDS[0].keys);
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    const timer = setInterval(() => { if (sceneRef.current) setMs(sceneRef.current.stats.ms); }, 1000);
    return () => { cancelled = true; clearInterval(timer); scene?.destroy(); sceneRef.current = null; };
  }, [reducedMotion]);

  function deal(next) {
    setHand(next);
    sceneRef.current?.setChips(next.keys);
  }

  return (
    <main className={styles.lab}>
      <section className={styles.side}>
        <h1>Tactic chips</h1>
        <p className={styles.hint}>Click the stack to open it, then click a chip to read it. Drag any chip onto a lane to play it; click it there to take it back.</p>
        <div className={styles.group} role="group" aria-label="Hand">
          {HANDS.map(item => (
            <button key={item.id} type="button" aria-pressed={hand.id === item.id} data-on={hand.id === item.id || undefined} onClick={() => deal(item)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.pair}>
          <button type="button" className={styles.solid} onClick={() => sceneRef.current?.open()} disabled={view.opened}>Open</button>
          <button type="button" className={styles.ghost} onClick={() => sceneRef.current?.close()} disabled={!view.opened}>Stack</button>
        </div>
        <dl className={styles.stats}>
          <div><dt>Chips</dt><dd>{view.count}</dd></div>
          <div><dt>On lanes</dt><dd>{Object.keys(view.placed).length}</dd></div>
          <div><dt>Model</dt><dd>None, built in code</dd></div>
          <div><dt>Frame</dt><dd>{ms == null ? '...' : `${ms.toFixed(1)} ms`}</dd></div>
        </dl>
      </section>
      <div className={styles.stage}>
        <div className={styles.lanes} aria-label="Lanes">
          {LANES.map((id, i) => (
            <div key={id} ref={(el) => { laneRefs.current[i] = el; }} className={styles.lane} data-over={view.over === id || undefined} data-full={view.placed[id] ? '' : undefined}>
              <b>{id}</b>
            </div>
          ))}
        </div>
        <div className={styles.host} ref={hostRef} />
        <ChipPayout chipKey={view.selected} at={view.anchor} />
        {state === 'loading' && <p className={styles.notice} role="status">Loading the chips</p>}
        {state === 'failed' && <p className={styles.notice} role="alert">3D isn't available here, so the game would use flat chips.</p>}
      </div>
    </main>
  );
}
