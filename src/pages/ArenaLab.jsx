import { useState } from 'react';
import BoardSeries from '../components/BoardSeries';
import { dealSeries } from '../prototype/boardSetup';
import { ARENAS } from '../table3d/arena.js';
import styles from './ArenaLab.module.css';

const LOOKS = [['off', 'Plain'], ['grey', 'Grey'], ['tint', 'Tint']];
const MAPS = Object.keys(ARENAS);

// The board over each map's 3D arena: a real series on one chosen map, so every
// set can be judged at the real camera.
export default function ArenaLab() {
  const [series, setSeries] = useState(() => dealSeries(Date.now() & 0xffffff, 3));
  const [look, setLook] = useState('tint');
  const [map, setMap] = useState(MAPS[0]);

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <div className={styles.row} role="group" aria-label="Map">
          {MAPS.map(name => (
            <button key={name} type="button" aria-pressed={map === name} data-on={map === name || undefined} onClick={() => setMap(name)}>{name}</button>
          ))}
        </div>
        <div className={styles.row} role="group" aria-label="Arena">
          {LOOKS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={look === id} data-on={look === id || undefined} onClick={() => setLook(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className={styles.stage}>
        <BoardSeries
          key={`${series.seed}-${map}`}
          squad={series.you}
          opponent={series.them}
          opponentName={series.opponentName}
          bestOf={series.bestOf}
          seed={series.seed}
          hand={series.tactics}
          mapNames={[map, map, map]}
          onDone={() => setSeries(dealSeries(series.seed + 1, 3))}
          arena={look}
        />
      </div>
    </main>
  );
}
