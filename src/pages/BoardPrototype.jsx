import { useEffect, useRef, useState } from 'react';
import ModeRail from '../components/ModeRail';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import { seriesWinner, winsNeeded } from '../engine/board/mapLanes';
import { dealSeries, roundBoard } from '../prototype/boardSetup';
import styles from './BoardPrototype.module.css';

function Pips({ total, won, side }) {
  return (
    <span className={styles.pips} data-side={side}>
      {Array.from({ length: total }, (_, index) => <i key={index} data-on={index < won ? 'true' : undefined} />)}
    </span>
  );
}

// A throwaway test of the map board on Pixi and GSAP. English only and unlinked
// from the rail until the design is proven. Buttons stay in the DOM so keyboard
// and screen reader support comes for free.
export default function BoardPrototype() {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState({ phase: 'loading', legal: false, placed: 0 });
  const [record, setRecord] = useState({ won: 0, lost: 0 });
  const [view, setView] = useState(null); // { bestOf, round, you, them, map, opponent }
  const [outcome, setOutcome] = useState(null);
  const [fps, setFps] = useState(null);
  const [renderer, setRenderer] = useState('');
  const [firstSeed] = useState(() => Date.now() & 0xffffff);
  const seedRef = useRef(firstSeed);
  const seriesRef = useRef(null);

  function playRound() {
    const run = seriesRef.current;
    const round = run.you + run.them;
    setOutcome(null);
    setView({
      bestOf: run.series.bestOf, round: round + 1, you: run.you, them: run.them,
      map: run.series.maps[round].name, opponent: run.series.opponentName,
    });
    stageRef.current?.deal(roundBoard(run.series, round, run.tactics));
  }

  function startSeries(bestOf) {
    seedRef.current += 1;
    const series = dealSeries(seedRef.current, bestOf);
    seriesRef.current = { series, you: 0, them: 0, tactics: series.tactics };
    playRound();
  }

  function finishRound(result) {
    const run = seriesRef.current;
    if (result.winner === 'you') run.you += 1;
    else run.them += 1;
    run.tactics = run.tactics.filter(card => card.uid !== result.tacticUid);
    const champion = seriesWinner(run.series.bestOf, run.you, run.them);
    setView(current => ({ ...current, you: run.you, them: run.them }));
    setOutcome({ ...result, champion });
    if (champion) {
      setRecord(value => (champion === 'you'
        ? { ...value, won: value.won + 1 }
        : { ...value, lost: value.lost + 1 }));
    }
  }

  useEffect(() => {
    let stage;
    let cancelled = false;
    (async () => {
      const { default: BoardStage } = await import('../prototype/BoardStage.js');
      if (cancelled) return;
      stage = new BoardStage(hostRef.current, {
        reducedMotion,
        onState: (next) => {
          setState(next);
          if (next.result) finishRound(next.result);
        },
      });
      stageRef.current = stage;
      if (await stage.init()) {
        setRenderer(stage.rendererName());
        startSeries(3);
      }
    })();
    return () => { cancelled = true; stage?.destroy(); stageRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    let frames = 0;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      frames += 1;
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { phase, legal, placed } = state;
  return (
    <main className={styles.page}>
      <ModeRail />
      <div className={styles.board} ref={hostRef} onClick={() => phase === 'resolve' && stageRef.current?.skip()} />
      <div className={styles.meter} aria-hidden="true">
        <span>{renderer}</span><span>{fps ?? '-'} fps</span><span>{record.won}-{record.lost}</span>
      </div>
      {view && (
        <div className={styles.series} aria-label={`Round ${view.round}, best of ${view.bestOf}, ${view.map} against ${view.opponent}`}>
          <b>{view.map}</b>
          <Pips total={winsNeeded(view.bestOf)} won={view.you} side="you" />
          <small>Bo{view.bestOf}</small>
          <Pips total={winsNeeded(view.bestOf)} won={view.them} side="them" />
          <span>{view.opponent}</span>
        </div>
      )}
      <div className={styles.bar}>
        {phase === 'place' && (
          <button type="button" className={styles.primary} disabled={!legal} onClick={() => stageRef.current?.lockIn()}>
            {legal ? 'Lock in' : `Place all five: ${placed}/5, one on every map`}
          </button>
        )}
        {phase === 'rotate' && (
          <button type="button" className={styles.primary} onClick={() => stageRef.current?.resolve()}>
            {state.rotated ? 'Rotate and go' : 'Go without rotating'}
          </button>
        )}
        {phase === 'rotate' && <p className={styles.hint}>IGL rotate: move one player to another map</p>}
        {phase === 'resolve' && <p className={styles.hint}>Tap to skip</p>}
      </div>
      {outcome && (
        <div className={styles.result} role="status">
          <h2 data-won={outcome.winner === 'you'}>
            {outcome.champion
              ? (outcome.champion === 'you' ? 'Series won' : 'Series lost')
              : (outcome.winner === 'you' ? 'Round won' : 'Round lost')}
          </h2>
          <p className={styles.line}><b>{outcome.youWon}</b><span>lanes</span><b>{outcome.themWon}</b></p>
          <p className={styles.line}><b>{outcome.youTotal}</b><span>total</span><b>{outcome.themTotal}</b></p>
          {outcome.champion ? (
            <>
              <button type="button" className={styles.primary} onClick={() => startSeries(3)}>Next enemy: Bo3</button>
              <button type="button" className={styles.secondary} onClick={() => startSeries(5)}>Next enemy: Bo5</button>
            </>
          ) : (
            <button type="button" className={styles.primary} onClick={playRound}>Next round</button>
          )}
        </div>
      )}
    </main>
  );
}
