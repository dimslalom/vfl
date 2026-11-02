import { t } from '../lib/i18n';
import { signed } from '../lib/format';
import styles from './ScoreLines.module.css';

// How a score was made, line by line. The total is passed in rather than added
// up, so what is shown is always the score the game actually gave.
export default function ScoreLines({ lines, total, totalLabel, small = false }) {
  return (
    <div className={styles.lines} data-small={small ? 'true' : undefined}>
      <ul>
        {lines.map(line => (
          <li key={line.key}>
            <span>{t(line.label)}</span>
            {line.count != null && <i>×{line.count}</i>}
            <b>{signed(line.value, 0)}</b>
          </li>
        ))}
      </ul>
      <div className={styles.total}>
        <span>{totalLabel}</span>
        <b>{total.toLocaleString()}</b>
      </div>
    </div>
  );
}
