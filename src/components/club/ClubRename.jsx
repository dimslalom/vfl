import { useState } from 'react';
import { assetPath } from '../../../shared/src/lib/utils';
import { NAME_MAX, RENAME_PRICE, packValue } from '../../engine/club/economy';
import { canRename } from '../../engine/club/rewards';
import { t } from '../../lib/i18n';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import GameIcon from '../GameIcon';
import { DEFAULT_MAP } from './clubSummary';

// A new name for the club, paid in packs. The price and what the club holds sit
// beside the button, so the cost is known before the tap (UX principle 10).
export default function ClubRename({ state, onRename, onBack }) {
  const [name, setName] = useState(state.name);
  const have = packValue(state);
  const short = have < RENAME_PRICE;
  const ok = canRename(state, name);
  const submit = (event) => {
    event.preventDefault();
    if (ok) onRename(name);
  };
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <button type="button" className={club.iconButton} aria-label={t('Back to the club')} onClick={onBack}>
            <GameIcon name="arrow" dir="left" />
          </button>
          <div className={club.titleBlock}><b>{t('Rename club')}</b></div>
        </div>
      </header>
      <main className={club.ground} style={{ '--map': `url(${assetPath(DEFAULT_MAP)})` }}>
        <form id="rename" className={styles.naming} onSubmit={submit}>
          <label className={styles.nameBig}>
            <span>{t('New name')}</span>
            <input autoFocus value={name} maxLength={NAME_MAX} onChange={event => setName(event.target.value)} onFocus={event => event.target.select()} />
          </label>
          <p className={styles.cost}>
            <span><small>{t('Costs')}</small><b>{RENAME_PRICE}</b></span>
            <span data-short={short || undefined}><small>{t('You have')}</small><b>{have}</b></span>
          </p>
          {short && <p className={club.sub}>{t('Win a series to earn more packs.')}</p>}
        </form>
      </main>
      <footer className={styles.stepAct}>
        <button type="button" className={club.ghost} onClick={onBack}>{t('Cancel')}</button>
        <button type="submit" form="rename" className={club.primary} disabled={!ok}>{t('Rename for {n} packs', { n: RENAME_PRICE })}</button>
      </footer>
    </div>
  );
}
