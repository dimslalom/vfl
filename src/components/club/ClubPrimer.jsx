import { useCallback, useEffect, useState } from 'react';
import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { TIER_META } from '../../engine/endless/ladder';
import { t } from '../../lib/i18n';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { DEFAULT_MAP, SHOWCASE } from './clubSummary';

const STEPS = [
  {
    kicker: () => t('Roster formation'),
    title: () => t('The starting five'),
    body: () => t('Open five draft packs to sign your core roster. Your leftmost starter commands the team as IGL.'),
    metrics: () => [
      { label: t('Roster'), val: t('5 starters, 1 IGL') },
      { label: t('Contracts'), val: t('3-year initial deal') },
      { label: t('Training'), val: t('Earn tapes from wins') },
    ],
    piece: () => (
      <div className={styles.primerSquad}>
        <div className={styles.primerCardRow}>
          {SHOWCASE.slice(0, 3).map((card, idx) => (
            <div key={card.id} className={styles.primerCardWrap}>
              {idx === 0 && <span className={styles.primerIglBadge}>IGL</span>}
              <PlayerCard card={card} displayScale={0.27} tilt canDrag={false} />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    kicker: () => t('Match tactics'),
    title: () => t('Three-lane combat'),
    body: () => t('Deploy your five players across A, Mid and B lanes. Outsmart the rival with your IGL rotation.'),
    metrics: () => [
      { label: t('Combat'), val: t('3 tactical map lanes') },
      { label: t('Counter'), val: t('IGL repositioning') },
      { label: t('Tactics'), val: t('Equip up to 7 chips') },
    ],
    piece: () => (
      <div className={styles.primerBoard}>
        <div className={styles.primerLanes}>
          <div className={styles.primerLane}>
            <span className={styles.primerLaneTag}>A Site</span>
            <small>Aim</small>
            <div className={styles.primerSplitBar}>
              <span style={{ width: '65%' }} />
            </div>
          </div>
          <div className={styles.primerLane} data-mid>
            <span className={styles.primerLaneTag}>Mid</span>
            <small>Strategy</small>
            <div className={styles.primerSplitBar}>
              <span style={{ width: '45%' }} />
            </div>
          </div>
          <div className={styles.primerLane}>
            <span className={styles.primerLaneTag}>B Site</span>
            <small>Movement</small>
            <div className={styles.primerSplitBar}>
              <span style={{ width: '55%' }} />
            </div>
          </div>
        </div>
        <div className={styles.primerRotateCallout}>
          <span className={styles.primerRotatePip} aria-hidden="true" />
          <span>{t('IGL Rotate: reposition one player after rival reveal')}</span>
        </div>
      </div>
    ),
  },
  {
    kicker: () => t('Season climb'),
    title: () => t('Championship ladder'),
    body: () => t('Win best-of-3 series to climb the league. Top four reach the playoffs, and finalists earn promotion.'),
    metrics: () => [
      { label: t('Playoffs'), val: t('Top 4 qualify') },
      { label: t('Promotion'), val: t('Top 2 advance') },
      { label: t('Danger'), val: t('Bottom 2 face drop') },
    ],
    piece: () => (
      <div className={styles.primerLadderWrap}>
        <ol className={styles.primerLadder}>
          {[...TIER_META].reverse().map((tier, index) => (
            <li key={tier.key} data-here={index === 2 || undefined}>
              <span className={styles.tierName}>{t(tier.label)}</span>
              {index === 2 && <span className={styles.tierBadge}>{t('You start here')}</span>}
              {index < 2 && <span className={styles.tierZone}>{t('Promotion')}</span>}
              {index === 4 && <span className={styles.tierDanger}>{t('Relegation')}</span>}
            </li>
          ))}
        </ol>
      </div>
    ),
  },
];

export default function ClubPrimer({ onDone, onSkip, doneLabel }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const goNext = useCallback(() => {
    if (last) onDone();
    else setIndex(i => i + 1);
  }, [last, onDone]);

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onSkip]);

  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <div className={club.titleBlock}>
            <b>{t('How Clubs works')}</b>
            <span className={club.tagRow}>
              <span className={club.tag}>{t('Step {n} / {total}', { n: index + 1, total: STEPS.length })}</span>
            </span>
          </div>
        </div>
        <div className={club.chips}>
          <button type="button" className={club.small} onClick={onSkip}>{t('Skip')}</button>
        </div>
      </header>

      <main className={club.ground} style={{ '--map': `url(${assetPath(DEFAULT_MAP)})` }}>
        <section key={index} className={styles.step} aria-live="polite">
          <div className={styles.stepKicker}>{step.kicker()}</div>
          <h2 className={styles.stepTitle}>{step.title()}</h2>
          <p className={styles.stepLead}>{step.body()}</p>

          <div className={styles.piece} aria-hidden="true">
            {step.piece()}
          </div>

          <div className={styles.primerTelemetry}>
            {step.metrics().map(metric => (
              <div key={metric.label} className={styles.telemetryCard}>
                <span className={styles.telemetryLabel}>{metric.label}</span>
                <b className={styles.telemetryVal}>{metric.val}</b>
              </div>
            ))}
          </div>

          <div className={styles.pips} role="img" aria-label={t('Step {n} / {total}', { n: index + 1, total: STEPS.length })}>
            {STEPS.map((item, i) => <i key={i} data-on={i <= index || undefined} />)}
          </div>
        </section>
      </main>

      <footer className={styles.stepAct}>
        <button
          type="button"
          className={club.ghost}
          disabled={index === 0}
          onClick={goPrev}
        >
          {t('Back')}
        </button>
        <button
          type="button"
          className={club.primary}
          autoFocus
          onClick={goNext}
        >
          {last ? (doneLabel ?? t('Create your club')) : t('Next')}
        </button>
      </footer>
    </div>
  );
}
