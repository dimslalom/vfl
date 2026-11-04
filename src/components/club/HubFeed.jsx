import { useEffect, useRef, useState } from 'react';
import { assetPath } from '../../../shared/src/lib/utils';
import { attention } from '../../engine/club/attention';
import { clubById, clubRoster, findCard, nextMatch, standings } from '../../engine/club/season';
import { t } from '../../lib/i18n';
import { stageLabel } from './clubSummary';
import styles from './HubFeed.module.css';

const ATTENTION_TEXT = {
  'open-pack': n => t('A pack is open. Pick a player.', { n }),
  'chip-offer': n => t('A chip pick is waiting', { n }),
  contracts: n => (n === 1 ? t('1 contract ends this year') : t('{n} contracts end this year', { n })),
  training: n => (n === 1 ? t('1 training session free') : t('{n} training sessions free', { n })),
  packs: n => t('{n} pack value unspent', { n }),
  places: n => (n === 1 ? t('1 squad place open') : t('{n} squad places open', { n })),
};

function Opponent({ state, cards }) {
  const match = nextMatch(state);
  const rival = match && clubById(state, match.id);
  if (!rival) return <p className={styles.empty}>{t('No match scheduled')}</p>;
  const pos = standings(state, cards).find(row => row.id === rival.id)?.pos;
  const best = clubRoster(state, rival, cards).filter(Boolean).sort((a, b) => b.rating - a.rating).slice(0, 3);
  return (
    <>
      <div className={styles.rival}>
        {rival.logo && <img src={assetPath(rival.logo)} alt="" />}
        <b>{rival.name}</b>
      </div>
      <p className={styles.meta}>{stageLabel(match)} · {t('Best of {n}', { n: match.bestOf })}</p>
      <dl className={styles.facts}>
        {pos && <><dt>{t('Table')}</dt><dd>{t('{pos} of 6', { pos })}</dd></>}
      </dl>
      {best.length > 0 && (
        <>
          <h4 className={styles.sub}>{t('Their best')}</h4>
          <ul className={styles.list}>
            {best.map(card => <li key={card.id} className={styles.line}><b>{card.player}</b><span>{card.rating}</span></li>)}
          </ul>
        </>
      )}
    </>
  );
}

function Attention({ state, onGo }) {
  const items = attention(state);
  if (items.length === 0) return <p className={styles.empty}>{t('All clear this week')}</p>;
  return (
    <ul className={styles.list}>
      {items.map(item => (
        <li key={item.key}>
          <button type="button" onClick={() => onGo(item.go)}>{ATTENTION_TEXT[item.key](item.n)}</button>
        </li>
      ))}
    </ul>
  );
}

function Signings({ state, cards }) {
  const rows = (state.signings ?? []).slice(0, 4).map(entry => ({ entry, card: findCard(state, cards, entry.id) })).filter(row => row.card);
  if (rows.length === 0) return <p className={styles.empty}>{t('No signings yet. Open a pack or work the transfer window.')}</p>;
  return (
    <ul className={styles.list}>
      {rows.map(({ entry, card }) => (
        <li key={`${entry.id}-${entry.year}`} className={styles.signing}>
          <b>{card.player}</b>
          <span>{card.rating} · {entry.via === 'pack' ? t('From a pack') : t('Transfer window')} · {t('Year {n}', { n: entry.year })}</span>
        </li>
      ))}
    </ul>
  );
}

// One tall panel of slides you scroll through, one snapping into place with the
// next peeking in. The pips on the right jump to a slide.
export default function HubFeed({ state, cards, width, height, onGo }) {
  const rail = useRef(null);
  const [index, setIndex] = useState(0);
  const slides = [
    { key: 'opponent', title: t('Next opponent'), body: <Opponent state={state} cards={cards} /> },
    { key: 'attention', title: t('Needs attention'), body: <Attention state={state} onGo={onGo} /> },
    { key: 'signings', title: t('Recent signings'), body: <Signings state={state} cards={cards} /> },
  ];
  const step = () => {
    const first = rail.current?.children[0];
    const second = rail.current?.children[1];
    return first && second ? second.offsetTop - first.offsetTop : 1;
  };
  useEffect(() => {
    const el = rail.current;
    if (!el) return undefined;
    const onScroll = () => setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollTop / step()))));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [slides.length]);
  const jump = i => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.current?.scrollTo({ top: i * step(), behavior: reduced ? 'auto' : 'smooth' });
  };
  return (
    <aside className={styles.feed} style={{ width, height }} aria-label={t('Club feed')}>
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
