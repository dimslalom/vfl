import { useState } from 'react';
import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { TIER_META } from '../../engine/endless/ladder';
import { t } from '../../lib/i18n';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { DEFAULT_MAP, SHOWCASE } from './clubSummary';

// Each step teaches with a real piece of the game, not an illustration.
const STEPS = [
  {
    title: () => t('Draft your five'),
    body: () => t('Open five packs and keep one player from each. Every signing starts on a three-year contract.'),
    piece: () => (
      <span className={styles.cardRow}>
        {SHOWCASE.slice(0, 3).map(card => <PlayerCard key={card.id} card={card} displayScale={0.26} tilt={false} canDrag={false} />)}
      </span>
    ),
  },
  {
    title: () => t('Play the week'),
    body: () => t('Each week is a best-of-3 against one of five rivals. Between matches you train a player, open packs and set your lineup.'),
    piece: () => (
      <ol className={styles.weeks}>
        {[1, 2, 3, 4, 5].map(week => (
          <li key={week} data-won={week < 3 || undefined} data-now={week === 3 || undefined}>
            <small>{t('Wk')}</small><b>{week}</b>
          </li>
        ))}
        <li><small>{t('Top 4')}</small><b>{t('PO')}</b></li>
      </ol>
    ),
  },
  {
    title: () => t('Climb, or get sacked'),
    body: () => t('Reach the final to move up a tier. Finish last and you drop. Finish last twice in Challengers and the board sacks you.'),
    piece: () => (
      <ol className={styles.ladder}>
        {[...TIER_META].reverse().map((tier, index) => (
          <li key={tier.key} data-here={index === 2 || undefined}>
            {t(tier.label)}{index === 2 && <small>{t('You start here')}</small>}
          </li>
        ))}
      </ol>
    ),
  },
];

// The three-step primer before the founding draft. Skippable on every step; the
// last step's button says where it leads.
export default function ClubPrimer({ onDone, onSkip, doneLabel }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <div className={club.titleBlock}>
            <b>{t('How Clubs works')}</b>
            <span className={club.tagRow}><span className={club.tag}>{t('Step {n} / {total}', { n: index + 1, total: STEPS.length })}</span></span>
          </div>
        </div>
        <div className={club.chips}>
          <button type="button" className={club.small} onClick={onSkip}>{t('Skip')}</button>
        </div>
      </header>

      <main className={club.ground} style={{ '--map': `url(${assetPath(DEFAULT_MAP)})` }}>
        {/* Keyed so each step lands with the club's settle, like any club screen. */}
        <section key={index} className={styles.step} aria-live="polite">
          <div className={styles.piece} aria-hidden="true">{step.piece()}</div>
          <h2>{step.title()}</h2>
          <p>{step.body()}</p>
          <span className={styles.pips} role="img" aria-label={t('Step {n} / {total}', { n: index + 1, total: STEPS.length })}>
            {STEPS.map((item, i) => <i key={i} data-on={i <= index || undefined} />)}
          </span>
        </section>
      </main>

      <footer className={styles.stepAct}>
        <button type="button" className={club.ghost} disabled={index === 0} onClick={() => setIndex(index - 1)}>{t('Back')}</button>
        <button type="button" className={club.primary} autoFocus onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? (doneLabel ?? t('Found your club')) : t('Next')}
        </button>
      </footer>
    </div>
  );
}
