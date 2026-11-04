import { useEffect, useRef, useState } from 'react';
import { playUiSound } from '../../shared/src/lib/gameAudio';
import { assetPath } from '../../shared/src/lib/utils';
import { startMatchMusic } from '../lib/music';
import ClubLogo from './ClubLogo';
import styles from './MatchIntro.module.css';

// How long each beat holds, in ms. The panels close for ENTER, hold at least
// HOLD (longer if the board is still loading), then part over OPEN while the
// board's camera drops in for DROP. Reduced motion keeps only a short still.
const ENTER = 450;
const HOLD = 1100;
const OPEN = 500;
const DROP = 1400;
const STILL = 600;

const initials = name => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();

// A player with no photo yet stands as a flat head-and-shoulders shape.
function Silhouette() {
  return (
    <svg viewBox="0 0 400 412" aria-hidden="true">
      <circle cx="200" cy="150" r="78" />
      <path d="M58 412c8-96 66-150 142-150s134 54 142 150z" />
    </svg>
  );
}

function Side({ side, club, cards }) {
  return (
    <div className={styles.side} data-side={side}>
      <div className={styles.who}>
        {club.mark
          ? <ClubLogo className={styles.mark} name={club.name} style={club.mark.style} tone={club.mark.tone} />
          : (
            <span className={styles.crest}>
              {club.logo ? <img src={assetPath(club.logo)} alt="" /> : initials(club.name)}
            </span>
          )}
        <b className={styles.name}>{club.name}</b>
      </div>
      <div className={styles.five}>
        {cards.map((card, index) => (
          <figure key={card.id} className={styles.player} style={{ '--i': index }}>
            {card.photo && !card.photo.includes('placeholder')
              ? <img src={assetPath(card.photo)} alt="" draggable={false} />
              : <Silhouette />}
          </figure>
        ))}
      </div>
    </div>
  );
}

/**
 * The match intro: both clubs cut in from either side on a diagonal, each with
 * its five, meet at a sharp seam, then part like doors onto the board as its
 * camera drops in. No words beyond the names, no badge between
 * the sides: the seam is the contest. A tap shortens it at any point.
 */
export default function MatchIntro({ you, them, stage, bestOf, ready, reducedMotion, onOpen, onSkipDrop, onDone }) {
  const [phase, setPhase] = useState('in');
  const [held, setHeld] = useState(false);
  const skipped = useRef(false);
  const opened = useRef(false);

  // Close the panels, then count the hold.
  useEffect(() => {
    const first = requestAnimationFrame(() => setPhase('hold'));
    if (!reducedMotion) playUiSound('lock_in');
    // The music's beat drop (0:18) lands one second in, as the last player rises:
    // it starts a second before the drop and fades in over that second.
    startMatchMusic();
    const hold = setTimeout(() => setHeld(true), reducedMotion ? STILL : ENTER + HOLD);
    return () => { cancelAnimationFrame(first); clearTimeout(hold); };
  }, [reducedMotion]);

  // Part once the hold is over (or was skipped) and the board can be shown.
  useEffect(() => {
    if (!ready || !(held || skipped.current) || opened.current) return undefined;
    opened.current = true;
    onOpen();
    if (reducedMotion) { onDone(); return undefined; }
    const open = requestAnimationFrame(() => setPhase('open'));
    if (skipped.current) onSkipDrop();
    const done = setTimeout(onDone, skipped.current ? OPEN : Math.max(OPEN, DROP));
    return () => { cancelAnimationFrame(open); clearTimeout(done); };
  }, [ready, held, reducedMotion, onOpen, onDone, onSkipDrop]);

  const skip = () => {
    if (skipped.current) return;
    skipped.current = true;
    if (opened.current) { onSkipDrop(); onDone(); return; }
    setHeld(true);
  };

  return (
    <div className={styles.intro} data-phase={phase} onClick={skip} role="presentation">
      <Side side="you" club={you.club} cards={you.cards} />
      <Side side="them" club={them.club} cards={them.cards} />
      <p className={styles.sr} role="status">{`${stage}: ${you.club.name} against ${them.club.name}, best of ${bestOf}`}</p>
    </div>
  );
}
