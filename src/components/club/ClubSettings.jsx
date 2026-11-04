import { useState } from 'react';
import { assetPath } from '../../../shared/src/lib/utils';
import { t } from '../../lib/i18n';
import { resetHints } from '../../lib/clubOnboarding';
import LanguagePicker from '../LanguagePicker';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { DEFAULT_MAP } from './clubSummary';

function Toggle({ on, label, onChange }) {
  return (
    <button type="button" className={`${club.small} ${styles.toggle}`} data-on={on || undefined} aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}>
      {on ? t('On') : t('Off')}
    </button>
  );
}

// Club settings: onboarding switches, language, and a plain line on where the
// save lives. Rows are flat plates in one list, no boxes inside boxes.
export default function ClubSettings({ prefs, onChange, onBack, onPrimer }) {
  const [reset, setReset] = useState(false);
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <button type="button" className={club.iconButton} aria-label={t('Back')} onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div className={club.titleBlock}><b>{t('Settings')}</b></div>
        </div>
      </header>

      <main className={club.ground} style={{ '--map': `url(${assetPath(DEFAULT_MAP)})` }}>
        <ul className={styles.settings}>
          <li className={styles.groupHead}>{t('Learning the game')}</li>
          <li>
            <span><b>{t('Primer before a new club')}</b><small>{t('Three short steps before the founding draft.')}</small></span>
            <Toggle on={prefs.primer} label={t('Primer before a new club')} onChange={primer => onChange({ ...prefs, primer })} />
          </li>
          <li>
            <span><b>{t('First-week tips')}</b><small>{t('One tip per screen during your first week.')}</small></span>
            <Toggle on={prefs.hints} label={t('First-week tips')} onChange={hints => onChange({ ...prefs, hints })} />
          </li>
          <li>
            <span><b>{t('How it plays')}</b><small>{t('Run the three-step primer now.')}</small></span>
            <button type="button" className={club.small} onClick={onPrimer}>{t('Play')}</button>
          </li>
          <li>
            <span><b>{t('Show tips again')}</b><small>{t('Brings back every tip and the primer.')}</small></span>
            <button type="button" className={club.small} disabled={reset} onClick={() => { onChange(resetHints(prefs)); setReset(true); }}>{reset ? t('Done') : t('Reset')}</button>
          </li>
          <li className={styles.groupHead}>{t('This device')}</li>
          <li>
            <span><b>{t('Language')}</b></span>
            <LanguagePicker />
          </li>
          <li>
            <span><b>{t('Your save')}</b><small>{t('Your club is saved in this browser only. Clearing site data deletes it.')}</small></span>
          </li>
        </ul>
      </main>
    </div>
  );
}
