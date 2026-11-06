import { setAmbientOn, setAmbientVolume, useAmbientAudio } from '../lib/ambientAudio';
import { t } from '../lib/i18n';
import styles from './MusicControls.module.css';

// Controls for the muffled arena broadcast background. Flat HUD controls matching MusicControls.
export default function AmbientControls({ rowClass, as: Row = 'div' }) {
  const { on, volume } = useAmbientAudio();
  const percent = Math.round(volume * 100);
  return (
    <>
      <Row className={`${styles.row} ${rowClass ?? ''}`}>
        <span className={styles.label}>
          <b>{t('Arena broadcast')}</b>
          <small>{t('Plays muffled match audio in the club background.')}</small>
        </span>
        <button
          type="button"
          className={styles.toggle}
          data-on={on || undefined}
          aria-pressed={on}
          aria-label={t('Arena broadcast')}
          onClick={() => setAmbientOn(!on)}
        >
          {on ? t('On') : t('Off')}
        </button>
      </Row>
      <Row className={`${styles.row} ${rowClass ?? ''}`} data-off={!on || undefined}>
        <span className={styles.label}><b>{t('Broadcast volume')}</b></span>
        <span className={styles.volume}>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={percent}
            disabled={!on}
            aria-label={t('Broadcast volume')}
            style={{ '--fill': `${percent}%` }}
            onChange={event => setAmbientVolume(Number(event.target.value) / 100)}
          />
          <b>{percent}</b>
        </span>
      </Row>
    </>
  );
}
