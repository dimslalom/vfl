import { useLayoutEffect, useRef } from 'react';
import { t } from '../../lib/i18n';
import styles from './ClubEntry.module.css';

// First-time tips, written for someone who has never played: a plain heading, then
// what to do and why it matters. Each points at the control it is about (`target`,
// a `data-tip` value on that screen), which gets a ring so the eye lands on it.
// Written as functions so a language change re-renders them and the i18n test
// can see every string.
const HINTS = {
  home: () => ({
    target: 'play',
    title: t('Your next match'),
    text: t('Press Play to start this week’s match. Between matches, use the tiles to manage your team.'),
  }),
  home_tapes: () => ({
    target: 'tile-train',
    title: t('New training tapes'),
    text: t('You won training tapes. Open Train and use one to make a player better.'),
  }),
  squad: () => ({
    target: 'swap',
    title: t('Your team'),
    text: t('The five cards on top play the match. Click two players to swap them. The player on the left is your captain (IGL).'),
  }),
  squad_fatigue: () => ({
    target: 'swap',
    title: t('Tired players'),
    text: t('Players get tired after every match and play worse. Swap a tired player to the bench for a week so they can rest.'),
  }),
  train: () => ({
    target: 'tapes',
    title: t('Training'),
    text: t('Win matches to earn training tapes. Use a tape on a player to raise one of their stats.'),
  }),
  train_active: () => ({
    target: 'tapes',
    title: t('Use a tape'),
    text: t('Pick a tape, then pick a player below. The card on the left shows the result before you use it.'),
  }),
  vault: () => ({
    target: 'open-pack',
    title: t('Packs'),
    text: t('Packs are your money. Open one to pick 1 of 3 new players, or save them to sign players at the end of the season.'),
  }),
  vault_packs: () => ({
    target: 'open-pack',
    title: t('You have packs'),
    text: t('Open a pack to choose a new player, or keep it to spend at the end of the season.'),
  }),
  chips: () => ({
    target: 'loadout',
    title: t('Tactics'),
    text: t('Tactics are chips you place on a lane during a match to multiply its score. Equip up to seven to take them into your next match.'),
  }),
  chipPick: () => ({
    target: 'chip-offer',
    title: t('Pick a reward'),
    text: t('You won! Keep one tactic chip. Tap a chip to see what it does, then tap it again to take it.'),
  }),
  league: () => ({
    target: 'table',
    title: t('The league'),
    text: t('Six teams, five weeks. Finish in the top four to reach the playoffs. Reach the final to move up a division.'),
  }),
  window: () => ({
    target: 'sign',
    title: t('Transfer window'),
    text: t('The season is over. Use your packs to sign new players, or keep players whose contracts are ending.'),
  }),
};

const GAP = 16;
const EDGE = 12;
const RING = 6;

// Beside the target: above it if there is room, else below, else to the side with
// more room. With no target on screen (or no room anywhere), it docks at the bottom.
function place(tip, ring, target) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const r = target?.getBoundingClientRect();
  const visible = r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh;
  let side = 'dock';
  let left = (vw - w) / 2;
  let top = vh - h - 24;
  let point = 0;
  if (visible) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const clampX = x => Math.max(EDGE, Math.min(vw - w - EDGE, x));
    if (r.top - RING - GAP - h >= EDGE) {
      side = 'above';
      left = clampX(cx - w / 2);
      top = r.top - RING - GAP - h;
    } else if (r.bottom + RING + GAP + h + 7 <= vh - EDGE) {
      side = 'below';
      left = clampX(cx - w / 2);
      top = r.bottom + RING + GAP;
    } else if (Math.max(r.left, vw - r.right) - RING - GAP >= w + EDGE) {
      side = vw - r.right > r.left ? 'right' : 'left';
      left = side === 'right' ? r.right + RING + GAP : r.left - RING - GAP - w;
      top = Math.max(EDGE, Math.min(vh - h - EDGE - 7, cy - h / 2));
    }
    point = side === 'above' || side === 'below'
      ? Math.max(20, Math.min(w - 20, cx - left))
      : Math.max(20, Math.min(h - 20, cy - top));
    ring.style.left = `${r.left - RING}px`;
    ring.style.top = `${r.top - RING}px`;
    ring.style.width = `${r.width + RING * 2}px`;
    ring.style.height = `${r.height + RING * 2}px`;
    ring.dataset.on = 'true';
  } else {
    delete ring.dataset.on;
  }
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.style.setProperty('--point', `${Math.round(point)}px`);
  tip.dataset.side = side;
  tip.dataset.ready = 'true';
}

export default function ClubHint({ screen, onDismiss, onHintsOff }) {
  const tipRef = useRef(null);
  const ringRef = useRef(null);
  const getHint = HINTS[screen];
  const hint = getHint?.();
  const target = hint?.target;

  // Targets move as screens settle and cards deal in, so the tip follows every frame.
  useLayoutEffect(() => {
    if (!target) return undefined;
    let frame = 0;
    const follow = () => {
      frame = requestAnimationFrame(follow);
      if (tipRef.current && ringRef.current) place(tipRef.current, ringRef.current, document.querySelector(`[data-tip="${target}"]`));
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!hint) return null;
  return (
    <>
      <span ref={ringRef} className={styles.tipRing} aria-hidden="true" />
      <aside ref={tipRef} className={styles.tip} role="status" aria-label={hint.title}>
        <h2 className={styles.tipTitle}>{hint.title}</h2>
        <p className={styles.tipText}>{hint.text}</p>
        <div className={styles.tipFoot}>
          <button type="button" className={styles.tipOff} onClick={onHintsOff}>{t('Turn off tips')}</button>
          <button type="button" className={styles.tipOk} autoFocus onClick={onDismiss}>{t('Got it')}</button>
        </div>
      </aside>
    </>
  );
}
