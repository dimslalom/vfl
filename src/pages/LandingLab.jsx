import { useState } from 'react';
import allCards from '../../shared/src/data/cards.json';
import ClubLanding from '../components/club/ClubLanding';
import { LadderLanding, PackLanding, RoadLanding } from '../components/club/LandingDirections';
import { STARTERS, draftPack, finishSeries, newClub, nextMatch } from '../engine/club/season';
import styles from './LandingLab.module.css';

const noop = () => {};

const DIRECTIONS = [
  ['a', 'A. Front door', props => <ClubLanding {...props} onContinue={noop} onFound={noop} onPrimer={noop} onSettings={noop} onExit={noop} />],
  ['b', 'B. Season road', props => <RoadLanding {...props} />],
  ['c', 'C. Pack first', props => <PackLanding {...props} />],
  ['d', 'D. Ladder', props => <LadderLanding {...props} />],
];

// A sample club two weeks in (one win, one loss), so the returning view has
// something real to show. Built with the engine, never saved.
function sampleClub() {
  const seed = 7;
  const picks = [];
  for (let index = 0; index < STARTERS; index += 1) picks.push(draftPack(seed, index, picks, allCards)[0].id);
  let state = newClub({ seed, name: 'Night Shift', picks, cards: allCards });
  for (const won of [true, false]) {
    const bestOf = nextMatch(state).bestOf;
    const need = Math.ceil(bestOf / 2);
    const results = Array.from({ length: need }, () => ({ map: 'Ascent', a: won ? 2 : 1, b: won ? 1 : 2, winA: won, mvp: null }));
    state = finishSeries(state, { won, results, hand: [] }, allCards);
  }
  return state;
}

// /lab/landing: compare the Club landing directions side by side at full size,
// for a new player and a returning one.
export default function LandingLab() {
  const [direction, setDirection] = useState('a');
  const [returning, setReturning] = useState(false);
  const [sample] = useState(sampleClub);
  const render = DIRECTIONS.find(([key]) => key === direction)[2];
  return (
    <>
      {render({ state: returning ? sample : null })}
      <div className={styles.controls}>
        <div role="group" aria-label="Direction">
          {DIRECTIONS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={direction === key} data-on={direction === key || undefined} onClick={() => setDirection(key)}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Player">
          <button type="button" aria-pressed={!returning} data-on={!returning || undefined} onClick={() => setReturning(false)}>New</button>
          <button type="button" aria-pressed={returning} data-on={returning || undefined} onClick={() => setReturning(true)}>Returning</button>
        </div>
      </div>
    </>
  );
}
