import { useEffect, useRef, useState } from 'react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import Chip3D from '../chip3d/Chip3D';
import ChipPayout from '../chip3d/ChipPayout';
import { CHIP_FLOOR, CHIP_KEYS, CODES, ROLES, SKILLS, chainMultFor, chipInfo, chipMultFor } from '../chip3d/chipData';
import { chipCopy, chipRules } from '../chip3d/chipCopy';
import { ChipGuideButton, ChipLadder, ChipLegend, Token } from '../chip3d/ChipHelp';
import { FACES, HINTS, setChipStyle, useChipStyle } from '../chip3d/chipStyle';
import { t } from '../lib/i18n';
import styles from './ChipLab.module.css';

const HANDS = [
  { id: 'board', label: 'Board hand', keys: ['retake', 'noRespect', 'hit'] },
  { id: 'five', label: 'Five chips', keys: ['pocket', 'layers', 'contact', 'defaults', 'lockout'] },
  { id: 'all', label: 'All ten', keys: CHIP_KEYS },
];
const LANES = ['A', 'B', 'C'];


const FACE_LABELS = { code: 'A: role codes', glyph: 'B: icons' };
const HINT_LABELS = { tag: 'A: tag on the chip', coach: 'B: line on top' };
const LANE_SIZE = 3;

// The chip codex: every chip in 3D with what it does, a lane to try them on, and
// (med-fi only) the switches between the two faces and the two board hints.
export default function ChipLab() {
  const style = useChipStyle();
  const [chosen, setChosen] = useState(CHIP_KEYS[0]);
  return (
    <main className={styles.page}>
      <header className={styles.codexHead}>
        <div>
          <h1>{t('Chip codex')}</h1>
          <p className={styles.hint}>{t('Every tactic chip, what it needs on a lane and what it pays.')}</p>
        </div>
        <ChipGuideButton />
      </header>

      <section className={styles.switches} aria-label="Med-fi options">
        <div className={styles.switch} role="group" aria-label="Chip face">
          <span>Chip face</span>
          {FACES.map(face => <button key={face} type="button" aria-pressed={style.face === face} data-on={style.face === face || undefined} onClick={() => setChipStyle({ face })}>{FACE_LABELS[face]}</button>)}
        </div>
        <div className={styles.switch} role="group" aria-label="Board hint">
          <span>Board hint</span>
          {HINTS.map(hint => <button key={hint} type="button" aria-pressed={style.hint === hint} data-on={style.hint === hint || undefined} onClick={() => setChipStyle({ hint })}>{HINT_LABELS[hint]}</button>)}
        </div>
      </section>

      <ol className={styles.rulesRow}>
        {chipRules().map(rule => <li key={rule.title}><b>{rule.title}</b><span>{rule.text}</span></li>)}
      </ol>

      <section className={styles.legendRow} aria-label={t('What the symbols mean')}>
        <ChipLegend />
      </section>

      <LaneDemo chipKey={chosen} />

      <ul className={styles.codex}>
        {CHIP_KEYS.map((key, index) => {
          const info = chipInfo(key);
          const copy = chipCopy(key);
          return (
            <li key={key}>
              <button type="button" className={styles.entry} data-on={chosen === key || undefined} aria-pressed={chosen === key} onClick={() => setChosen(key)}>
                <Chip3D chipKey={key} size={128} phase={index * 0.9} />
                <span className={styles.tier} data-tier={info.tier}>{t(info.tier)}</span>
                <b className={styles.entryName}>{info.name}</b>
                <ChipLadder chipKey={key} size="s" />
                <p>{copy.effect}</p>
                <dl>
                  <div><dt>{t('Good when')}</dt><dd>{copy.when}</dd></div>
                  <div><dt>{t('Watch out')}</dt><dd>{copy.risk}</dd></div>
                </dl>
              </button>
            </li>
          );
        })}
      </ul>

      <section className={styles.testSection}>
        <h2>Stack and drag test</h2>
        <StackTest />
      </section>
    </main>
  );
}

// Build a lane by tapping players onto it and see what the picked chip pays,
// straight from the board's numbers.
function LaneDemo({ chipKey }) {
  const { face } = useChipStyle();
  const [lane, setLane] = useState(['Controller', 'Initiator']);
  const info = chipInfo(chipKey);
  const mult = chipMultFor(chipKey, lane);
  const cut = info.special === 'disrespect' ? (lane.includes('flick') ? '0 ×1.5' : '0') : info.special === 'cancel' ? 'OFF' : null;
  const add = token => setLane(current => (current.length >= LANE_SIZE ? current : [...current, token]));
  return (
    <section className={styles.demo} aria-label={t('Try a lane')}>
      <div className={styles.demoChip}>
        <Chip3D chipKey={chipKey} size={150} />
        <b>{info.name}</b>
      </div>
      <div className={styles.demoBody}>
        <h2>{t('Try a lane')}</h2>
        <p className={styles.hint}>{t('Pick a chip below, then tap players onto the lane. A lane holds three.')}</p>
        <div className={styles.palette} role="group" aria-label={t('Add a player')}>
          {['igl', ...ROLES, ...SKILLS].map(token => (
            <button key={token} type="button" onClick={() => add(token)} disabled={lane.length >= LANE_SIZE} aria-label={`${t('Add')} ${CODES[token]}`}>
              <Token name={token} face={face} />
            </button>
          ))}
        </div>
        <div className={styles.lane3}>
          {Array.from({ length: LANE_SIZE }, (_, index) => (
            lane[index]
              ? <button key={index} type="button" className={styles.slot} onClick={() => setLane(current => current.filter((_, i) => i !== index))} aria-label={`${t('Remove')} ${CODES[lane[index]]}`}><Token name={lane[index]} face={face} /></button>
              : <span key={index} className={styles.slot} data-empty />
          ))}
          <b className={styles.demoMult} data-up={mult > CHIP_FLOOR || cut === '0' || undefined}>{cut ?? `×${mult}`}</b>
        </div>
        <p className={styles.hint}>{info.special === 'disrespect' ? t('Their best player on this lane scores 0.') : info.special === 'cancel' ? t('And the enemy chip pays nothing, wherever it is.') : mult > CHIP_FLOOR ? t('This lane triggers the chip.') : t('Only the ×1.5 every chip pays.')}</p>
        {info.special === 'chain' && <p className={styles.hint}>{t('Plus ×{mult} on the lane to its left.', { mult: chainMultFor(lane) })}</p>}
      </div>
    </section>
  );
}

// The original test for the 3D tactic chips: the stack, reading a chip, and
// dragging one onto a lane. The lanes stand in for the board.
function StackTest() {
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
    <div className={styles.lab}>
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
    </div>
  );
}
