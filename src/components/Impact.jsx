import { t } from '../lib/i18n';
import styles from './Impact.module.css';

// One change, shown as a before and an after. `rows` are
// { label, before, after, delta } with `delta` already formatted. `good` says
// whether the change helps, so a rise in a cost is not painted as a win.

export default function Impact({ rows, label }) {
  return (
    <dl className={styles.impact} aria-label={label ?? t('What changes')}>
      {rows.map(row => (
        <div key={row.label} className={styles.row}>
          <dt>{row.label}</dt>
          <dd className={styles.values}>
            {row.before != null && <span className={styles.before}>{row.before}</span>}
            {row.before != null && <span className={styles.arrow} aria-hidden="true">→</span>}
            <b>{row.after}</b>
            {row.delta != null && <span className={styles.delta} data-good={row.good}>{row.delta}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
