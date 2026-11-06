import { useEffect, useRef, useState } from 'react';
import PlayerCard from '../../shared/src/components/PlayerCard';
import EvoFx from '../../shared/src/components/EvoFx';
import { EVO_ART } from '../../shared/src/components/evoArt';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import styles from './EvoShowcase.module.css';

const CARD_W = 400;
const CARD_H = 580;

// A card shown big, at a moment that is about it: an evolved rare runs its
// effects, and an Apex card swaps to the Blender-built 3D model once three.js
// and the model have loaded. Until then, and without WebGL, the flat card shows.
export default function EvoShowcase({ card, displayScale = 0.5, ...cardProps }) {
  const isApex = EVO_ART[card.evoTheme]?.tier === 'apex';
  const sig = `${card.id}:${card.evoLevel}:${card.rating}:${card.evoTheme}:${Object.values(card.stats ?? {}).join(',')}`;
  return (
    <div className={styles.root} style={{ width: CARD_W * displayScale, height: CARD_H * displayScale }}>
      {isApex
        ? <Apex3D key={sig} card={card} displayScale={displayScale} cardProps={cardProps} />
        : <PlayerCard card={card} displayScale={displayScale} evoFx canDrag={false} {...cardProps} />}
    </div>
  );
}

function Apex3D({ card, displayScale, cardProps }) {
  const holderRef = useRef(null);
  const cardRef = useRef(card);
  const [live, setLive] = useState(false);
  const still = useReducedMotion();
  const level = card.evoLevel === 2 ? 2 : 1;
  const theme = card.evoTheme || 'apex';
  useEffect(() => {
    // A canvas per mount: a torn-down renderer loses its WebGL context for
    // good, so a remount (StrictMode does one) must not reuse that canvas.
    const canvas = document.createElement('canvas');
    canvas.className = styles.gl;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${cardRef.current.player}, ${cardRef.current.rating}`);
    holderRef.current.appendChild(canvas);
    let dispose = null, cancelled = false;
    import('./apexScene')
      .then(({ mountApex }) => mountApex(canvas, cardRef.current, { level, theme, still, onLost: () => { if (!cancelled) { delete canvas.dataset.live; setLive(false); } } }))
      .then(teardown => {
        if (cancelled) { teardown?.(); return; }
        dispose = teardown;
        if (teardown) { canvas.dataset.live = 'true'; setLive(true); }
      })
      .catch(() => {});
    return () => { cancelled = true; dispose?.(); canvas.remove(); };
  }, [level, theme, still]);
  return (
    <>
      <div className={styles.flat} data-hidden={live || undefined}>
        <PlayerCard card={card} displayScale={displayScale} evoFx={!live} canDrag={false} {...cardProps} />
      </div>
      {live && (
        <div className={styles.fxBack} style={{ transform: `scale(${displayScale})` }}>
          <EvoFx theme={theme} level={level} layer="back" border={false} />
        </div>
      )}
      <div ref={holderRef} className={styles.holder} />
      {live && (
        <div className={styles.fx} style={{ transform: `scale(${displayScale})` }}>
          <EvoFx theme={theme} level={level} layer="front" border={false} />
        </div>
      )}
    </>
  );
}
