import { useState } from 'react';
import { t } from '../lib/i18n';
import Sheet from './Sheet';
import styles from './RunHud.module.css';

// Standing, reachable from everywhere in the loop. The strip is one button so
// the whole thing is a tap target; `children` is the detail it opens. View
// state only: nothing here is saved.
export default function RunHud({ squadName, when, tierLabel, score, scoreLabel, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.hud}
        onClick={() => setOpen(true)}
        aria-label={t('Open run details')}
      >
        <span className={styles.squad}>{squadName}</span>
        {when && <span className={styles.when}>{when}</span>}
        {tierLabel && <span className={styles.tier}>{tierLabel}</span>}
        <span className={styles.score}>
          <small>{scoreLabel}</small>
          <b>{score.toLocaleString()}</b>
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={squadName || t('Your run')}>
        <div className={styles.detail}>{children}</div>
      </Sheet>
    </>
  );
}
