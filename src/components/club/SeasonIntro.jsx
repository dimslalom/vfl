import { useCallback, useEffect, useRef, useState } from 'react';
import allCards from '../../../shared/src/data/cards.json';
import PlayerCard from '../../../shared/src/components/PlayerCard';
import { playUiSound } from '../../../shared/src/lib/gameAudio';
import { assetPath } from '../../../shared/src/lib/utils';
import { STARTERS, clubById, squadCards } from '../../engine/club/season';
import { TIER_META } from '../../engine/endless/ladder';
import { t } from '../../lib/i18n';
import club from '../../pages/Club.module.css';
import styles from './SeasonIntro.module.css';

// Beats, in ms: the poster lands and holds, then the year's fixtures are drawn
// one week at a time, then everything flies to its place on the hub.
const POSTER = 1500;
const FIRST_DRAW = 350;
const EACH_DRAW = 200;
const LAST_HOLD = 700;
const STILL = 1400;

const initials = name => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();

function weekRival(state, index) {
  const id = state.fixtures[index].find(pair => pair.includes('you')).find(item => item !== 'you');
  return clubById(state, id);
}

/**
 * The start of a year, shown rather than told: a poster (the year as a numeral,
 * the tier, the club, its five), then the fixture draw dropping each week's rival
 * into the season road. The five cards and the road cells share view-transition
 * names with the hub, so leaving morphs each into its place there.
 */
export default function SeasonIntro({ state, map, reducedMotion, onDone }) {
  const starters = squadCards(state, allCards).slice(0, STARTERS);
  const weeks = state.fixtures.length;
  const lastTier = state.history?.at(-1)?.tier;
  const moved = lastTier != null && lastTier !== state.tier;
  const [phase, setPhase] = useState(reducedMotion ? 'draw' : 'in');
  const [drawn, setDrawn] = useState(reducedMotion ? weeks : 0);
  // The timer and a tap can both end it; only the first counts.
  const ended = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });
  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    doneRef.current();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      const done = setTimeout(end, STILL);
      return () => clearTimeout(done);
    }
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const land = requestAnimationFrame(() => setPhase('poster'));
    playUiSound('reveal', 0);
    at(POSTER, () => setPhase('draw'));
    for (let index = 0; index < weeks; index += 1) {
      at(POSTER + FIRST_DRAW + index * EACH_DRAW, () => { setDrawn(index + 1); playUiSound('deal', index); });
    }
    at(POSTER + FIRST_DRAW + weeks * EACH_DRAW + LAST_HOLD, end);
    return () => { cancelAnimationFrame(land); timers.forEach(clearTimeout); };
  }, [reducedMotion, weeks, end]);

  return (
    <div className={club.stage} onClick={end} role="presentation">
      <main className={`${club.ground} ${styles.ground}`} data-phase={phase} style={map ? { '--map': `url(${assetPath(map)})` } : undefined}>
        <div className={styles.poster}>
          <span className={styles.tiers} aria-hidden={!moved || undefined}>
            {moved && <span className={club.tag} data-old>{t(TIER_META[lastTier].label)}</span>}
            <span className={club.tag} data-solid data-new={moved || undefined}>{t(TIER_META[state.tier].label)}</span>
          </span>
          <span className={styles.year}>
            <small>{t('Year')}</small>
            <b>{state.year}</b>
          </span>
          <b className={styles.name}>{state.name}</b>
        </div>

        <div className={styles.five}>
          {starters.map((card, index) => (
            <div key={card.id} className={styles.card} style={{ '--i': index, viewTransitionName: `card-${card.id}` }}>
              <PlayerCard card={card} displayScale={0.3} tilt canDrag={false} />
            </div>
          ))}
        </div>

        {/* The same cells, in the same order, as the hub's season road. */}
        <ol className={`${club.road} ${styles.road}`} aria-label={t('Season calendar')}>
          {Array.from({ length: weeks }, (_, index) => {
            const rival = weekRival(state, index);
            const shown = index < drawn;
            return (
              <li key={index} data-status={index === 0 && drawn >= weeks ? 'now' : undefined} data-drawn={shown || undefined} style={{ viewTransitionName: `road-${index}` }}>
                <span className={club.when}><span className={club.long}>{t('Week {n}', { n: index + 1 })}</span><span className={club.short} aria-hidden="true">W{index + 1}</span></span>
                <span className={`${club.who} ${styles.draw}`}>
                  {shown && (
                    <>
                      <span className={club.crestDisc} style={{ width: 22, height: 22 }} aria-hidden="true">
                        {rival.logo ? <img src={assetPath(rival.logo)} alt="" /> : initials(rival.name)}
                      </span>
                      <b>{rival.name}</b>
                    </>
                  )}
                </span>
              </li>
            );
          })}
          <li style={{ viewTransitionName: 'road-po' }}><span className={club.when}><span className={club.long}>{t('Playoffs')}</span><span className={club.short} aria-hidden="true">PO</span></span><span className={club.who}><b>{t('Top 4')}</b></span></li>
          <li style={{ viewTransitionName: 'road-win' }}><span className={club.when}><span className={club.long}>{t('Window')}</span><span className={club.short} aria-hidden="true">TW</span></span><span className={club.who}><b>{t('Transfers')}</b></span></li>
        </ol>
      </main>
    </div>
  );
}
