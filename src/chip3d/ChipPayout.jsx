import { chipInfo, chipPlan } from './chipData';
import { chipCopy, planLine } from './chipCopy';
import { ChipGuideButton, ChipLadder } from './ChipHelp';
import styles from './ChipPayout.module.css';

export { ChipIcon } from './ChipHelp';

// Hint A: a picked chip's tag, just above it with its tail on the chip. Its
// name, what it pays, the effect in a line and what it does for this squad.
// `at` is the point above the chip, in the parent's pixels.
export default function ChipPayout({ chipKey, at, roster = null }) {
  if (!chipKey || !at) return null;
  const info = chipInfo(chipKey);
  const copy = chipCopy(info.key);
  const plan = roster?.length ? chipPlan(chipKey, roster) : null;
  const left = Math.max(8, at.x - 40);
  return (
    <div className={styles.card} style={{ left, top: at.y, '--tail': `${at.x - left}px` }} data-tier={info.tier} aria-live="polite">
      <b className={styles.name}>{info.name}</b>
      <ChipLadder chipKey={chipKey} />
      <p className={styles.line}>{copy.effect}</p>
      {plan && <p className={styles.plan} data-fits={plan.fits || undefined}>{planLine(plan)}</p>}
      <ChipGuideButton className={styles.guide} />
    </div>
  );
}
