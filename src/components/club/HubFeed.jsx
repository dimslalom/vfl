import { useEffect, useRef, useState } from 'react';
import { assetPath } from '../../../shared/src/lib/utils';
import { attention } from '../../engine/club/attention';
import { clubById, clubPower, clubRoster, findCard, nextMatch, standings } from '../../engine/club/season';
import { t } from '../../lib/i18n';
import ClubLogo from '../ClubLogo';
import styles from './HubFeed.module.css';

// Everything here is a picture first: a bar, a face, an icon with a number.
// Words are kept for the slide titles and for assistive text.

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

function Icon({ name }) {
  return <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" strokeLinecap="square" aria-hidden="true">{ICONS[name]}</svg>;
}

function Opponent({ state, cards }) {
  const match = nextMatch(state);
  const rival = match && clubById(state, match.id);
  if (!rival) return <div className={styles.blank} role="img" aria-label={t('No match scheduled')} />;
  const rows = standings(state, cards);
  const pos = rows.find(row => row.id === rival.id)?.pos;
  const mine = clubPower(state, 'you', cards);
  const theirs = clubPower(state, rival.id, cards);
  const top = Math.max(mine, theirs, 1);
  const best = clubRoster(state, rival, cards).filter(Boolean).sort((a, b) => b.rating - a.rating).slice(0, 3);
  return (
    <>
      <div className={styles.power} role="img" aria-label={`${state.name} ${Math.round(mine)}, ${rival.name} ${Math.round(theirs)}`}>
        <div><ClubLogo name={state.name} style={state.crest} tone={state.tone} size={26} /><i style={{ width: `${(mine / top) * 100}%` }} data-you /><em>{Math.round(mine)}</em></div>
        <div>{rival.logo ? <img src={assetPath(rival.logo)} alt="" /> : <span />}<i style={{ width: `${(theirs / top) * 100}%` }} /><em>{Math.round(theirs)}</em></div>
      </div>
      <ul className={styles.faces} aria-label={t('Their best')}>
        {best.map(card => (
          <li key={card.id}>
            <img src={assetPath(card.photo)} alt="" loading="lazy" />
            <b>{card.rating}</b>
          </li>
        ))}
      </ul>
      {pos && (
        <div className={styles.table} role="img" aria-label={t('{pos} of 6', { pos })}>
          {rows.map(row => <i key={row.id} data-here={row.id === rival.id || undefined} data-you={row.you || undefined} />)}
        </div>
      )}
    </>
  );
}

function Attention({ state, onGo }) {
  const items = attention(state, 4);
  if (items.length === 0) {
    return (
      <div className={styles.clear} role="img" aria-label={t('All clear this week')}>
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
      </div>
    );
  }
  return (
    <ul className={styles.tiles}>
      {items.map(item => {
        const label = ATTENTION_LABEL[item.key](item.n);
        return (
          <li key={item.key}>
            <button type="button" aria-label={label} title={label} onClick={() => onGo(item.go)}>
              <Icon name={item.key} />
              {item.key !== 'open-pack' && item.key !== 'chip-offer' && <b>{item.n}</b>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// A player and the club he now plays for: face, arrow, crest.
function News({ state, cards }) {
  const rows = (state.news ?? []).slice(0, 3).map(entry => ({
    entry,
    card: findCard(state, cards, entry.id),
    club: entry.kind === 'out' ? null : clubById(state, entry.club),
  })).filter(row => row.card);
  return (
    <ul className={styles.news}>
      {Array.from({ length: 3 }, (_, i) => {
        const row = rows[i];
        if (!row) return <li key={i} className={styles.ghost} aria-hidden="true"><span /><svg className={styles.arrow} viewBox="0 0 24 8" aria-hidden="true"><path d="M0 4h20M16 0l4 4-4 4" /></svg><span /></li>;
        const crest = row.club?.logo;
        return (
          <li key={`${row.entry.id}-${row.entry.year}-${row.entry.kind}`} aria-label={`${row.card.player} ${row.club?.name ?? state.name}`}>
            <span className={styles.face}><img src={assetPath(row.card.photo)} alt="" loading="lazy" /><b>{row.card.rating}</b></span>
            <svg className={styles.arrow} viewBox="0 0 24 8" aria-hidden="true"><path d="M0 4h20M16 0l4 4-4 4" /></svg>
            {row.entry.kind === 'out'
              ? <ClubLogo name={state.name} style={state.crest} tone={state.tone} size={44} />
              : crest ? <img className={styles.crest} src={assetPath(crest)} alt="" /> : <span className={styles.crest} />}
          </li>
        );
      })}
    </ul>
  );
}

// One tall panel of slides you scroll through, one snapping into place with the
// next peeking in. The pips on the right jump to a slide.
export default function HubFeed({ state, cards, width, height, horizontal = false, onGo }) {
  const rail = useRef(null);
  const [index, setIndex] = useState(0);
  const slides = [
    { key: 'opponent', title: t('Scouting report'), body: <Opponent state={state} cards={cards} /> },
    { key: 'attention', title: t('Needs attention'), body: <Attention state={state} onGo={onGo} /> },
    { key: 'news', title: t('League news'), body: <News state={state} cards={cards} /> },
  ];
  useEffect(() => {
    const el = rail.current;
    if (!el) return undefined;
    const step = () => {
      const first = el.children[0];
      const second = el.children[1];
      return first && second ? (horizontal ? second.offsetLeft - first.offsetLeft : second.offsetTop - first.offsetTop) : 1;
    };
    const onScroll = () => setIndex(Math.max(0, Math.min(slides.length - 1, Math.round((horizontal ? el.scrollLeft : el.scrollTop) / step()))));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [slides.length, horizontal]);
  const jump = i => {
    const first = rail.current?.children[0];
    const second = rail.current?.children[1];
    const step = first && second ? (horizontal ? second.offsetLeft - first.offsetLeft : second.offsetTop - first.offsetTop) : 1;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.current?.scrollTo({ [horizontal ? 'left' : 'top']: i * step, behavior: reduced ? 'auto' : 'smooth' });
  };
  return (
    <aside className={`${styles.feed} ${horizontal ? styles.horizontal : ''}`} style={{ width, height }} aria-label={t('Club feed')}>
      <div className={styles.rail} ref={rail} tabIndex={0}>
        {slides.map(slide => (
          <section key={slide.key} className={styles.slide}>
            <h3>{slide.title}</h3>
            {slide.body}
          </section>
        ))}
      </div>
      <div className={styles.pips} role="group" aria-label={t('Feed pages')}>
        {slides.map((slide, i) => (
          <button key={slide.key} type="button" aria-label={slide.title} aria-pressed={i === index} onClick={() => jump(i)} />
        ))}
      </div>
    </aside>
  );
}
