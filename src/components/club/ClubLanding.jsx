import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { signInHref } from '../../lib/account';
import { t } from '../../lib/i18n';
import LanguagePicker from '../LanguagePicker';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { DEFAULT_MAP, SHOWCASE, clubSummary, ordinalPos, stageLabel } from './clubSummary';

// Sign-in is optional: shown only when the account service answers, and never
// in front of Create or Continue.
function AccountLine({ account }) {
  if (account?.status === 'signedIn') return <p className={styles.note}>{t('Signed in as {name}', { name: account.user.name })}</p>;
  if (account?.status === 'signedOut') return <a className={styles.signin} href={signInHref('/club')}>{t('Sign in with Discord')}</a>;
  return <p className={styles.note}>{t('Saved on this device.')}</p>;
}

// Direction A, "Front door": the one shipped in /club. One sentence and one button.
// A new player reads what the mode is; a returning one sees their own club and
// Continue. Everything else is a quiet link. Signing in with Discord is optional.
export default function ClubLanding({ state, account, map = DEFAULT_MAP, onContinue, onFound, onPrimer, onSettings }) {
  const summary = clubSummary(state);
  const returning = Boolean(summary);
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <span className={club.crest} aria-hidden="true" />
          <div className={club.titleBlock}>
            <b>{t('Clubs')}</b>
            {returning && (
              <span className={club.tagRow}>
                <span className={club.tag} data-solid>{t(summary.tier)}</span>
                <span className={club.tag}>{t('Year {n}', { n: summary.year })}</span>
              </span>
            )}
          </div>
        </div>
        <div className={club.chips}><LanguagePicker /></div>
      </header>

      <main className={`${club.ground} ${styles.landing}`} style={{ '--map': `url(${assetPath(map)})` }}>
        <div className={styles.intro}>
          <span className={styles.kicker}>{returning ? t('Your club') : t('Club mode')}</span>
          <h1 className={styles.headline}>{returning ? summary.name : t('Run a club')}</h1>
          {returning ? (
            <span className={styles.tags}>
              {summary.pos && <span className={club.tag}>{ordinalPos(summary.pos)}</span>}
              <span className={club.tag}>{summary.titles === 1 ? t('1 title') : t('{n} titles', { n: summary.titles })}</span>
            </span>
          ) : (
            <p className={styles.lead}>{t('Draft five pros, win a six-club league, and climb three tiers. Finish last twice and the board sacks you.')}</p>
          )}
        </div>

        <div className={styles.cardRow} aria-hidden="true">
          {(returning ? summary.starters : SHOWCASE).map(card => (
            <PlayerCard key={card.id} card={card} displayScale={0.24} tilt={false} canDrag={false} />
          ))}
        </div>

        {returning && summary.match && (
          <div className={styles.fixture}>
            <span>
              <small>{stageLabel(summary.match)}</small>
              <b>{summary.match.rival}</b>
            </span>
            <span className={club.tag}>{t('Best of {n}', { n: summary.match.bestOf })}</span>
          </div>
        )}
      </main>

      <footer className={styles.foot}>
        <nav className={styles.links} aria-label={t('More')}>
          <button type="button" className={styles.link} onClick={onPrimer}>{t('How it plays')}</button>
          <button type="button" className={styles.link} onClick={onSettings}>{t('Settings')}</button>
        </nav>
        <div className={styles.go}>
          <AccountLine account={account} />
          {returning
            ? <button type="button" className={club.primary} autoFocus onClick={onContinue}>{t('Continue')}</button>
            : <button type="button" className={club.primary} autoFocus onClick={onFound}>{t('Create your club')}</button>}
        </div>
      </footer>
    </div>
  );
}
