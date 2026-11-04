import { chipInfo } from './chipData';
import { ICON_LABELS, ICON_PATHS } from './chipIcons';
import styles from './ChipPayout.module.css';

export function ChipIcon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" role="img" aria-label={ICON_LABELS[name]}>
      {ICON_PATHS[name].map(d => <path key={d} d={d} />)}
    </svg>
  );
}

// A picked chip's payout, a small tag just above it with its tail on the chip:
// what goes on the lane, and what it multiplies by. `at` is the point above the
// chip, in the parent's pixels. Chips sit at the left, so the tag runs rightwards.
export default function ChipPayout({ chipKey, at }) {
  if (!chipKey || !at) return null;
  const info = chipInfo(chipKey);
  const left = Math.max(8, at.x - 40);
  return (
    <div className={styles.card} style={{ left, top: at.y, '--tail': `${at.x - left}px` }} data-tier={info.tier} aria-live="polite">
      <b className={styles.name}>{info.name}</b>
      <ol className={styles.ladder}>
        {info.ladder.map(step => (
          <li key={step.icons.join() + step.mult}>
            <span className={styles.icons}>{step.icons.map((name, i) => <ChipIcon key={name + i} name={name} size={16} />)}</span>
            <b className={styles.mult}>×{step.mult}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}
