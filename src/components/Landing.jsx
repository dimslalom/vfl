import { useEffect, useState } from 'react';
import PlayerCard from '../../shared/src/components/PlayerCard';
import Split from '../../shared/src/components/Split';
import { Link } from 'react-router-dom';
import { assetPath } from '../../shared/src/lib/utils';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import { t } from '../lib/i18n';
import { getClientId } from '../lib/leaderboardClient';
import LanguagePicker from './LanguagePicker';
import Sheet from './Sheet';
import styles from '../pages/PerfectRun.module.css';
import hub from '../styles/hub.module.css';

// The first screen: one sentence, one dominant action, and a line on what each
// other mode is for. Records and the Hall appear only once they hold something,
// so a first visit is never a page of zeroes.
export default function Landing({
  fanCards, savedRun, challenge, dailyPlayed, records, hall,
  panelOpen, boardTab, boardData, todayBest,
  onClub, onResume, onStart, onChallenge, onDaily, onNations, onMultiplayer,
  onOpenBoard, onCloseBoard, onRetryBoard,
}) {
  const [hallOpen, setHallOpen] = useState(false);
  return (
    <div className={styles.landing}>
      {/* Atmosphere only. The fan sits behind the menu at full size and
          never takes a pointer, so the centre column reads first. */}
      <div className={styles.landingFan} aria-hidden="true">
        {fanCards.map(card => (
          <div key={card.id} className={styles.fanCard}>
            <PlayerCard card={card} displayScale={0.62} portraitLoading="eager" portraitFetchPriority="high" />
          </div>
        ))}
      </div>

      <div className={styles.landingInner}>
        <img
          className={`${hub.logotype} ${styles.landingLogo} ${styles.rise}`}
          src={assetPath('/assets/brand/gauntlet-logotype.webp')}
          alt="Gauntlet"
        />
        <p className={`${styles.landingTag} ${styles.rise} ${styles.riseB}`}>
          {t('Draft five VCT pros and keep them winning year after year.')}
        </p>

        <div className={`${styles.landingPlayGroup} ${styles.rise} ${styles.riseB}`}>
          {challenge ? (
            <>
              <button className={styles.landingPlay} onClick={onChallenge}>
                <b>{t('Beat {score}', { score: challenge.score.toLocaleString() })}</b>
                <span className={styles.landingPlayMeta}>
                  {challenge.by ? t('{name} challenged you', { name: challenge.by }) : t('You were challenged')}
                </span>
              </button>
              <button className={styles.landingRestart} onClick={savedRun ? onResume : onStart}>
                {savedRun ? t('Resume your run instead') : t('Start a normal run')}
              </button>
            </>
          ) : savedRun ? (
            <>
              <button
                className={styles.landingPlay}
                onClick={onResume}
                aria-label={t('Resume run: {name}, year {year}, score {score}', {
                  name: savedRun.squadName, year: savedRun.year, score: savedRun.score.toLocaleString(),
                })}
              >
                <b>{t('Resume run')}</b>
                <span className={styles.landingPlayMeta}>
                  <Split parts={[savedRun.squadName, savedRun.event ?? t('Year {n}', { n: savedRun.year }), savedRun.stage ?? savedRun.score.toLocaleString()]} />
                </span>
              </button>
              <button className={styles.landingRestart} onClick={onStart}>
                {t('Start a new run')}
              </button>
            </>
          ) : (
            <button className={styles.landingPlay} onClick={onStart} aria-label={t('Start a run')}>
              <b>{t('Start a run')}</b>
              <span className={styles.landingPlayMeta}>{t('No login needed')}</span>
            </button>
          )}
        </div>

        <nav className={`${styles.landingLinks} ${styles.rise} ${styles.riseC}`} aria-label={t('Other modes')}>
          <button onClick={onClub}>
            <b>{t('Club')}</b>
            <span>{t('Run a club across seasons: sign, train, play the league.')}</span>
          </button>
          {dailyPlayed ? (
            <button onClick={() => onOpenBoard('today')}>
              <b>{t('Daily')}<i>{t('played')}</i></b>
              <span>{t('Done for today. See how you placed.')}</span>
            </button>
          ) : (
            <button onClick={onDaily}>
              <b>{t('Daily')}</b>
              <span>{t('Everyone gets the same draw. One year, one attempt.')}</span>
            </button>
          )}
          <button className={styles.landingLinkEnc} onClick={onNations}>
            <b>{t('Nations Cup')}</b>
            <span>{t('Pick a country and win one knockout bracket.')}</span>
          </button>
          <button onClick={onMultiplayer}>
            <b>{t('Multiplayer')}</b>
            <span>{t('Draft against friends in a private lobby.')}</span>
          </button>
        </nav>

        {/* A first run shows nothing here at all - an empty page of zeroes
            is the worst thing a landing screen can lead with. */}
        {records.length > 0 && (
          <div className={`${styles.landingRecords} ${styles.rise} ${styles.riseC}`}>
            {records.map(record => (
              <span key={record.label}>
                {record.label} <b><CountUp value={record.value} /></b>
              </span>
            ))}
          </div>
        )}

        <div className={`${styles.landingBoardRow} ${styles.rise} ${styles.riseC}`}>
          <button
            className={styles.landingBoardToggle}
            onClick={() => (panelOpen ? onCloseBoard() : onOpenBoard('today'))}
          >
            {panelOpen ? t('Hide leaderboard') : t('Leaderboard')}
          </button>
          {hall.length > 0 && (
            <button className={styles.landingBoardToggle} onClick={() => setHallOpen(true)}>
              {t('Hall of Fame')}
            </button>
          )}
        </div>

        {panelOpen && (
          <LeaderboardPanel
            tab={boardTab}
            onTab={onOpenBoard}
            onRetry={onRetryBoard}
            data={boardData}
            todayBest={todayBest}
          />
        )}

        <div className={styles.landingFoot}>
          <LanguagePicker />
          <p className={styles.landingDisclaimer}>
            {t('Ratings are approximations tuned for game balance, not official VCT statistics.')}
            {' '}
            <Link to="/legal">{t('Legal')}</Link>
          </p>
        </div>
      </div>

      <Sheet open={hallOpen} onClose={() => setHallOpen(false)} title={t('Hall of Fame')}>
        <HallList hall={hall} />
      </Sheet>
    </div>
  );
}

function HallList({ hall }) {
  return (
    <ol className={styles.hallList}>
      {hall.map((run, index) => (
        <li key={`${run.at}-${index}`} className={styles.hallRow}>
          <span className={styles.boardRank}>{index + 1}</span>
          <span className={styles.hallName}>
            <b>{run.squadName}</b>
            <small>{run.players.join(', ')}</small>
          </span>
          <span className={styles.hallFacts}>
            <Split parts={[
              run.titles === 1 ? t('1 title') : t('{n} titles', { n: run.titles }),
              run.years === 1 ? t('1 year') : t('{n} years', { n: run.years }),
              run.tierLabel ? t(run.tierLabel) : null,
            ].filter(Boolean)} />
          </span>
          <span className={styles.boardScore}>{run.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Leaderboard panel (menu): Today / Overall tabs ───────────────────────────

function LeaderboardPanel({ tab, onTab, onRetry, data, todayBest }) {
  const rows = data[tab]; // undefined loading, null offline, [] empty
  const me = getClientId();
  return (
    <div className={styles.boardPanel}>
      <div className={styles.boardTabs}>
        <button
          className={[styles.boardTab, tab === 'today' ? styles.boardTabOn : ''].join(' ')}
          onClick={() => onTab('today')}
        >
          {t('Today')}
        </button>
        <button
          className={[styles.boardTab, tab === 'overall' ? styles.boardTabOn : ''].join(' ')}
          onClick={() => onTab('overall')}
        >
          {t('All time')}
        </button>
        {todayBest != null && <span className={styles.boardMine}>{t('your score {n}', { n: todayBest })}</span>}
      </div>

      {rows === undefined && <p className={styles.boardNote} role="status">{t('Loading…')}</p>}
      {rows === null && (
        <div className={styles.boardNote} role="alert">
          <p>{t('Could not reach the leaderboard. Your own scores are safe on this device.')}</p>
          <button type="button" className={styles.boardRetry} onClick={() => onRetry(tab)}>{t('Try again')}</button>
        </div>
      )}
      {Array.isArray(rows) && rows.length === 0 && (
        <p className={styles.boardNote}>
          {tab === 'today'
            ? t('No scores yet today. Finish the Daily to post the first one.')
            : t('No scores yet. Finish a Daily to get on the board.')}
        </p>
      )}
      {Array.isArray(rows) && rows.length > 0 && (
        <ol className={styles.boardList}>
          {rows.map((r, i) => (
            <li
              key={r.clientId ?? i}
              className={[styles.boardRow, r.clientId === me ? styles.boardMe : ''].join(' ')}
            >
              <span className={styles.boardRank}>{i + 1}</span>
              <span className={styles.boardName}>{r.squadName}</span>
              {tab === 'overall' && r.days != null && (
                <span className={styles.boardDays}>{r.days > 1 ? t('{n} days', { n: r.days }) : t('1 day')}</span>
              )}
              <span className={styles.boardScore}>{tab === 'today' ? r.score : r.best}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Eased count-up for the records strip
function CountUp({ value }) {
  const [n, setN] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!value || reducedMotion) {
      const raf = requestAnimationFrame(() => setN(value ?? 0));
      return () => cancelAnimationFrame(raf);
    }
    let raf;
    const t0 = performance.now();
    const dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reducedMotion]);
  return <>{n}</>;
}
