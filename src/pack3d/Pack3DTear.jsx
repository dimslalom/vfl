import { useCallback, useEffect, useRef, useState } from 'react';
import PackTear from '../../shared/src/components/PackTear';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import { PACK_TYPES } from './packTypes';
import styles from './Pack3DTear.module.css';

// The pack-opening moment in 3D: the foil pack from /lab/pack, torn by dragging across
// its top (see PackScene's tear). Same props as the flat PackTear, so any screen can
// swap one for the other. The flat pack stays the fallback when WebGL is missing,
// motion is reduced, or the 3D code cannot load in time.
//
// The canvas is larger than the pack's footprint, so the torn strip has room to fly,
// while the footprint itself (data-pack-body) is what callers measure and tap.

const SPECTATOR_DELAY = 260;
const LOAD_LIMIT = 4000;    // ms before giving up on 3D and showing the flat pack
const SPREAD = 1.6;         // canvas height over pack height

let webgl;
function hasWebGL() {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement('canvas');
      webgl = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

export default function Pack3DTear(props) {
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(() => !hasWebGL());
  if (failed || reducedMotion) return <PackTear {...props} />;
  return <Pack3D {...props} onFail={() => setFailed(true)} />;
}

function Pack3D({ interactive, onTorn, onFail, type = 'silver' }) {
  const wrapRef = useRef(null);
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const queuedRef = useRef(false);
  const tornRef = useRef(onTorn);
  const failRef = useRef(onFail);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    tornRef.current = onTorn;
    failRef.current = onFail;
  });

  useEffect(() => {
    let scene;
    let unbind;
    let cancelled = false;
    const fail = () => { if (!cancelled) failRef.current?.(); };
    const limit = setTimeout(fail, LOAD_LIMIT);
    (async () => {
      try {
        const [{ default: PackScene }, { pickCover }, { default: cards }] = await Promise.all([
          import('./PackScene.js'),
          import('./packCover.js'),
          import('../../shared/src/data/cards.json'),
        ]);
        if (cancelled) return;
        scene = new PackScene(hostRef.current, {
          fit: 1 / SPREAD,
          pointerTarget: wrapRef.current,
          onFail: fail,
          onOpened: () => tornRef.current?.(),
        });
        sceneRef.current = scene;
        if (!(await scene.init()) || cancelled) return;
        const packType = PACK_TYPES[type] ?? PACK_TYPES.silver;
        await scene.setType(packType, pickCover(packType, Math.floor(Math.random() * 1e6), cards));
        if (cancelled) return;
        clearTimeout(limit);
        if (interactive) unbind = scene.bindTear(wrapRef.current);
        setReady(true);
      } catch {
        fail();
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(limit);
      unbind?.();
      scene?.destroy();
      sceneRef.current = null;
    };
  }, [interactive, type]);

  // Someone else's pack, or a tap or key that came before the pack was ready.
  useEffect(() => {
    if (!ready || (interactive && !queuedRef.current)) return undefined;
    const timer = setTimeout(() => sceneRef.current?.autoTear(), interactive ? 0 : SPECTATOR_DELAY);
    return () => clearTimeout(timer);
  }, [ready, interactive]);

  const tearNow = useCallback(() => {
    if (sceneRef.current && ready) sceneRef.current.autoTear();
    else queuedRef.current = true;
  }, [ready]);

  // Space/Enter tears the pack without focusing it, unless focus is on a control that owns those keys.
  useEffect(() => {
    if (!interactive) return undefined;
    function onKey(e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
      e.preventDefault();
      tearNow();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, tearNow]);

  return (
    <div
      ref={wrapRef}
      className={styles.packWrap}
      data-pack-body="true"
      data-ready={ready || undefined}
      aria-hidden={!interactive}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? 'Tear the pack open' : undefined}
      onPointerUp={ready ? undefined : () => { if (interactive) tearNow(); }}
    >
      <div ref={hostRef} className={styles.stage} style={{ '--spread': SPREAD }} />
    </div>
  );
}
