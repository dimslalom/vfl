import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { t } from '../../lib/i18n';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { DEFAULT_MAP, clubSummary } from './clubSummary';

// Each side is itself the button: two equal choices, one flat plate each, and
// no button boxed inside a panel.
function Side({ label, state, onKeep, keepLabel }) {
  const summary = clubSummary(state);
  return (
    <button type="button" className={styles.syncSide} onClick={onKeep} aria-label={`${keepLabel}: ${summary.name}, ${label}`}>
      <span className={styles.kicker}>{label}</span>
      <b>{summary.name}</b>
      <span className={styles.tags}>
        <span className={club.tag} data-solid>{t(summary.tier)}</span>
        <span className={club.tag}>{t('Year {n}', { n: summary.year })}</span>
        <span className={club.tag}>{summary.titles === 1 ? t('1 title') : t('{n} titles', { n: summary.titles })}</span>
      </span>
      <span className={styles.cardRow} aria-hidden="true">
        {summary.starters.map(card => <PlayerCard key={card.id} card={card} displayScale={0.14} tilt={false} canDrag={false} />)}
      </span>
      <span className={styles.syncKeep}>{keepLabel}</span>
    </button>
  );
}

// Signed in with a club on this device and a different one on the account.
// Saves are never merged, so the player picks one and the other is replaced.
export default function ClubSyncChoice({ local, cloud, onKeepDevice, onKeepAccount }) {
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <div className={club.titleBlock}><b>{t('Two clubs found')}</b></div>
        </div>
      </header>
      <main className={club.ground} style={{ '--map': `url(${assetPath(DEFAULT_MAP)})` }}>
        <div className={styles.sync}>
          <p className={styles.lead}>{t('This device and your account each have a club. Keep one. The other is replaced and can’t be brought back.')}</p>
          <div className={styles.syncPair}>
            <Side label={t('On this device')} state={local} onKeep={onKeepDevice} keepLabel={t('Keep this one')} />
            <Side label={t('On your account')} state={cloud} onKeep={onKeepAccount} keepLabel={t('Keep this one')} />
          </div>
        </div>
      </main>
    </div>
  );
}
