import { t } from '../../lib/i18n';
import styles from './ClubEntry.module.css';

// One first-week tip per screen. Written as functions so a language change
// re-renders them and the i18n test can see each string.
const HINTS = {
  home: () => t('This is your week. Play starts the series against this week’s rival. The tiles hold everything you can do between matches.'),
  squad: () => t('Tap two players to swap them. Your leftmost starter is the IGL. Tired starters lose rating, so rotate the bench in.'),
  train: () => t('You get one session a week. Pick a player and what to work on, or rest them to clear fatigue.'),
  vault: () => t('Packs are your money. Spend them on signings and renewals in the year-end window, or open one and keep 1 of 3.'),
  chips: () => t('Chips are your tactics in a series. Win a series to pick a new one. A chip pays more when your starters have the roles it names.'),
  league: () => t('Six clubs, five weeks. The top four reach the playoffs, and reaching the final moves you up a tier.'),
};

export default function ClubHint({ screen, onDismiss, onHintsOff }) {
  const text = HINTS[screen];
  if (!text) return null;
  return (
    <aside className={styles.hint} role="status" aria-label={t('Tip')}>
      <small>{t('First week')}</small>
      <p>{text()}</p>
      <span>
        <button type="button" onClick={onHintsOff}>{t('Turn off tips')}</button>
        <button type="button" data-main onClick={onDismiss}>{t('Got it')}</button>
      </span>
    </aside>
  );
}
