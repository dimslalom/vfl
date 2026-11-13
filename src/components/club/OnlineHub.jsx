// The hub's Online face: the same grid as Season, with the rank strip where the
// season road sits and the ranked queue in the hero. Iron to Radiant comes from
// src/engine/club/rating.js; the queue from src/lib/rankedClient.js.
import { RANKS } from '../../engine/club/rating';
import { signInHref } from '../../lib/account';
import { t } from '../../lib/i18n';
import club from '../../pages/Club.module.css';
import styles from './OnlineHub.module.css';

/** Season or Online, as the hub's two faces. */
export function ModeSwitch({ mode, onMode }) {
  return (
    <div className={styles.modes} role="group" aria-label={t('Mode')}>
      {[['season', t('Season')], ['online', t('Online')]].map(([key, label]) => (
        <button key={key} type="button" data-on={mode === key || undefined} aria-pressed={mode === key} onClick={() => onMode(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Nine bars, one per rank, lit up to yours.
function RankBars({ index }) {
  return (
    <span className={styles.rankBars} role="img" aria-label={t('{rank}, rank {n} of {total}', { rank: RANKS[index] ?? 'Iron', n: index + 1, total: RANKS.length })}>
      {RANKS.map((name, i) => <i key={name} data-on={i <= index || undefined} />)}
    </span>
  );
}

const SEGMENTS = 10;

/**
 * Where the season road sits, as one plate: rank, rating, the ten-step track to
 * the next rank, the last five results, First Win. Each cell holds a mono label
 * over one value; hairlines split the cells.
 */
export function RankStrip({ rating, delta, off }) {
  const rank = rating?.rank;
  const progress = rank ? rank.progress : 0;
  const form = (rating?.form ?? '').padStart(5, '-').split('');
  return (
    <section className={styles.strip} aria-label={t('Rank')} data-off={off || undefined} inert={off}>
      <div className={styles.cell}>
        <span className={styles.label}>{t('Rank')}</span>
        <b className={styles.rankName}>{rank ? rank.name : t('Unranked')}</b>
      </div>
      <div className={styles.cell}>
        <span className={styles.label}>{t('Rating')}</span>
        <span className={styles.ratingValue}>
          <b>{rating ? rating.rating : '–'}</b>
          {delta ? <em data-sign={Math.sign(delta)}>{delta > 0 ? `+${delta}` : delta}</em> : null}
        </span>
      </div>
      <div className={`${styles.cell} ${styles.track}`}>
        <span className={styles.trackEnds}>
          <span className={styles.label}>{rank ? rank.name : RANKS[0]}</span>
          {rank?.next && <span className={styles.label}>{t('{n} to {rank}', { n: rank.toNext, rank: rank.next })}</span>}
        </span>
        <span className={styles.segments} role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={progress} aria-label={rank?.next ? t('{n} to {rank}', { n: rank.toNext, rank: rank.next }) : (rank?.name ?? t('Unranked'))}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <i key={i}><b style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress * SEGMENTS - i))})` }} /></i>
          ))}
        </span>
      </div>
      <div className={styles.cell}>
        <span className={styles.label}>{t('Form')}</span>
        <span className={styles.form} role="img" aria-label={rating?.form ? rating.form.split('').map(r => (r === 'W' ? t('Won') : t('Lost'))).join(', ') : t('No games yet')}>
          {form.map((result, index) => (
            <i key={index} data-result={result === '-' ? undefined : result}>{result === '-' ? '' : result}</i>
          ))}
        </span>
      </div>
      <div className={`${styles.cell} ${styles.firstWin}`} data-ready={rating?.firstWinReady || undefined}>
        <span className={styles.label}>{t('First win')}</span>
        <b>{!rating ? '–' : rating.firstWinReady ? t('+1 pack') : t('Claimed')}</b>
      </div>
    </section>
  );
}

/** The hero: your five against whoever the queue finds, behind the same big red button. */
export function OnlineHero({ account, rating, power, queue, now, joining = false, onFind, onCancel, onFriendly }) {
  const signedOut = account?.status === 'signedOut';
  const waited = queue ? Math.max(0, Math.floor((now - queue.since) / 1000)) : 0;
  return (
    <section className={styles.hero} aria-label={t('Ranked')}>
      <header className={styles.heroHead}>
        <span className={styles.label}>{t('Ranked')}</span>
        <span className={styles.label}>{t('Best of {n}', { n: 3 })}</span>
      </header>
      <div className={styles.heroRank}>
        <b>{rating ? rating.rank.name : t('Unranked')}</b>
        {rating && <RankBars index={rating.rank.index} />}
      </div>
      <dl className={styles.heroFacts}>
        <div><dd>{power}</dd><dt>{t('Power')}</dt></div>
        <div><dd>{rating ? `${rating.wins}–${rating.games - rating.wins}` : '–'}</dd><dt>{t('Record')}</dt></div>
      </dl>
      {queue && (
        <p className={styles.searching} role="status">
          <span>{t('Searching')}</span>
          <b>{`${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, '0')}`}</b>
        </p>
      )}
      <div className={styles.heroActions}>
        <button type="button" className={`${club.primary} ${styles.friend}`} onClick={onFriendly}>{t('Play a friend')}</button>
        {signedOut ? (
          <a className={`${club.primary} ${club.playBig} ${styles.signIn}`} href={signInHref('/club')}>{t('Sign in with Discord')}</a>
        ) : queue ? (
          <button type="button" className={`${club.primary} ${club.playBig}`} onClick={onCancel}>{t('Cancel')}</button>
        ) : (
          <button type="button" className={`${club.primary} ${club.playBig}`} disabled={account?.status !== 'signedIn'} aria-busy={joining} onClick={onFind}>{t('Find match')}</button>
        )}
      </div>
    </section>
  );
}
