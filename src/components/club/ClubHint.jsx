import { t } from '../../lib/i18n';
import styles from './ClubEntry.module.css';

// Contextual tactical tips. Written as functions returning title and text
// so language changes re-render them and i18n analysis discovers all strings.
const HINTS = {
  home: () => ({
    title: t('First week'),
    text: t('This is your week. Play starts the series against this week’s rival. The tiles hold everything you can do between matches.'),
  }),
  home_tapes: () => ({
    title: t('Training ready'),
    text: t('You earned training tapes from your match. Head to Train to upgrade your squad.'),
  }),
  squad: () => ({
    title: t('Roster management'),
    text: t('Select a player, then Swap to move them. Your leftmost starter is the IGL. Tired starters lose rating, so rotate the bench in.'),
  }),
  squad_fatigue: () => ({
    title: t('Player fatigue'),
    text: t('Tired starters lose rating on the match board. Swap them with a bench player to let them rest and recover.'),
  }),
  train: () => ({
    title: t('Player training'),
    text: t('Use tapes from completed series to train a player. Bench tired players to recover.'),
  }),
  train_active: () => ({
    title: t('Apply tapes'),
    text: t('Select a player and apply your tape to raise their stats. Bench tired players here to recover.'),
  }),
  vault: () => ({
    title: t('Club vault'),
    text: t('Packs are your money. Spend them on signings and renewals in the year-end window, or open one and keep 1 of 3.'),
  }),
  vault_packs: () => ({
    title: t('Open packs'),
    text: t('You have packs in your vault. Open a pack to reveal talent, or save them for contract renewals.'),
  }),
  chips: () => ({
    title: t('Tactical inventory'),
    text: t('Series wins earn a chip pick. Equip up to seven tactics for your next series.'),
  }),
  chipPick: () => ({
    title: t('Tactic pick'),
    text: t('Victory reward: choose one tactic chip to add to your club’s playbook.'),
  }),
  league: () => ({
    title: t('League ladder'),
    text: t('Six clubs, five weeks. The top four reach the playoffs, and reaching the final moves you up a tier.'),
  }),
  window: () => ({
    title: t('Transfer window'),
    text: t('The season transfer window is open. Spend packs to sign free agents or re-sign expiring contracts before next year.'),
  }),
};

export default function ClubHint({ screen, place, onDismiss, onHintsOff }) {
  const getHint = HINTS[screen];
  if (!getHint) return null;
  const hint = getHint();

  return (
    <aside className={styles.hint} data-at={place ?? screen} role="status" aria-label={hint.title}>
      <div className={styles.hintHead}>
        <span className={styles.hintKicker}>
          <span className={styles.hintPip} aria-hidden="true" />
          {hint.title}
        </span>
        <button type="button" className={styles.hintOff} onClick={onHintsOff}>
          {t('Turn off tips')}
        </button>
      </div>
      <p className={styles.hintBody}>{hint.text}</p>
      <div className={styles.hintFoot}>
        <button type="button" className={styles.hintDismiss} autoFocus onClick={onDismiss}>
          {t('Got it')}
        </button>
      </div>
    </aside>
  );
}
