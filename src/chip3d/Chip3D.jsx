import { useEffect, useRef, useState } from 'react';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import { CHIP_TIERS, chipInfo } from './chipData';
import { ICON_PATHS } from './chipIcons';
import { chipStyle, useChipStyle } from './chipStyle';
import styles from './Chip3D.module.css';

// The same face as the 3D print, drawn flat: used when WebGL isn't there. The
// solid offset disc under it is the chip's edge, a hard print, not a shadow.
export function ChipFlat({ chipKey, size = 96, face }) {
  const info = chipInfo(chipKey);
  const tone = CHIP_TIERS[info.tier];
  const style = face ?? chipStyle().face;
  const spots = Array.from({ length: 8 }, (_, i) => i * 45);
  const n = info.icons.length;
  const icon = n > 2 ? 15 : n === 2 ? 20 : 25;
  return (
    <svg className={styles.flat} width={size} height={size * 1.08} viewBox="0 0 100 108" aria-hidden="true">
      <circle cx="50" cy="58" r="48" fill={tone.body} />
      <circle cx="50" cy="58" r="48" fill="#000" opacity="0.35" />
      <circle cx="50" cy="50" r="48" fill={tone.body} />
      {spots.map(angle => <rect key={angle} x="45" y="2" width="10" height="13" fill={tone.spot} transform={`rotate(${angle} 50 50)`} />)}
      <circle cx="50" cy="50" r="32" fill={tone.face} />
      {style === 'code'
        ? <text x="50" y="40" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontWeight="700" fontSize={info.code.length > 7 ? 7 : 9} fill={tone.ink}>{info.code}</text>
        : (
          <g stroke={tone.ink} strokeWidth="2.4" fill="none" strokeLinecap="square">
            {info.icons.map((name, i) => (
              <g key={name + i} transform={`translate(${50 + (i - (n - 1) / 2) * icon - icon / 2} ${38 - icon / 2}) scale(${icon / 24})`}>
                {ICON_PATHS[name].map(d => <path key={d} d={d} />)}
              </g>
            ))}
          </g>
        )}
      <text x="50" y="65" textAnchor="middle" fontWeight="700" fontSize="22" fill={tone.ink}>{info.headline}</text>
    </svg>
  );
}

/**
 * A tactic chip as a lit 3D object: leaning back so its rim shows, swaying a
 * little, and tilting toward the pointer. Falls back to ChipFlat without WebGL.
 */
export default function Chip3D({ chipKey, size = 120, phase = 0, className = '' }) {
  const canvasRef = useRef(null);
  const viewRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const { face } = useChipStyle();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed || !canvasRef.current) return undefined;
    let view = null;
    let cancelled = false;
    import('./chipRenderer.js')
      .then(({ createChipView }) => {
        if (cancelled) return;
        view = createChipView(canvasRef.current, chipKey, { reducedMotion, phase, onFail: () => setFailed(true) });
        if (!view) setFailed(true);
        viewRef.current = view;
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; view?.destroy(); viewRef.current = null; };
  }, [chipKey, face, reducedMotion, phase, failed]);

  function move(event) {
    const box = event.currentTarget.getBoundingClientRect();
    viewRef.current?.hover(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
  }

  if (failed) return <span className={`${styles.chip} ${className}`} style={{ '--size': `${size}px` }}><ChipFlat chipKey={chipKey} size={size} face={face} /></span>;
  return (
    <span className={`${styles.chip} ${className}`} style={{ '--size': `${size}px` }} onPointerMove={move} onPointerLeave={() => viewRef.current?.hover(null)} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </span>
  );
}
