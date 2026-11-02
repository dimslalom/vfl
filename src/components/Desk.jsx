import { useState } from 'react';
import { IconArrowRight } from '@tabler/icons-react';
import { MapPatchTable } from './SeriesCardTable';
import OverviewRow from './OverviewRow';
import {
  ChemPanel, CircuitPanel, NewsFeed, PoachOffer, ProspectOffer, SeasonStrip, SquadReport, TransferMarket,
} from './DeskPanels';
import { t } from '../lib/i18n';
import { tabCounts } from '../lib/deskMoves';
import styles from './Desk.module.css';
import runStyles from '../pages/PerfectRun.module.css';

const TABS = [
  { key: 'squad', label: 'Squad' },
  { key: 'market', label: 'Market' },
  { key: 'world', label: 'World' },
];

function moveLabel(move) {
  switch (move.key) {
    case 'short':
      return move.missing === 1 ? t('Sign 1 more player to play') : t('Sign {n} more players to play', { n: move.missing });
    case 'pack':
      return move.packs === 1 ? t('Open your banked pack') : t('Open a pack: {n} banked', { n: move.packs });
    case 'signing':
      return t('Sign {player} for {n} packs', { player: move.card.player, n: move.cost });
    case 'maps':
      return move.count === 1 ? t('1 map rule changed') : t('{n} map rules changed', { n: move.count });
    default:
      return '';
  }
}

// One task at a time: what wants an answer first, then three numbers, then the
// reference material behind tabs. Tab choice is view state and is not saved.
export default function Desk({
  title, endless, moves, overview, warning,
  poach, prospect, onOpenPack, onSign,
  power, yearReport, squad, mapChanges, feed, cardsById, market, circuit, strip, onInspect,
}) {
  const [tab, setTab] = useState('squad');
  const counts = tabCounts(moves);
  const actions = moves.filter(move => !['poach', 'prospect'].includes(move.key));
  const hasOffers = Boolean(poach || prospect);

  function act(move) {
    if (move.key === 'pack') { onOpenPack(); return; }
    if (move.key === 'signing') { setTab('market'); onSign(move.card); return; }
    setTab(move.tab);
  }

  return (
    <section className={[runStyles.between, runStyles.desk].join(' ')}>
      <h2 className={runStyles.deskTitle}>{title}</h2>

      {(hasOffers || actions.length > 0) && (
        <div className={styles.moves}>
          <h3 className={styles.movesHead}>{t('Your next move')}</h3>
          {poach && <PoachOffer {...poach} onInspect={onInspect} />}
          {prospect && <ProspectOffer {...prospect} onInspect={onInspect} />}
          {actions.length > 0 && (
            <ul className={styles.moveList}>
              {actions.map(move => (
                <li key={move.key}>
                  <button type="button" className={styles.move} onClick={() => act(move)}>
                    <span>{moveLabel(move)}</span>
                    <IconArrowRight size={16} stroke={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <OverviewRow items={overview} label={t('Squad overview')} />

      {warning && <p className={runStyles.deskWarning}>{warning}</p>}

      {!endless ? (
        <div className={styles.panel}>
          {power && <ChemPanel power={power} />}
          <SeasonStrip {...strip} />
        </div>
      ) : (
        <>
          <div className={styles.tabs} role="tablist" aria-label={t('Desk sections')}>
            {TABS.map(item => (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`desk-tab-${item.key}`}
                aria-selected={tab === item.key}
                aria-controls="desk-panel"
                className={styles.tab}
                onClick={() => setTab(item.key)}
              >
                {t(item.label)}
                {counts[item.key] > 0 && (
                  <span
                    className={styles.badge}
                    aria-label={t('{n} waiting', { n: counts[item.key] })}
                  >
                    {counts[item.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div id="desk-panel" role="tabpanel" aria-labelledby={`desk-tab-${tab}`} className={styles.panel}>
            {tab === 'squad' && (
              <>
                {power
                  ? <ChemPanel power={power} />
                  : <p className={runStyles.marketEmpty}>{t('Your squad needs five players before it has a team power.')}</p>}
                <SquadReport report={yearReport} squad={squad} />
              </>
            )}
            {tab === 'market' && <TransferMarket {...market} onInspect={onInspect} />}
            {tab === 'world' && (
              <>
                <CircuitPanel {...circuit} />
                {mapChanges.length > 0 && <MapPatchTable cards={mapChanges} />}
                <NewsFeed feed={feed} cardsById={cardsById} />
                <SeasonStrip {...strip} />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
