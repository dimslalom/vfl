import { useSyncExternalStore } from 'react';
import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { LEAGUE_SIZE } from '../../engine/club/season';
import { signInHref } from '../../lib/account';
import { t } from '../../lib/i18n';
import ClubLogo from '../ClubLogo';
import LanguagePicker from '../LanguagePicker';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { Crest } from './HubFeed';
import { CLIMB, DEFAULT_MAP, clubSummary, ordinalPos, stageLabel } from './clubSummary';

// A card's art is 400 x 580 at scale 1.
const CARD_W = 400;
const CARD_H = 580;
const PHONE = 760;

const subscribe = onChange => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const readViewport = () => `${window.innerWidth}x${window.innerHeight}`;

// The cards are the hero, so they take what the screen can spare: the row fits
// the width (three on a phone), and the height left after the text and buttons.
function useCardScale(count) {
  const [w, h] = useSyncExternalStore(subscribe, readViewport, () => '1440x900').split('x').map(Number);
  const phone = w < PHONE;
  const shown = phone ? Math.min(count, 3) : count;
  const gutter = phone ? 32 : 80;
  const byWidth = (w - gutter - (shown - 1) * 8) / (shown * CARD_W);
  const byHeight = (h - (phone ? 480 : 560)) / CARD_H;
  return Math.max(0.2, Math.min(0.42, byWidth, byHeight));
}

// Sign-in is optional: shown only when the account service answers, and never
// in front of Create or Continue.
function AccountLine({ account }) {
  if (account?.status === 'signedIn') return <p className={styles.note}>{t('Signed in as {name}', { name: account.user.name })}</p>;
  if (account?.status === 'signedOut') return <a className={styles.signin} href={signInHref('/club')}>{t('Sign in with Discord')}</a>;
  return <p className={styles.note}>{t('Saved on this device')}</p>;
}

// Where the club sits in the six-club table, drawn rather than written.
function Place({ pos }) {
  return (
    <span className={styles.place} role="img" aria-label={ordinalPos(pos)}>
      <small>{t('Table')}</small>
      <span className={styles.placePips}>
        {Array.from({ length: LEAGUE_SIZE }, (_, index) => <i key={index} data-on={index === pos - 1 || undefined} />)}
      </span>
    </span>
  );
}

// Direction A, "Front door": the one shipped in /club. One sentence and one button.
// A new player reads what the mode is; a returning one sees their own club and Play,
// taking them into the club hub. Everything else is a quiet link. Discord sign-in is optional.
export default function ClubLanding({ state, account, map = DEFAULT_MAP, due = false, onContinue, onFound, onPrimer, onSettings }) {
  const summary = clubSummary(state);
  const returning = Boolean(summary);
  const cards = returning ? summary.starters : CLIMB;
  const scale = useCardScale(cards.length);
  const isPlayingSeason = returning && (summary.phase === 'league' || summary.phase === 'playoffs');
  const actionLabel = isPlayingSeason ? t('Play') : t('Continue');
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          {returning ? <ClubLogo name={state.name} style={state.crest} tone={state.tone} size={50} /> : <span className={club.crest} aria-hidden="true" />}
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
          <span className={styles.kicker}>{returning ? t('Your club') : t('VCT card game')}</span>
          <h1 className={styles.headline}>{returning ? summary.name : t('Run a club')}</h1>
          {returning ? (
            (summary.pos || summary.titles > 0) && (
              <span className={styles.tags}>
                {summary.pos && <Place pos={summary.pos} />}
                {summary.titles > 0 && <span className={club.tag}>{summary.titles === 1 ? t('1 title') : t('{n} titles', { n: summary.titles })}</span>}
              </span>
            )
          ) : (
            <p className={styles.lead}>{t('Draft five pros, win a six-club league, and climb three tiers. Finish last twice and the board sacks you.')}</p>
          )}
        </div>

        <div className={styles.cardRow} data-count={cards.length} aria-hidden="true">
          {cards.map((card, index) => (
            <span key={card.id} className={club.dealt} style={{ '--deal': index }}>
              <PlayerCard card={card} displayScale={scale} tilt={false} canDrag={false} />
            </span>
          ))}
        </div>

        {returning && summary.match && (
          <div className={styles.fixture}>
            <Crest club={{ name: summary.match.rival, logo: summary.match.logo }} size={32} />
            <span>
              <small>{stageLabel(summary.match)}</small>
              <b>{summary.match.rival}</b>
            </span>
            <small className={styles.bestOf}>{t('Best of {n}', { n: summary.match.bestOf })}</small>
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
          {!returning && <button type="button" className={club.primary} autoFocus onClick={onFound}>{t('Create your club')}</button>}
          {returning && (
            <button type="button" className={`${club.primary} ${styles.flagged}`} autoFocus onClick={onContinue}>
              {due && <span className={club.pip} role="img" aria-label={t('Needs a look')} />}
              {actionLabel}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
