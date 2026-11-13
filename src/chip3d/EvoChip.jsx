// An evo chip is its own kind of chip, cut from its evo's card: a hexagon
// like the card's silhouette, with thickness, the evo's motif printed on the
// face, the skill it teaches as a crest in the middle, and a rim that follows
// the card frames' grammar (one rule for common, two and a sheen for rare, a
// gold bezel with rubies, a crest and a running light for apex).
import { useId } from 'react';
import { EVO_ART, evoFace } from '../../shared/src/components/evoArt';
import SpecialtyIcon from '../../shared/src/components/SpecialtyIcon';
import { SPECIALTIES } from '../../shared/src/data/specialties';
import { STAT_LABELS } from '../../shared/src/data/statFields';
import { EVO_CHIPS, isEligibleForEvo } from '../engine/club/season';
import Chip3D from './Chip3D';
import help from './ChipHelp.module.css';
import styles from './EvoChip.module.css';
import GameIcon from '../components/GameIcon';

const statGain = stats => Object.entries(stats).map(([key, value]) => `+${value} ${STAT_LABELS[key]}`).join(', ');
const evoTakes = evo => `${evo.requirements.roles ? evo.requirements.roles.join(' or ') : 'Any role'}, ${evo.requirements.maxRating} ceiling`;

const HEX = [[50, 3], [93, 25], [93, 75], [50, 97], [7, 75], [7, 25]];
const hex = (k = 1, dy = 0) => HEX.map(([x, y]) => `${(50 + (x - 50) * k).toFixed(1)},${(50 + (y - 50) * k + dy).toFixed(1)}`).join(' ');
const DEPTH = 7;
const motifCache = new Map();
const motifUri = theme => {
  if (!motifCache.has(theme)) motifCache.set(theme, `data:image/svg+xml,${encodeURIComponent(evoFace(theme, 2).back)}`);
  return motifCache.get(theme);
};

/**
 * The evo chip, lit in 3D by the same shared renderer as the tactic chips
 * (evoChip3d.js builds it). `size` is its width in px. Without WebGL it falls
 * back to the flat print below.
 */
export function EvoChip({ evoKey, size = 150, phase = 0 }) {
  const evo = EVO_CHIPS[evoKey];
  const face = { evo: { theme: evo.theme, badge: evo.badge, skill: evo.level2.skill }, headline: evo.badge };
  return <Chip3D face={face} size={size} phase={phase} fallback={<EvoChipFlat evoKey={evoKey} size={size} />} />;
}

function EvoChipFlat({ evoKey, size }) {
  const uid = useId().replace(/:/g, '');
  const evo = EVO_CHIPS[evoKey];
  const art = EVO_ART[evo.theme];
  const skill = SPECIALTIES[evo.level2.skill];
  const tier = art.tier;
  const metal = tier === 'apex' ? `url(#${uid}g)` : art.metal[1];
  const icon = 32;
  return (
    <svg className={styles.chip} data-tier={tier} viewBox="-6 -8 112 124" width={size} height={size * 124 / 112} aria-hidden="true">
      <defs>
        <clipPath id={`${uid}c`}><polygon points={hex()} /></clipPath>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1c2" /><stop offset=".45" stopColor="#d9a84a" /><stop offset="1" stopColor="#8a5a1c" /></linearGradient>
        {/* A tight outline in the evo's darkest tone, so the crest reads on the motif without a plate. */}
        <filter id={`${uid}h`} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="grow" />
          <feFlood floodColor={art.floor} />
          <feComposite in2="grow" operator="in" result="halo" />
          <feMerge><feMergeNode in="halo" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      {/* thickness */}
      <polygon points={hex(1, DEPTH)} fill={art.floor} stroke={tier === 'apex' ? '#8a5a1c' : art.metal[0]} strokeWidth={tier === 'apex' ? 5 : 2} strokeLinejoin="round" />
      {/* face: the evo's motif */}
      <polygon points={hex()} fill={art.bg[1]} />
      <g clipPath={`url(#${uid}c)`}>
        <image href={motifUri(evo.theme)} x="-4" y="-8" width="108" height="156.6" preserveAspectRatio="none" />
        {tier !== 'common' && <rect className={styles.sheen} x="-60" y="-10" width="40" height="130" fill={`url(#${uid}s)`} transform="rotate(20 50 50)" />}
      </g>
      {/* the skill crest, outlined instead of plated */}
      <g filter={`url(#${uid}h)`}>
        <g transform={`translate(${50 - icon / 2} ${50 - icon / 2 - 6})`} style={{ color: art.metal[1] }}><SpecialtyIcon spec={skill.key} size={icon} /></g>
        <text x="50" y="70" textAnchor="middle" fill={art.metal[1]} style={{ font: '700 11px var(--font-mono)' }} letterSpacing=".08em">{skill.code}</text>
      </g>
      {/* rim */}
      {tier === 'common' && <polygon points={hex()} fill="none" stroke={art.metal[0]} strokeWidth="2.5" strokeLinejoin="round" />}
      {tier === 'rare' && (
        <>
          <polygon points={hex()} fill="none" stroke={art.metal[1]} strokeWidth="3" strokeLinejoin="round" />
          <polygon points={hex(.88)} fill="none" stroke={art.metal[0]} strokeWidth="1.1" strokeLinejoin="round" />
        </>
      )}
      {tier === 'apex' && (
        <>
          <polygon points={hex()} fill="none" stroke={metal} strokeWidth="7" strokeLinejoin="round" />
          <polygon points={hex(.86)} fill="none" stroke="#8a5a1c" strokeWidth="1" strokeLinejoin="round" />
          <polygon className={styles.comet} points={hex()} pathLength="100" fill="none" stroke="#fff2dc" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {[[7, 50], [93, 50]].map(([x, y]) => {
            const gemColor = evo.theme === 'sovereign' ? '#9333ea' : evo.theme === 'singularity' ? '#0891b2' : evo.theme === 'valkyrie' ? '#e11d48' : '#c8102e';
            return <polygon key={x} points={`${x},${y - 7} ${x + 3},${y} ${x},${y + 7} ${x - 3},${y}`} fill={gemColor} stroke="#ffe9a8" strokeWidth=".6" />;
          })}
          <polygon points="41,4 50,-6 59,4 50,13" fill={art.bg[1]} stroke={metal} strokeWidth="2" />
          <polygon points="46.5,-1 48.5,-1 49.6,8" fill={art.metal[1]} /><polygon points="51.5,-1 53.5,-1 50.4,8" fill={art.metal[1]} />
        </>
      )}
    </svg>
  );
}

/** Takes, then what each stage needs: label and value rows like the rest of the club. */
export function EvoFacts({ evoKey }) {
  const evo = EVO_CHIPS[evoKey];
  return (
    <dl className={styles.facts}>
      <div><dt>Takes</dt><dd>{evoTakes(evo)}</dd></div>
      <div><dt>Evo I</dt><dd>{evo.level1.label}</dd></div>
      <div><dt>Evo II</dt><dd>{evo.level2.label}</dd></div>
    </dl>
  );
}

/** Who in this squad can take it. */
export function EvoFits({ evoKey, roster }) {
  const fits = (roster ?? []).filter(card => isEligibleForEvo(card, evoKey).eligible);
  const names = fits.slice(0, 2).map(card => card.player).join(', ') + (fits.length > 2 ? ` +${fits.length - 2}` : '');
  return <p className={help.plan} data-fits={fits.length > 0 || undefined}>{fits.length ? `Fits ${names}` : 'Nobody in your squad fits'}</p>;
}

export function EvoNoteButton({ evoKey, className = '' }) {
  const id = useId();
  const evo = EVO_CHIPS[evoKey];
  const skill = SPECIALTIES[evo.level2.skill];
  return (
    <>
      <button type="button" className={`${help.q} ${help.noteButton} ${className}`} popoverTarget={id} aria-label={`${evo.name}: details`}>?</button>
      <div id={id} popover="auto" className={help.note}>
        <header className={help.guideHead}>
          <h2>{evo.name}</h2>
          <button type="button" className={help.close} popoverTarget={id} popoverTargetAction="hide" aria-label="Close"><GameIcon name="close" size={18} /></button>
        </header>
        <p className={help.effect}>{skill.name}: {skill.desc}</p>
        <dl className={help.detail}>
          <div><dt>Takes</dt><dd>{evoTakes(evo)}</dd></div>
          <div><dt>Evo I</dt><dd>{evo.level1.label}. {statGain(evo.level1.stats)}.</dd></div>
          <div><dt>Evo II</dt><dd>{evo.level2.label}. {statGain(evo.level2.stats)} and {skill.name}.</dd></div>
        </dl>
      </div>
    </>
  );
}
