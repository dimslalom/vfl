import PlayerCard from '../../shared/src/components/PlayerCard';
import allCards from '../../shared/src/data/cards.json';
import { TIER_META } from '../engine/endless/ladder';
import { mapCardsForYear } from '../engine/endless/seriesCards';
import { t } from '../lib/i18n';
import { MapCard, TacticCard } from './SeriesCardTable';
import TacticalButton from './TacticalButton';
import styles from './HowTo.module.css';

const SHOWCASE = allCards
  .filter(card => card.photo !== '/assets/players/placeholder.png' && card.league === 'vct')
  .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
  .slice(0, 5);
const EXAMPLE_MAP = mapCardsForYear(1, 1)[0];
const EXAMPLE_TACTIC = { uid: 'howto-hit', key: 'hit', source: 'owned' };

function Row({ title, children, piece }) {
  return (
    <section className={styles.row}>
      <div className={styles.copy}>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      <div className={styles.piece} aria-hidden="true">{piece}</div>
    </section>
  );
}

const fan = cards => (
  <span className={styles.fan}>
    {cards.map(card => <span key={card.id}><PlayerCard card={card} displayScale={0.15} tilt={false} canDrag={false} /></span>)}
  </span>
);

export default function HowTo({ onDone }) {
  return (
    <div className={styles.guide}>
      <Row title={t('Draft five players')} piece={fan(SHOWCASE.slice(0, 3))}>
        {t('Open a pack, keep one card, repeat. Your five cards are your squad.')}
      </Row>
      <Row
        title={t('Put your IGL leftmost')}
        piece={<span className={styles.igl}><b>IGL</b><PlayerCard card={SHOWCASE[3]} displayScale={0.15} tilt={false} canDrag={false} /></span>}
      >
        {t('The player in the leftmost slot calls the game. Drag a card there to change your in-game leader.')}
      </Row>
      <Row
        title={t('Win maps with tactics')}
        piece={<span className={styles.table}><MapCard card={EXAMPLE_MAP} compact /><TacticCard instance={EXAMPLE_TACTIC} compact disabled mult={1.6} /></span>}
      >
        {t('In a series you pick maps, then play one tactic on each. A map adds to your edge and a tactic multiplies it, so pick the card that fits your squad. Win the map and the tactic comes back.')}
      </Row>
      <Row
        title={t('Climb or fall each year')}
        piece={(
          <ol className={styles.ladder}>
            {[...TIER_META].reverse().map((tier, index) => (
              <li key={tier.key} data-current={index === 1 ? 'true' : undefined}>{t(tier.label)}</li>
            ))}
          </ol>
        )}
      >
        {t('A year is three events. A strong year moves you up the league ladder and a poor one moves you down, so the competition always fits your squad.')}
      </Row>
      <Row title={t('Keep your squad going')} piece={fan(SHOWCASE.slice(2, 5))}>
        {t('Players grow, age and get poached. Between events, spend packs on new players. The run lasts as long as you want it to.')}
      </Row>
      <Glossary />
      {onDone && (
        <footer className={styles.footer}>
          <TacticalButton className={styles.done} onClick={onDone}>{t('Got it')}</TacticalButton>
        </footer>
      )}
    </div>
  );
}

// The game's own words, each explained once. Shared with the run HUD's sheet.
export function Glossary() {
  const terms = [
    [t('Circuit'), t('The three-tier league ladder: Challengers, Ascension, International.')],
    [t('Ladder points'), t('What each event earns toward promotion or relegation at the end of the year.')],
    [t('Reputation'), t('How much respect your club has. It sets the best rating you can sign and pays to refuse a poach.')],
    [t('Prestige'), t('Retire your run from the top tier for a score multiplier. Only offered once you have earned it.')],
  ];
  return (
    <dl className={styles.glossary}>
      {terms.map(([term, meaning]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
