import { useEffect, useMemo, useRef, useState } from 'react';
import allCards from '../../shared/src/data/cards.json';
import PlayerCard from '../../shared/src/components/PlayerCard';
import SpecialtyIcon from '../../shared/src/components/SpecialtyIcon';
import { SPECIALTIES } from '../../shared/src/data/specialties';
import { STAT_KEYS, STAT_LABELS } from '../../shared/src/data/statFields';
import { CHIP_KEYS } from '../chip3d/chipData';
import { BOARD_SKILLS, bestPlacement, bestRotate, resolveBoard } from '../engine/board/board';
import { mulberry32 } from '../../shared/src/engine/perfectRun';
import { MAP_LANES } from '../engine/board/mapLanes';
import {
  EVO_CHIPS, EVO_KEYS, commitEvolution, evoStatGain, isEligibleForEvo, newClub, squadCards, xpPerPoint,
} from '../engine/club/season';
import EvoShowcase from '../evo3d/EvoShowcase';
import EvoBoardBench from '../table3d/EvoBoardBench';
import BoardSeries from '../components/BoardSeries';
import { dealSeries, namedSeriesMaps, roundBoard } from '../prototype/boardSetup';
import { EvoChip } from '../chip3d/EvoChip';
import { ChipPick, Result, Train } from './Club';
import styles from './EvoLab.module.css';

// The evo codex: every evo at every stage, then the real game screens it shows
// up on, running against a mock club so they can be clicked through.

const PLAYERS = ['gMd', 'Boaster', 'SugarZ3ro', 'Derke', 'Demon1', 'Chronicle', 'Leo', 'Less']
  .map(name => allCards.find(card => card.player === name))
  .filter(Boolean);
const STAGES = [{ id: 0, label: 'Base' }, { id: 1, label: 'Evo I' }, { id: 2, label: 'Evo II' }];
const SCREEN = { w: 1280, h: 760 };

/** A fresh club with `card` first in the squad and the evo at `stage`. */
function mockClub(card, evoKey, stage) {
  const evo = EVO_CHIPS[evoKey];
  const rest = allCards.filter(other => other.id !== card.id && other.league === 'vct' && other.rating <= 82).slice(0, 6).map(other => other.id);
  let state = newClub({ seed: 4242, name: 'Lab Club', picks: [card.id, ...rest], cards: allCards, crest: 'shield', tone: 'red' });
  state = { ...state, trainingTapes: { positioning: 1 }, evoInventory: [evoKey], activeEvo: null };
  if (stage === 0) return state;
  // Stage 1 is mid-evo: level one done, level two one match short.
  const l1Gains = evoStatGain(card.rating, evo.requirements?.maxRating, evo.level1.stats);
  const stats = { ...l1Gains };
  if (stage === 2) {
    const l1Ovr = Math.round(Object.values(l1Gains).reduce((a, b) => a + b, 0) / 5);
    const l2Gains = evoStatGain(card.rating + l1Ovr, evo.requirements?.maxRating, evo.level2.stats);
    for (const [key, value] of Object.entries(l2Gains)) stats[key] = (stats[key] ?? 0) + value;
  }
  const training = { stats, skills: stage === 2 ? [evo.level2.skill] : [], evoTheme: evo.theme, evoLevel: stage, evoBadge: stage === 2 ? evo.badge : null, evolutions: stage === 2 ? [evoKey] : [] };
  return {
    ...state,
    evoInventory: [],
    training: { ...state.training, [card.id]: training },
    activeEvo: stage === 1 ? { cardId: card.id, evoKey, level: 2, progress: evo.level2.count - 1, l1Progress: evo.level1.count, l2Progress: evo.level2.count - 1, l1Done: true, l2Done: false } : null,
  };
}

function chipOffer(evoKey) {
  const evo = EVO_CHIPS[evoKey];
  return {
    stage: 'Final',
    floor: 0,
    attempt: 0,
    options: [
      { uid: 'lab-a', key: CHIP_KEYS[0] },
      { uid: `lab-evo-${evoKey}`, kind: 'evo', key: evoKey, name: evo.name, tier: evo.tier, theme: evo.theme, badge: evo.badge, color: evo.color, evo: true },
      { uid: 'lab-b', key: CHIP_KEYS[3] },
    ],
  };
}

// A real game screen at desktop size, scaled down into the page. The game's
// screens are position: fixed, and the transform makes this box their viewport.
function Screen({ label, children }) {
  const boxRef = useRef(null);
  const [k, setK] = useState(0.5);
  useEffect(() => {
    const box = boxRef.current;
    const sizer = new ResizeObserver(([entry]) => setK(entry.contentRect.width / SCREEN.w));
    sizer.observe(box);
    return () => sizer.disconnect();
  }, []);
  return (
    <figure className={styles.screen}>
      <figcaption>{label}</figcaption>
      <div ref={boxRef} className={styles.screenBox} style={{ aspectRatio: `${SCREEN.w} / ${SCREEN.h}` }}>
        <div className={styles.screenView} style={{ width: SCREEN.w, height: SCREEN.h, transform: `scale(${k})` }}>{children}</div>
      </div>
    </figure>
  );
}

const noop = () => {};

export default function EvoLab() {
  const [player, setPlayer] = useState(PLAYERS[0]);
  const [evoKey, setEvoKey] = useState('glacier');
  const [stage, setStage] = useState(2);
  const evo = EVO_CHIPS[evoKey];
  const fit = isEligibleForEvo(player, evoKey);

  // Every evo on this player at the chosen stage, read through the club engine
  // so the numbers are the ones the game would show.
  const cards = useMemo(() => Object.fromEntries(EVO_KEYS.map(key => [key, squadCards(mockClub(player, key, stage), allCards)[0]])), [player, stage]);
  const card = cards[evoKey];

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1>Evo lab</h1>
        <p className={styles.hint}>Every evo at every stage, and the screens it shows up on.</p>
      </header>

      <section className={styles.switches} aria-label="Preview">
        <div className={styles.switch} role="group" aria-label="Player">
          <span>Player</span>
          {PLAYERS.map(item => <button key={item.id} type="button" data-on={player.id === item.id || undefined} aria-pressed={player.id === item.id} onClick={() => setPlayer(item)}>{item.player} ({item.rating})</button>)}
        </div>
        <div className={styles.switch} role="group" aria-label="Stage">
          <span>Stage</span>
          {STAGES.map(item => <button key={item.id} type="button" data-on={stage === item.id || undefined} aria-pressed={stage === item.id} onClick={() => setStage(item.id)}>{item.label}</button>)}
        </div>
      </section>

      <ul className={styles.codex}>
        {EVO_KEYS.map(key => {
          const def = EVO_CHIPS[key];
          const skill = SPECIALTIES[def.level2.skill];
          return (
            <li key={key}>
              <button type="button" className={styles.entry} data-on={evoKey === key || undefined} aria-pressed={evoKey === key} onClick={() => setEvoKey(key)}>
                <span className={styles.entryCard}><PlayerCard card={cards[key]} displayScale={0.34} tilt={false} canDrag={false} showSpecialties={stage === 2} /></span>
                <span className={styles.entryHead}>
                  <EvoChip evoKey={key} size={64} />
                  <span>
                    <span className={styles.tier} data-tier={def.tier}>{def.tier}</span>
                    <b className={styles.entryName}>{def.name}</b>
                  </span>
                </span>
                <span className={styles.skill} style={{ color: skill.color }}><SpecialtyIcon spec={skill.key} size={18} /><b>{skill.code}</b><span>{skill.name}</span></span>
                <dl>
                  <div><dt>Takes</dt><dd>{def.requirements.roles ? def.requirements.roles.join(', ') : 'Any role'}, {def.requirements.maxRating} ceiling</dd></div>
                  <div><dt>Evo I</dt><dd>{def.level1.label}</dd></div>
                  <div><dt>Evo II</dt><dd>{def.level2.label}</dd></div>
                </dl>
              </button>
            </li>
          );
        })}
      </ul>

      <section className={styles.focus} aria-label={`${evo.name} on ${player.player}`}>
        <div className={styles.focusCard}>
          <EvoShowcase key={`${evoKey}-${stage}-${player.id}`} card={card} displayScale={0.62} tilt={EVO_CHIPS[evoKey]?.tier !== 'apex'} />
        </div>
        <div className={styles.focusBody}>
          <span className={styles.tier} data-tier={evo.tier}>{evo.tier}</span>
          <h2>{evo.name}</h2>
          <div>
            {fit.capped
              ? <span className={styles.badgeCapped}>Ceiling reached: {player.rating} / {evo.requirements.maxRating} (Skill only)</span>
              : fit.eligible
                ? <span className={styles.badgeEligible}>Eligible: full stats and skill</span>
                : <span className={styles.badgeCapped}>{fit.reason}</span>}
          </div>
          <table className={styles.gainTable}>
            <tbody>
              {STAT_KEYS.map(key => <Gain key={key} label={STAT_LABELS[key]} from={player.stats[key]} to={card.stats[key]} />)}
              <Gain label="OVR" from={player.rating} to={card.rating} />
            </tbody>
          </table>
        </div>
      </section>

      <EvoBoardBench key={`${card.id}-${evoKey}-${stage}`} card={card} defaultSkill={evo.level2.skill} />

      <section className={styles.balanceGrid} aria-label="Progression balance">
        <article className={styles.balanceCard}>
          <h3>Soft rating ceiling</h3>
          <dl>
            <div>
              <dt>Status on {player.player} ({player.rating} OVR)</dt>
              <dd>{fit.capped ? `Rating cap reached (${player.rating} / ${evo.requirements.maxRating}): unlocks ${SPECIALTIES[evo.level2.skill].name} skill and theme without stat inflation` : fit.eligible ? `Below ceiling (${player.rating} / ${evo.requirements.maxRating}): gains full stats and skill` : fit.reason}</dd>
            </div>
            <div>
              <dt>Fix applied</dt>
              <dd>No lockout: high-rated or leveled players can always evolve to earn skills and themes.</dd>
            </div>
          </dl>
        </article>

        <article className={styles.balanceCard}>
          <h3>XP curve ({xpPerPoint(player.rating)} XP target)</h3>
          <dl>
            <div>
              <dt>Rookies (&lt;75 OVR)</dt>
              <dd>150 XP per point for fast early progression</dd>
            </div>
            <div>
              <dt>Starters (75 to 81 OVR)</dt>
              <dd>250 XP per point for steady development</dd>
            </div>
            <div>
              <dt>Stars (82+ OVR)</dt>
              <dd>400 XP per point to prevent rapid stat ballooning</dd>
            </div>
          </dl>
        </article>

        <article className={styles.balanceCard}>
          <h3>Pack economy</h3>
          <dl>
            <div>
              <dt>In-season silver packs</dt>
              <dd>Awarded on 2-0 sweeps, derby weeks (W5 and W9), and playoff wins</dd>
            </div>
            <div>
              <dt>Regular 2-1 series</dt>
              <dd>Tapes, XP, and tactic chips (no silver pack)</dd>
            </div>
            <div>
              <dt>Transfer budget</dt>
              <dd>6 silver packs baseline at year end (up from 3) for contract renewals</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className={styles.inGame} aria-label="In game">
        <h2>In game</h2>
        <div className={styles.screens}>
          <Screen label="Chip draft, after a won series">
            <LabChipPick key={evoKey} player={player} evoKey={evoKey} />
          </Screen>
          <Screen label={stage === 0 ? 'Training, chip banked' : stage === 1 ? 'Training, Evo I done' : 'Training, evo finished'}>
            <LabTrain key={`${evoKey}-${stage}-${player.id}`} player={player} evoKey={evoKey} stage={stage} />
          </Screen>
          {stage > 0 && (
            <Screen label={`Series result, ${stage === 1 ? 'Evo I' : 'Evo II'} reached`}>
              <LabResult key={`${evoKey}-${stage}-${player.id}`} player={player} evoKey={evoKey} stage={stage} />
            </Screen>
          )}
          <Screen label="Match board, evo skill in play">
            <LabBoard key={`${evoKey}-${stage}-${player.id}`} card={card} evoKey={evoKey} />
          </Screen>
        </div>
      </section>
    </main>
  );
}

// Whether a resolved board shows `skill` doing its thing for your side.
const FIRED = {
  black_hole: r => r.displacements.some(d => d.side === 'them'),
  velocity: r => r.velocityMoves.some(m => m.side === 'you'),
  combustion: r => r.effects.some(e => e.key === 'combustion' && e.side === 'you'),
  surge: r => r.effects.some(e => e.key === 'surge' && e.side === 'you'),
  ascendance: r => r.effects.some(e => e.key === 'ascendance' && e.side === 'you'),
  overdrive: r => r.effects.some(e => e.key === 'overdrive' && e.side === 'you'),
  phase: r => r.lanes.some(l => l.theirs.steps.some(s => s.voided)),
  ironclad: r => r.lanes.some(l => l.mine.steps.some(s => s.key === 'ironclad')),
  lurk: r => r.lanes.some(l => l.mine.steps.some(s => s.key === 'lurk')),
  dominion: r => r.lanes.some(l => l.weight === 2 && l.winner === 'you'),
};

const MAP_NAMES = ['Ascent', 'Ascent', 'Ascent'];

// A deal where the evo's skill fires in the first round, so its board beat can be
// watched: the seed and your placement, found by playing the round in the engine
// the way the board will (the enemy places and rotates as the game's bot does).
function firingDeal(card, skillKey) {
  const rest = allCards.filter(c => c.id !== card.id && c.league === 'vct' && c.rating >= 74).slice(0, 4);
  const you = [card, ...rest];
  const fired = FIRED[skillKey];
  for (let seed = 4242; seed < 4242 + (fired ? 160 : 1); seed += 1) {
    const deal = dealSeries(seed, 3);
    const maps = namedSeriesMaps(seed, MAP_NAMES);
    const game = roundBoard({ seed, round: 0, map: maps[0], you, them: deal.them, tactics: deal.tactics });
    const opp = bestPlacement({ roster: deal.them, maps: game.maps, tactics: game.opponentTactics, rng: mulberry32(game.seed + 1) });
    const mine = { roster: you, slots: bestPlacement({ roster: you, maps: game.maps }).slots, tactics: [] };
    const theirs = { roster: deal.them, slots: opp.slots, tactics: opp.tactics };
    const result = resolveBoard({ maps: game.maps, you: mine, them: { ...theirs, slots: bestRotate({ you: theirs, them: mine, maps: game.maps }) } });
    if (!fired || fired(result)) return { ...deal, seed, you, slots: mine.slots, fires: Boolean(fired) };
  }
  return { ...dealSeries(4242, 3), seed: 4242, you, slots: bestPlacement({ roster: you, maps: MAP_LANES[MAP_NAMES[0]] }).slots, fires: false };
}

function LabBoard({ card, evoKey }) {
  const [stage, setStage] = useState(null);
  const [take, setTake] = useState(0);
  const evo = EVO_CHIPS[evoKey];
  const skillKey = evo?.level2?.skill || 'anchor';
  const skill = BOARD_SKILLS[skillKey];

  const series = useMemo(() => firingDeal(card, skillKey), [card, skillKey]);

  // Chronos works on the series, so its trigger plays the rewind itself, then deals again.
  const triggerAnimation = () => {
    if (skillKey === 'timewarp') stage?.rewind?.(card.id).then(() => setTake(n => n + 1));
    else stage?.fireSkill?.(card.id);
  };

  return (
    <div className={styles.realBoardHost}>
      <div className={styles.realBoardBar}>
        <div className={styles.realBoardInfo}>
          <b>{skill?.label ?? 'Evo Skill'}</b>
          <span>{skill?.text ?? ''}</span>
        </div>
        <button type="button" className={styles.realBoardTriggerBtn} onClick={triggerAnimation}>
          Trigger {skill?.label ?? 'skill'} animation
        </button>
      </div>
      <div className={styles.realBoardStage}>
        <BoardSeries
          key={`${card.id}-${evoKey}-${card.rating}-${take}`}
          squad={series.you}
          opponent={series.them}
          opponentName={series.opponentName}
          bestOf={3}
          seed={series.seed}
          hand={series.tactics}
          mapNames={MAP_NAMES}
          onDone={noop}
          three
          arena="tint"
          initialSlots={series.slots}
          onStageReady={setStage}
        />
      </div>
    </div>
  );
}

function Gain({ label, from, to }) {
  const up = to - from;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{from}</td>
      <td className={styles.to}>{to}</td>
      <td className={styles.up} data-zero={up === 0 || undefined}>{up > 0 ? `+${up}` : up}</td>
    </tr>
  );
}

function LabChipPick({ player, evoKey }) {
  const [state, setState] = useState(() => ({ ...mockClub(player, evoKey, 0), chipOffer: chipOffer(evoKey), hand: [] }));
  return <ChipPick state={state} squad={squadCards(state, allCards)} onTake={() => setState(s => ({ ...s, chipOffer: chipOffer(evoKey) }))} onPass={noop} onReroll={noop} onBack={noop} />;
}

// The series that finished the stage: a won Bo3 with the evolving player as MVP.
function LabResult({ player, evoKey, stage }) {
  const [state] = useState(() => {
    const club = mockClub(player, evoKey, stage);
    const evo = EVO_CHIPS[evoKey];
    const level = stage === 2 ? evo.level2 : evo.level1;
    const squad = club.squad.slice(0, 5);
    const l1Gains = evoStatGain(player.rating, evo.requirements?.maxRating, evo.level1.stats);
    const l1Ovr = Math.round(Object.values(l1Gains).reduce((a, b) => a + b, 0) / 5);
    const gainedStats = stage === 2
      ? evoStatGain(player.rating + l1Ovr, evo.requirements?.maxRating, level.stats)
      : l1Gains;
    return {
      ...club,
      last: {
        opponent: club.clubs[0].id,
        stage: 'Week 3',
        won: true,
        packs: 1,
        rounds: [{ map: 'Ascent', a: 13, b: 9, winA: true }, { map: 'Bind', a: 11, b: 13, winA: false }, { map: 'Haven', a: 13, b: 7, winA: true }],
        growth: squad.map((id, i) => ({ id, pct: 30 + i * 12, gain: 14, targetXp: xpPerPoint(player.rating), mvp: id === player.id })),
        evoProgress: { cardId: player.id, evoKey, level: stage, completed: true, name: evo.name, gainedStats, skill: stage === 2 ? level.skill : undefined },
      },
    };
  });
  return <Result state={state} size={{ scale: 0.36 }} onContinue={noop} />;
}

function LabTrain({ player, evoKey, stage }) {
  const [state, setState] = useState(() => mockClub(player, evoKey, stage));
  return (
    <Train
      state={state}
      size={{ scale: 0.36 }}
      initialFocus={stage === 2 ? 'tape:positioning' : 'evo'}
      onBack={noop}
      onTape={noop}
      onEvo={(cardId, key) => setState(s => commitEvolution(s, cardId, key))}
    />
  );
}
