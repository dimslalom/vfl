import styles from './OverviewRow.module.css';

// The same three numbers in the same place on every main screen. `items` is
// three of { label, value }.
export default function OverviewRow({ items, label }) {
  return (
    <dl className={styles.row} aria-label={label}>
      {items.map(item => (
        <div key={item.label} className={styles.item}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
