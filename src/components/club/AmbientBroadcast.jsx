import { useEffect, useRef, useState } from 'react';
import useReducedMotion from '../../../shared/src/lib/useReducedMotion';
import { assetPath } from '../../../shared/src/lib/utils';
import { attachAmbientVideo, detachAmbientVideo } from '../../lib/ambientAudio';
import styles from './AmbientBroadcast.module.css';

const VOD_SRC = '/video/vct-ambient.mp4';

/**
 * Persistent ambient VCT broadcast background.
 * Renders behind the Club Hub and all management screens (squad, inventory, train, etc).
 * Features blurred VCT match VOD motion and lowpass-filtered, muffled stadium audio.
 */
export default function AmbientBroadcast({ active = true, map }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;

    if (active) {
      const playPromise = video.play();
      if (playPromise) {
        playPromise
          .then(() => {
            setReady(true);
            attachAmbientVideo(video);
          })
          .catch(() => {
            // Autoplay with audio was blocked; muted playback will still render
            video.muted = true;
            video.play().then(() => setReady(true)).catch(() => null);
          });
      }

      // First click anywhere on the page unlocks Web Audio if initial autoplay was silenced
      const unlockAudio = () => {
        attachAmbientVideo(video);
        window.removeEventListener('pointerdown', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio);

      return () => {
        window.removeEventListener('pointerdown', unlockAudio);
      };
    } else {
      video.pause();
      detachAmbientVideo();
    }
  }, [active, reducedMotion]);

  // Clean up audio on unmount
  useEffect(() => () => detachAmbientVideo(), []);

  return (
    <div className={styles.ambient} aria-hidden="true" style={map ? { '--map': `url(${map})` } : undefined}>
      {map && <div className={styles.mapFallback} />}
      {!reducedMotion && (
        <video
          ref={videoRef}
          className={styles.video}
          data-visible={ready && active}
          src={assetPath(VOD_SRC)}
          autoPlay
          loop
          playsInline
          muted
          crossOrigin="anonymous"
          preload="auto"
          onPlaying={() => setReady(true)}
        />
      )}
    </div>
  );
}
