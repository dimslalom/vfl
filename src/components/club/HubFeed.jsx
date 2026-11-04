import { useCallback, useEffect, useRef, useState } from 'react';
import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import useReducedMotion from '../../../shared/src/lib/useReducedMotion';
import { attention } from '../../engine/club/attention';
import { clubById, clubPower, clubRoster, findCard, nextMatch, standings } from '../../engine/club/season';
import { t } from '../../lib/i18n';
import ClubLogo from '../ClubLogo';
import styles from './HubFeed.module.css';

// How long each slide plays before the next, like a story.
const SLIDE_MS = 7000;
const SWIPE_PX = 40;

const ICONS = {
  contracts: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  training: <path d="M13 2 5 13h6l-1 9 8-11h-6z" />,
  packs: <path d="M5 8h14v12H5zM8 8V5h8v3M12 12v4" />,
  places: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.5-6 8-6s8 2 8 6M19 4v6M16 7h6" />,
  'open-pack': <path d="M5 8h14v12H5zM8 8V5h8v3M12 12v4" />,
  'chip-offer': <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8" />,
};

const ATTENTION_LABEL = {
  'open-pack': () => t('A pack is open. Pick a player.'),
  'chip-offer': () => t('A chip pick is waiting'),
  contracts: n => (n === 1 ? t('1 contract ends this year') : t('{n} contracts end this year', { n })),
  training: n => (n === 1 ? t('1 training session free') : t('{n} training sessions free', { n })),
  packs: n => t('{n} pack value unspent', { n }),
  places: n => (n === 1 ? t('1 squad place open') : t('{n} squad places open', { n })),
};

const ordinalPos = pos => t('{pos} of 6', { pos });

function Icon({ name }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" strokeLinecap="square" aria-hidden="true">{ICONS[name]}</svg>;
}

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

// The tier a card is printed in, so a headline move wears its card's colour.
const tierOf = card => (card.league === 'icon' ? 'icon' : card.rating > 80 ? 'gold' : card.rating > 70 ? 'silver' : 'bronze');

// Scouting report: both powers as the headline, the bar between them, their best
// three as real cards (the strongest in the middle, a size up), then where they stand.
function Opponent({ state, cards, cardScale }) {
  const match = nextMatch(state);
  const rival = match && clubById(state, match.id);
  if (!rival) return <p className={styles.empty}>{t('No match scheduled')}</p>;
  const mine = Math.round(clubPower(state, 'you', cards));
  const theirs = Math.round(clubPower(state, rival.id, cards));
  const record = state.table?.[rival.id] ?? { w: 0, l: 0, rd: 0 };
  const pos = state.results.length > 0 ? standings(state, cards).find(row => row.id === rival.id)?.pos : null;
  const best = clubRoster(state, rival, cards).filter(Boolean).sort((a, b) => b.rating - a.rating).slice(0, 3);
  // Strongest in the middle: second, first, third.
  const shown = best.length === 3 ? [best[1], best[0], best[2]] : best;
  return (
    <>
      <div className={styles.powers} role="img" aria-label={t('Squad power: you {you}, them {them}', { you: mine, them: theirs })}>
        <span className={styles.power}><Mine state={state} size={40} /><b>{mine}</b></span>
        <span className={styles.power} data-them><Crest club={rival} size={40} /><b>{theirs}</b></span>
        <span className={styles.split}><i style={{ flexGrow: mine }} /><i data-them style={{ flexGrow: theirs }} /></span>
      </div>
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
      {/* The phone strip has no room for cards: their best as faces and ratings. */}
      <ul className={styles.facesRow} aria-label={t('Their best')}>
        {best.map(card => <li key={card.id}><Face card={card} /><b>{card.rating}</b></li>)}
      </ul>
    </>
  );
}

// Needs attention: what it is in words, its count, and where a tap goes.
function Attention({ state, onGo }) {
  const items = attention(state, 4);
  if (items.length === 0) {
    return (
      <div className={styles.clear}>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
        <b>{t('All clear this week')}</b>
      </div>
    );
  }
  // How many things are open is the headline; each one is a tile that goes there.
  return (
    <>
      <b className={styles.count} aria-hidden="true">{items.length}</b>
      <ul className={styles.tiles}>
        {items.map((item, index) => (
          <li key={item.key}>
            <button type="button" className={styles.tile} data-first={index === 0 || undefined} onClick={() => onGo(item.go)}>
              <Icon name={item.key} />
              <span>{ATTENTION_LABEL[item.key](item.n)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// League news: the latest move as a headline in its card's colour, from crest to
// crest; the moves before it as a strip of faces, marked by which way they went.
function News({ state, cards }) {
  const rows = (state.news ?? []).slice(0, 4).map(entry => {
    const other = clubById(state, entry.club);
    // 'out' was signed from a rival into your club; 'in' left your club for a rival.
    const joined = entry.kind === 'out';
    return { entry, card: findCard(state, cards, entry.id), other, joined };
  }).filter(row => row.card);
  if (rows.length === 0) return <p className={styles.empty}>{t('No moves yet. Clubs trade in the window after the playoffs.')}</p>;
  const [top, ...rest] = rows;
  const crest = (row, side) => ((row.joined ? side === 'to' : side === 'from') ? <Mine state={state} size={32} /> : <Crest club={row.other} size={32} />);
  return (
    <>
      <div className={styles.headline} data-tier={tierOf(top.card)} data-joined={top.joined || undefined}>
        <b className={styles.headlineRating}>{top.card.rating}</b>
        <HeadlinePhoto card={top.card} />
        <div className={styles.headlineBar}>
          <b>{top.card.player}</b>
          <span className={styles.route} role="img" aria-label={t('to {club}', { club: top.joined ? state.name : top.other?.name ?? '' })}>
            {crest(top, 'from')}
            <svg viewBox="0 0 24 12" width="24" height="12" aria-hidden="true"><path d="M0 6h20M15 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            {crest(top, 'to')}
          </span>
        </div>
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
    </>
  );
}

function HeadlinePhoto({ card }) {
  const real = card.photo && !card.photo.includes('placeholder');
  return real
    ? <img className={styles.headlinePhoto} src={assetPath(card.photo)} alt="" loading="lazy" />
    : <svg className={styles.headlinePhoto} viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7" /><path d="M6 40c1-9 6-14 14-14s13 5 14 14z" /></svg>;
}

/**
 * The club feed, played like stories: one slide at a time, sliding sideways,
 * with a bar per slide across the top that fills while it plays. Tap the right
 * side for the next, the left for the one before, or swipe. Hovering, focus or a
 * held press pauses it; with reduced motion it waits to be moved by hand.
 */
export default function HubFeed({ state, cards, width, height, compact = false, onGo }) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const press = useRef(null);
  // The rival's three cards fill the slide: as wide as three fit (the middle one a
  // size up), and no taller than the room left by the bars, powers and facts (about 300 px).
  const cardScale = Math.max(0.12, Math.min(0.3, ((width ?? 320) - 64) / 3.2 / 400, ((height ?? 400) - 300) / 580 / 1.12));
  const slides = [
    { key: 'opponent', title: t('Scouting report'), body: <Opponent state={state} cards={cards} cardScale={cardScale} /> },
    { key: 'attention', title: t('Needs attention'), body: <Attention state={state} onGo={onGo} /> },
    { key: 'news', title: t('League news'), body: <News state={state} cards={cards} /> },
  ];
  const count = slides.length;
  const go = useCallback(step => setIndex(current => (current + step + count) % count), [count]);

  // Arrow keys while the feed has focus.
  const onKeyDown = (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  };
  // A tap on the slide's background moves like a story; taps on its buttons don't.
  const onPointerDown = (event) => {
    press.current = { x: event.clientX, y: event.clientY, onButton: Boolean(event.target.closest('button')) };
    setPaused(true);
  };
  const onPointerUp = (event) => {
    const start = press.current;
    press.current = null;
    setPaused(false);
    if (!start || start.onButton) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(event.clientY - start.y)) { go(dx < 0 ? 1 : -1); return; }
    const box = event.currentTarget.getBoundingClientRect();
    go(event.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  useEffect(() => {
    if (!press.current) return undefined;
    const cancel = () => { press.current = null; setPaused(false); };
    window.addEventListener('pointercancel', cancel);
    return () => window.removeEventListener('pointercancel', cancel);
  });

  return (
    <aside
      className={styles.feed}
      data-compact={compact || undefined}
      style={{ width, height }}
      aria-label={t('Club feed')}
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={styles.bars} role="tablist" aria-label={t('Feed pages')}>
        {slides.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={slide.title}
            className={styles.bar}
            data-state={i < index ? 'done' : i === index ? 'now' : 'next'}
            onClick={() => setIndex(i)}
          >
            {/* Keyed by index so the fill restarts whenever this slide comes up. */}
            {i === index && (
              <i
                key={index}
                data-still={reducedMotion || undefined}
                style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                onAnimationEnd={() => go(1)}
              />
            )}
          </button>
        ))}
      </div>
      <div className={styles.window} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className={styles.track} style={{ transform: `translateX(${-index * 100}%)` }} data-still={reducedMotion || undefined}>
          {slides.map((slide, i) => (
            <section key={slide.key} className={styles.slide} data-key={slide.key} aria-label={slide.title} aria-hidden={i !== index || undefined} inert={i !== index}>
              {slide.body}
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
