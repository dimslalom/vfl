import { setMusic, setMusicVolume, useMusic } from '../lib/music';
import { t } from '../lib/i18n';
import styles from './MusicControls.module.css';

// The music switch and its volume, as two rows. Used by Club settings and by the
// settings panel inside a match. The slider is a native range input, styled flat.
export default function MusicControls({ rowClass, as: Row = 'div' }) {
  const { on, volume } = useMusic();
  const percent = Math.round(volume * 100);
  return (
    <>
      <Row className={`${styles.row} ${rowClass ?? ''}`}>
        <span className={styles.label}><b>{t('Music')}</b><small>{t('Plays during matches, loudest as one starts.')}</small></span>
        <button type="button" className={styles.toggle} data-on={on || undefined} aria-pressed={on} aria-label={t('Music')} onClick={() => setMusic(!on)}>
          {on ? t('On') : t('Off')}
        </button>
      </Row>
      <Row className={`${styles.row} ${rowClass ?? ''}`} data-off={!on || undefined}>
        <span className={styles.label}><b>{t('Music volume')}</b></span>
        <span className={styles.volume}>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={percent}
            disabled={!on}
            aria-label={t('Music volume')}
            style={{ '--fill': `${percent}%` }}
            onChange={event => setMusicVolume(Number(event.target.value) / 100)}
          />
          <b>{percent}</b>
        </span>
      </Row>
    </>
  );
}
