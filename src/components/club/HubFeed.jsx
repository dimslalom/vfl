import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { clubById, clubPower, clubRoster, findCard, nextMatch, standings } from '../../engine/club/season';
import { t } from '../../lib/i18n';
import ClubLogo from '../ClubLogo';
import styles from './HubFeed.module.css';

const ordinalPos = pos => t('{pos} of 6', { pos });

// A player's face, or a flat head-and-shoulders shape when there's no photo yet.
function Face({ card }) {
  return (
    <span className={styles.face}>
      {card.photo && !card.photo.includes('placeholder')
        ? <img src={assetPath(card.photo)} alt="" loading="lazy" />
        : <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7" /><path d="M6 40c1-9 6-14 14-14s13 5 14 14z" /></svg>}
    </span>
  );
}

// A rival's crest; a club with no logo file gets a mark drawn from its name, never an empty box.
function Crest({ club, size }) {
  if (club?.logo) return <img className={styles.crest} src={assetPath(club.logo)} alt="" style={{ width: size, height: size }} />;
  return club ? <ClubLogo name={club.name} size={size} /> : <span className={styles.crest} style={{ width: size, height: size }} />;
}

const Mine = ({ state, size }) => <ClubLogo name={state.name} style={state.crest} tone={state.tone} size={size} />;

/**
 * The next match as the hub's hero: who, the two powers and the bar between them,
 * their best three as real cards (strongest in the middle, a size up), their record,
 * then whatever action the hub passes in (Play). `cardScale` 0 drops the cards for
 * a row of faces, for phones and short screens.
 */
export function Scout({ state, cards, cardScale, children }) {
  const match = nextMatch(state);
  const rival = match && clubById(state, match.id);
  if (!rival) return <section className={styles.scout}>{children}</section>;
  const mine = Math.round(clubPower(state, 'you', cards));
  const theirs = Math.round(clubPower(state, rival.id, cards));
  const record = state.table?.[rival.id] ?? { w: 0, l: 0, rd: 0 };
  const pos = state.results.length > 0 ? standings(state, cards).find(row => row.id === rival.id)?.pos : null;
  const best = clubRoster(state, rival, cards).filter(Boolean).sort((a, b) => b.rating - a.rating).slice(0, 3);
  const shown = best.length === 3 ? [best[1], best[0], best[2]] : best;
  const compact = !cardScale;
  return (
    <section className={styles.scout} data-compact={compact || undefined} aria-label={t('Next match')}>
      <header className={styles.rival}>
        <span className={styles.rivalMeta}><span>{match.stage}</span><span>{t('Best of {n}', { n: match.bestOf })}</span></span>
        <b>{rival.name}</b>
        <Crest club={rival} size={compact ? 32 : 44} />
      </header>
      <div className={styles.powers} role="img" aria-label={t('Squad power: you {you}, them {them}', { you: mine, them: theirs })}>
        <span className={styles.power}><Mine state={state} size={compact ? 24 : 28} /><b>{mine}</b></span>
        <span className={styles.split}><i style={{ flexGrow: mine }} /><i data-them style={{ flexGrow: theirs }} /></span>
        <span className={styles.power} data-them><b>{theirs}</b></span>
      </div>
      {compact ? (
        <ul className={styles.facesRow} aria-label={t('Their best')}>
          {best.map(card => <li key={card.id}><Face card={card} /><b>{card.rating}</b></li>)}
        </ul>
      ) : (
        <>
          <div className={styles.cards} aria-label={t('Their best')}>
            {shown.map(card => (
              <span key={card.id} data-top={card.id === best[0].id || undefined}>
                <PlayerCard card={card} displayScale={card.id === best[0].id ? cardScale * 1.12 : cardScale} tilt={false} canDrag={false} />
              </span>
            ))}
          </div>
          <dl className={styles.facts}>
            <div><dd>{record.w}–{record.l}</dd><dt>{t('Record')}</dt></div>
            <div><dd>{record.rd > 0 ? `+${record.rd}` : record.rd}</dd><dt>{t('Rounds')}</dt></div>
            <div><dd>{pos ? ordinalPos(pos) : '–'}</dd><dt>{t('Table')}</dt></div>
          </dl>
        </>
      )}
      {children}
    </section>
  );
}

/**
 * League news as one line: the latest move (rating, face, name, crest to crest),
 * then the moves before it as faces, underlined by which way they went.
 */
export function LatestMove({ state, cards }) {
  const rows = (state.news ?? []).slice(0, 5).map(entry => {
    // 'out' was signed from a rival into your club; 'in' left your club for a rival.
    const joined = entry.kind === 'out';
    return { entry, card: findCard(state, cards, entry.id), other: clubById(state, entry.club), joined };
  }).filter(row => row.card);
  if (rows.length === 0) return null;
  const [top, ...rest] = rows;
  const crest = side => ((top.joined ? side === 'to' : side === 'from') ? <Mine state={state} size={24} /> : <Crest club={top.other} size={24} />);
  const to = top.joined ? state.name : top.other?.name ?? '';
  return (
    <section className={styles.news} aria-label={t('League news')}>
      <div className={styles.move} data-joined={top.joined || undefined}>
        <Face card={top.card} />
        <b className={styles.moveRating}>{top.card.rating}</b>
        <b className={styles.moveName}>{top.card.player}</b>
        <span className={styles.route} role="img" aria-label={t('to {club}', { club: to })}>
          {crest('from')}
          <svg viewBox="0 0 24 12" width="20" height="10" aria-hidden="true"><path d="M0 6h20M15 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          {crest('to')}
        </span>
      </div>
      {rest.length > 0 && (
        <ul className={styles.moreMoves}>
          {rest.map(({ entry, card, other, joined }) => (
            <li key={`${entry.id}-${entry.year}-${entry.kind}`} data-joined={joined || undefined} title={`${card.player}, ${t('to {club}', { club: joined ? state.name : other?.name ?? '' })}`}>
              <Face card={card} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
