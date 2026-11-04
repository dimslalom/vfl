import { useRef, useState } from 'react';
import PlayerCard from '../../shared/src/components/PlayerCard';
import { assetPath } from '../../shared/src/lib/utils';
import { t } from '../lib/i18n';
import { shareNode } from '../lib/shareImage';
import TacticalButton from './TacticalButton';
import styles from './RunReceipt.module.css';

const SITE = 'vctfantasy.dimas.works';

// A result worth sending to a group chat, in the same HUD as the game. `stats`
// are { label, value }. `url` goes with the image: for a run it is a challenge
// link, so the person who gets it can play the same draw.
export default function RunReceipt({ title, kicker, stats, players = [], crest = null, url, fileName }) {
  const node = useRef(null);
  const [state, setState] = useState('idle'); // idle | busy | failed

  async function share() {
    setState('busy');
    try {
      await shareNode(node.current, { fileName, url });
      setState('idle');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className={styles.wrap}>
      <article ref={node} className={styles.receipt}>
        <header className={styles.head}>
          <img className={styles.logo} src={assetPath('/assets/brand/gauntlet-logotype.webp')} alt="Gauntlet" />
          {crest && <img className={styles.crest} src={crest} alt="" />}
        </header>
        <span className={styles.kicker}>{kicker}</span>
        <h3 className={styles.title}>{title}</h3>
        <dl className={styles.stats}>
          {stats.map(stat => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
        {players.length > 0 && (
          <div className={styles.players}>
            {players.map(card => (
              <PlayerCard key={card.id} card={card} displayScale={0.15} tilt={false} canDrag={false} showSpecialties={false} />
            ))}
          </div>
        )}
        <footer className={styles.foot}>{SITE}</footer>
      </article>
      <TacticalButton className={styles.share} onClick={share} disabled={state === 'busy'}>
        {state === 'busy' ? t('Making image…') : t('Share result')}
      </TacticalButton>
      {state === 'failed' && <p className={styles.failed} role="alert">{t('Could not make the image. Try again.')}</p>}
    </div>
  );
}
