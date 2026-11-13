import { useState } from 'react';
import BoardSeries from '../components/BoardSeries';
import ModeRail from '../components/ModeRail';
import { dealSeries } from '../prototype/boardSetup';
import styles from './BoardPrototype.module.css';

// A sandbox for the board on its own, away from any run.
export default function BoardPrototype() {
  const [series, setSeries] = useState(() => dealSeries(Date.now() & 0xffffff, 3));
  const [finished, setFinished] = useState(false);

  function start(bestOf) {
    setFinished(false);
    setSeries(dealSeries(series.seed + 1, bestOf));
  }

  return (
    <main className={styles.page}>
      <ModeRail />
      <div className={styles.stage}>
        {finished ? (
          <div className={styles.next}>
            <button type="button" onClick={() => start(3)}>Next enemy: Bo3</button>
            <button type="button" onClick={() => start(5)}>Next enemy: Bo5</button>
          </div>
        ) : (
          <BoardSeries
            key={series.seed}
            squad={series.you}
            opponent={series.them}
            opponentName={series.opponentName}
            bestOf={series.bestOf}
            seed={series.seed}
            hand={series.tactics}
            onDone={() => setFinished(true)}
          />
        )}
      </div>
    </main>
  );
}
