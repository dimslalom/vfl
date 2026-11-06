import { useMemo, useState } from 'react';
import PlayerCard from '../../shared/src/components/PlayerCard';
import allCards from '../../shared/src/data/cards.json';
import ClubLogo from '../components/ClubLogo';
import { t } from '../lib/i18n';
import styles from './LeaderboardLab.module.css';

const SPOTLIGHT_SCALE = 0.38;

const SAMPLE_ENTRIES = [
  { pos: 1, name: 'Sentinels', style: 'shield', tone: 'crimson', power: 88, w: 5, l: 0, score: 1540, starId: 'tl-purp0-gold-001' },
  { pos: 2, name: 'Paper Rex', style: 'slash', tone: 'violet', power: 87, w: 5, l: 0, score: 1510, starId: 'kc-sheydos-gold-001' },
  { pos: 3, name: 'Fnatic', style: 'laurel', tone: 'sunset', power: 86, w: 4, l: 1, score: 1470, starId: 'navi-shao-gold-001' },
  { pos: 4, name: 'Team Liquid', style: 'roundel', tone: 'cyan', power: 85, w: 4, l: 1, score: 1430, starId: 'tl-nats-gold-001' },
  { pos: 5, name: 'Team Vitality', style: 'hex', tone: 'gold', power: 84, w: 4, l: 1, score: 1390, starId: 'vit-chronicle-gold-001' },
  { pos: 6, name: 'FUT Esports', style: 'block', tone: 'teal', power: 83, w: 3, l: 2, score: 1340, starId: 'pcf-cned-gold-001' },
  { pos: 7, name: 'KRU Esports', style: 'stack', tone: 'crimson', power: 82, w: 3, l: 2, score: 1290, starId: 'kr-mwzera-gold-001' },
  { pos: 8, name: 'Night Shift', style: 'sigil', tone: 'teal', power: 81, w: 3, l: 2, score: 1250, starId: 'fa-nzr-gold-001', you: true },
];

function SelectionCorners() {
  return (
    <span className={styles.brackets} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function LedgerRow({ label, value }) {
  return (
    <div className={styles.ledgerRow}>
      <span className={styles.ledgerLabel}>{label}</span>
      <b className={styles.ledgerValue}>{value}</b>
    </div>
  );
}

export default function LeaderboardLab() {
  const [tab, setTab] = useState('daily');
  const [viewState, setViewState] = useState('loaded');
  const [selectedPos, setSelectedPos] = useState(1);

  const cardMap = useMemo(() => new Map(allCards.map(c => [c.id, c])), []);

  const selectedEntry = useMemo(
    () => SAMPLE_ENTRIES.find(e => e.pos === selectedPos) ?? SAMPLE_ENTRIES[0],
    [selectedPos],
  );

  const starCard = useMemo(
    () => cardMap.get(selectedEntry.starId) ?? allCards[0],
    [cardMap, selectedEntry.starId],
  );

  return (
    <div className={styles.stage}>
      <header className={styles.hud}>
        <div className={styles.navLeft}>
          <span className={styles.crumb}>{t('Global standings')}</span>
          <span className={styles.divider} aria-hidden="true" />
          <nav className={styles.tabs} aria-label={t('Global standings')}>
            <button
              type="button"
              className={styles.tabButton}
              data-on={tab === 'daily' || undefined}
              aria-pressed={tab === 'daily'}
              onClick={() => setTab('daily')}
            >
              {t('Daily')}
            </button>
            <button
              type="button"
              className={styles.tabButton}
              data-on={tab === 'overall' || undefined}
              aria-pressed={tab === 'overall'}
              onClick={() => setTab('overall')}
            >
              {t('All time')}
            </button>
          </nav>
        </div>
        <div className={styles.hudRight}>
          <div className={styles.stateSwitcher} role="group" aria-label="Preview states">
            {['loaded', 'loading', 'empty', 'error'].map(mode => (
              <button
                key={mode}
                type="button"
                className={styles.stateBtn}
                data-on={viewState === mode || undefined}
                aria-pressed={viewState === mode}
                onClick={() => setViewState(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className={styles.ground}>
        <aside className={styles.inspector} aria-label={selectedEntry.name}>
          <div className={styles.inspectorTop}>
            <span className={styles.inspectorTag}>
              {selectedEntry.you ? `${t('Rank')} #${selectedEntry.pos} (${t('You')})` : `${t('Rank')} #${selectedEntry.pos}`}
            </span>
            <h2 className={styles.inspectorName}>{selectedEntry.name}</h2>
            <div className={styles.inspectorSpotlight}>
              <PlayerCard card={starCard} displayScale={SPOTLIGHT_SCALE} tilt={false} canDrag={false} />
            </div>
            <div className={styles.ledger}>
              <LedgerRow label={t('Score')} value={selectedEntry.score} />
              <LedgerRow label={t('Record')} value={`${selectedEntry.w}-${selectedEntry.l}`} />
              <LedgerRow label={t('Roster power')} value={`${selectedEntry.power} OVR`} />
              <LedgerRow label={t('Star player')} value={starCard.player} />
            </div>
          </div>
          <div className={styles.inspectorBottom}>
            <button
              type="button"
              className={styles.actionPrimary}
              onClick={() => {}}
            >
              {selectedEntry.you ? t('Play daily') : t('Challenge club')}
            </button>
          </div>
        </aside>

        <section className={styles.main}>
          {viewState === 'loading' && (
            <div className={styles.skeletonList}>
              {[1, 2, 3, 4, 5, 6].map(key => (
                <div key={key} className={styles.skeletonRow}>
                  <div className={styles.skeletonBar} style={{ width: 24 }} />
                  <div className={styles.skeletonBar} style={{ width: 32, height: 32 }} />
                  <div className={styles.skeletonBar} style={{ width: '40%' }} />
                  <div className={styles.skeletonBar} style={{ width: 48 }} />
                  <div className={styles.skeletonBar} style={{ width: 40 }} />
                  <div className={styles.skeletonBar} style={{ width: 56 }} />
                </div>
              ))}
            </div>
          )}

          {viewState === 'empty' && (
            <div className={styles.noticeBox}>
              <h3 className={styles.noticeHead}>{t('No scores recorded')}</h3>
              <p className={styles.noticeText}>{t('Play a match to post your score')}</p>
            </div>
          )}

          {viewState === 'error' && (
            <div className={styles.noticeBox}>
              <h3 className={styles.noticeHead}>{t('Leaderboard unavailable')}</h3>
              <button
                type="button"
                className={styles.actionSecondary}
                onClick={() => setViewState('loaded')}
              >
                {t('Retry connection')}
              </button>
            </div>
          )}

          {viewState === 'loaded' && (
            <ol className={styles.table}>
              <li className={styles.tableHead} aria-hidden="true">
                <span>{t('Rank')}</span>
                <span />
                <span>{t('Club')}</span>
                <span>{t('Power')}</span>
                <span>{t('Record')}</span>
                <span style={{ textAlign: 'right' }}>{t('Score')}</span>
              </li>
              {SAMPLE_ENTRIES.map(row => {
                const isSelected = row.pos === selectedPos;
                return (
                  <li
                    key={row.pos}
                    className={styles.tableRow}
                    data-you={row.you || undefined}
                    data-top={row.pos === 1 ? '1' : undefined}
                    data-cut={row.pos === 4 ? t('Top 10') : undefined}
                    onClick={() => setSelectedPos(row.pos)}
                  >
                    {isSelected && <SelectionCorners />}
                    <b className={styles.pos}>{row.pos}</b>
                    <span className={styles.crestDisc}>
                      <ClubLogo name={row.name} style={row.style} tone={row.tone} size={28} />
                    </span>
                    <div className={styles.clubInfo}>
                      <b className={styles.clubName}>{row.name}</b>
                      {row.you && <span className={styles.youBadge}>{t('You')}</span>}
                    </div>
                    <span className={styles.power}>{row.power}</span>
                    <b className={styles.record}>{row.w}-{row.l}</b>
                    <b className={styles.score}>{row.score}</b>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
