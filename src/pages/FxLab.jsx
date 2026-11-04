import { useEffect, useRef, useState } from 'react';
import allCards from '../../shared/src/data/cards.json';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import { BOARD_SKILLS } from '../engine/board/board';
import { SKILL_FX } from '../table3d/SkillFx';
import styles from './FxLab.module.css';

const SKILLS = Object.keys(SKILL_FX);
// Five real cards with photos, one to show each skill.
const CARDS = allCards.filter(card => card.photo && card.league !== 'icon').slice(0, 40).filter((_, i) => i % 8 === 0).slice(0, SKILLS.length);

// A test bench for the board's skill effects: a card that can act shows it on itself.
export default function FxLab() {
  const hostRef = useRef(null);
  const labRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState('loading');
  const [ready, setReady] = useState(true);
  const [anchors, setAnchors] = useState([]);

  useEffect(() => {
    let lab;
    let cancelled = false;
    let timer;
    (async () => {
      try {
        const { default: Lab } = await import('../table3d/FxLab.js');
        if (cancelled) return;
        lab = new Lab(hostRef.current, { reducedMotion });
        labRef.current = lab;
        const ok = await lab.init(CARDS);
        if (cancelled) return;
        setState(ok ? 'ready' : 'failed');
        const place = () => setAnchors(lab.anchors());
        place();
        timer = setInterval(place, 500);
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => { cancelled = true; clearInterval(timer); lab?.destroy(); labRef.current = null; };
  }, [reducedMotion]);

  const toggle = () => {
    labRef.current?.setReady(!ready);
    setReady(!ready);
  };

  return (
    <main className={styles.lab}>
      <header className={styles.head}>
        <div>
          <h1>Skill effects</h1>
          <p>A card that can act lifts and tips toward you, and its skill plays on it. Fire one to see the moment it triggers.</p>
        </div>
        <button type="button" className={styles.toggle} data-on={ready || undefined} aria-pressed={ready} onClick={toggle}>{ready ? 'Ready: on' : 'Ready: off'}</button>
      </header>
      <div className={styles.stage}>
        <div ref={hostRef} className={styles.canvas} />
        {state === 'failed' && <p className={styles.note}>3D could not start here.</p>}
        {anchors.map((point, index) => {
          const skill = SKILLS[index];
          return (
            <div key={skill} className={styles.label} style={{ left: point.x, top: point.y }}>
              <b>{BOARD_SKILLS[skill].label}</b>
              <span>{SKILL_FX[skill].name}</span>
              <small>{SKILL_FX[skill].note}</small>
              <button type="button" onClick={() => labRef.current?.fire(index)}>Fire</button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
