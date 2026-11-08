import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import allCards from '../../../shared/src/data/cards.json';
import { STAT_LABELS_FULL } from '../../../shared/src/data/statFields';
import PlayerCard from '../../../shared/src/components/PlayerCard';
import useReducedMotion from '../../../shared/src/lib/useReducedMotion';
import { assetPath } from '../../../shared/src/lib/utils';
import { ChipFlat } from '../../chip3d/Chip3D';
import ClubLogo from '../ClubLogo';
import boardStyles from '../BoardSeries.module.css';
import { isLegalPlacement, resolveBoard, rotate, sideScores, winsNeeded } from '../../engine/board/board';
import { CONTRACT_MAX, STARTERS, clubById, finishSeries, newClub, nextMatch, standings } from '../../engine/club/season';
import { TIER_META } from '../../engine/endless/ladder';
import { t } from '../../lib/i18n';
import { playUiSound } from '../../lib/uiSound';
import club from '../../pages/Club.module.css';
import { dealSeries, namedSeriesMaps, roundBoard } from '../../prototype/boardSetup';
import { DEFAULT_MAP, SHOWCASE } from './clubSummary';
import styles from './ClubEntry.module.css';

const initials = name => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();

function SelectionCorners() {
  return <span className={club.brackets} aria-hidden="true"><i /><i /><i /><i /></span>;
}

function Crest({ club: rival, size }) {
  return (
    <span className={club.crestDisc} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      {rival.logo ? <img src={assetPath(rival.logo)} alt="" /> : initials(rival.name)}
    </span>
  );
}

function Pips({ total, won, side }) {
  return (
    <span className={boardStyles.pips} data-side={side} aria-hidden="true">
      {Array.from({ length: total }, (_, index) => <i key={index} data-on={index < won || undefined} />)}
    </span>
  );
}

function usePrimerScale() {
  const read = () => {
    if (typeof window === 'undefined') return { squadScale: 0.25, boardCardScale: 0.145, phone: false };
    const { innerWidth: w, innerHeight: h } = window;
    const phone = w < 760;
    const room = phone ? w - 32 : Math.min(w, 1280) - 96;
    const slotW = phone ? (room - 32) / 3 : (room - 64) / 5;
    const maxH = phone ? (h - 380) / 1150 : (h - 340) / 860;
    const squadScale = Math.max(0.14, Math.min(phone ? 0.22 : 0.28, slotW / 400, maxH));
    const boardCardScale = phone ? 0.105 : Math.max(0.125, Math.min(0.16, (h - 360) / 3200));
    return { squadScale, boardCardScale, phone };
  };
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const onResize = () => setScale(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

// ── Step 1: Real Starting Five / Squad UI with live IGL swap animation ──────

function PrimerSquad() {
  const reducedMotion = useReducedMotion();
  const { squadScale } = usePrimerScale();
  const [roster, setRoster] = useState(() => SHOWCASE.slice(0, STARTERS));
  const [selected, setSelected] = useState(() => SHOWCASE[0].id);
  const [moving, setMoving] = useState(false);
  const [userTouched, setUserTouched] = useState(false);

  const selectedIndex = Math.max(0, roster.findIndex(card => card.id === selected));
  const activePlayer = roster[selectedIndex] ?? roster[0];

  useEffect(() => {
    if (reducedMotion || userTouched) return undefined;
    let stepIndex = 0;
    const targets = [1, 2, 3, 4];
    const timer = setInterval(() => {
      const pickPos = targets[stepIndex % targets.length];
      const stage = stepIndex % 3;
      if (stage === 0) {
        setSelected( curr => {
          const targetCard = roster[pickPos] ?? roster[1];
          return targetCard ? targetCard.id : curr;
        });
        setMoving(false);
      } else if (stage === 1) {
        setMoving(true);
      } else {
        setRoster(prev => {
          const idx = prev.findIndex(card => card.id === selected);
          const from = idx > 0 ? idx : 1;
          const next = [...prev];
          [next[0], next[from]] = [next[from], next[0]];
          return next;
        });
        setMoving(false);
      }
      stepIndex += 1;
    }, 1250);
    return () => clearInterval(timer);
  }, [reducedMotion, userTouched, roster, selected]);

  const tap = (position) => {
    setUserTouched(true);
    if (moving && position !== selectedIndex) {
      playUiSound(position === 0 || selectedIndex === 0 ? 'igl' : 'drop');
      const next = [...roster];
      [next[selectedIndex], next[position]] = [next[position], next[selectedIndex]];
      setRoster(next);
      setMoving(false);
      return;
    }
    if (position === selectedIndex) {
      playUiSound(moving ? 'drop' : 'select');
      setMoving(!moving);
      return;
    }
    playUiSound('select');
    setSelected(roster[position].id);
    setMoving(true);
  };

  return (
    <div className={styles.primerSquadStage}>
      <section className={club.homeSquad} aria-label={t('Starting five')}>
        <div className={styles.primerSquadBar}>
          <span className={club.groupLabel}>{t('Starting five')}</span>
          <button
            type="button"
            className={`${club.eafcSignBtn} ${styles.primerSwapBtn}`}
            onClick={() => {
              setUserTouched(true);
              playUiSound(moving ? 'drop' : 'select');
              setMoving(!moving);
            }}
          >
            {moving ? t('Cancel swap') : `${t('Swap')} ${activePlayer.player}`}
          </button>
        </div>
        <div className={`${club.homeRow} ${styles.primerHomeRow}`}>
          {roster.map((card, position) => {
            const years = position === 4 ? 1 : CONTRACT_MAX;
            const held = moving && position === selectedIndex;
            const swapTarget = moving && position !== selectedIndex;
            return (
              <div
                key={card.id}
                className={`${club.slot} ${club.windowSlot} ${ club.dealt}`}
                style={{ '--deal': position }}
                data-held={held || undefined}
                data-moving={swapTarget || undefined}
                data-swap-target={swapTarget || undefined}
              >
                <span className={club.slotTop}>
                  <b data-lit={position === 0 || undefined}>{position === 0 ? 'IGL' : card.role}</b>
                  {years === 1 && <em data-lit="true">{t('Last year')}</em>}
                </span>
                <div className={club.slotCard}>
                  <PlayerCard
                    card={card}
                    displayScale={squadScale}
                    isIgl={position === 0}
                    tilt
                    canDrag={false}
                    onClick={() => tap(position)}
                    pressScale={0.97}
                  />
                  {position === selectedIndex && <SelectionCorners />}
                </div>
                <span className={club.years} role="img" aria-label={`${years} contract years`}>
                  {Array.from({ length: CONTRACT_MAX }, (_, idx) => (
                    <i key={idx} data-on={idx < years || undefined} data-last={years === 1 || undefined} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Step 2: Real 3-lane Match Board (TableStage + synchronized board UI) ────

const DEMO_PLACEMENTS = [0, 0, 1, 2, 2];
const DEMO_ROTATED = [0, 1, 1, 2, 2];

function PrimerBoard() {
  const reducedMotion = useReducedMotion();
  const { boardCardScale } = usePrimerScale();
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const barRef = useRef(null);
  const [webglReady, setWebglReady] = useState(false);

  const demo = useMemo(() => {
    const dealt = dealSeries(202605, 3);
    const [map] = namedSeriesMaps(202605, ['Ascent']);
    const you = SHOWCASE.slice(0, STARTERS);
    const them = dealt.them;
    const tactics = [
      { uid: 'primer_t0', key: 'pocket', source: 'owned' },
      { uid: 'primer_t1', key: 'defaults', source: 'owned' },
    ];
    const game = roundBoard({ seed: 202605, round: 0, map, you, them, tactics });
    const enemySlots = [0, 1, 1, 0, 2];
    const enemyTactics = [{ lane: 1, card: game.opponentTactics[0] }];
    const resolved = resolveBoard({
      maps: game.maps,
      you: { roster: you, slots: DEMO_ROTATED, tactics: [{ lane: 0, card: tactics[0] }] },
      them: { roster: them, slots: enemySlots, tactics: enemyTactics },
    });
    return {
      map,
      you,
      them,
      tactics,
      game,
      enemySlots,
      enemyTactics,
      resolved,
      opponentName: dealt.opponentName,
    };
  }, []);

  const [slots, setSlots] = useState([null, null, null, null, null]);
  const [tacticLane, setTacticLane] = useState([null, null]);
  const [phase, setPhase] = useState('place');
  const [rotated, setRotated] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [score, setScore] = useState({ you: 1, them: 0 });

  // Attempt to boot the real Three.js TableStage on hostRef
  useEffect(() => {
    let stage = null;
    let cancelled = false;
    (async () => {
      try {
        const { default: TableStage } = await import('../../table3d/TableStage.js');
        if (cancelled || !hostRef.current) return;
        stage = new TableStage(hostRef.current, {
          reducedMotion,
          arena: 'off',
          onState: (next) => {
            if (cancelled) return;
            if (next.result) {
              setOutcome(next.result);
              setScore({ you: next.result.winner === 'you' ? 2 : 1, them: next.result.winner === 'you' ? 0 : 1 });
            }
          },
        });
        if (await stage.init()) {
          if (cancelled) {
            stage.destroy();
            return;
          }
          stageRef.current = stage;
          setWebglReady(true);
          await stage.deal(demo.game).catch(() => null);
        } else {
          stage.destroy();
        }
      } catch {
        stage?.destroy();
      }
    })();
    return () => {
      cancelled = true;
      stage?.destroy();
      stageRef.current = null;
    };
  }, [demo.game, reducedMotion]);

  // Tell TableStage how much of the bottom right the action bar covers so the hand stays clear
  useEffect(() => {
    const measure = () => {
      const bar = barRef.current?.getBoundingClientRect();
      const box = hostRef.current?.getBoundingClientRect();
      if (bar && box) stageRef.current?.setReserve?.(bar.width ? box.right - bar.left : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (barRef.current) observer.observe(barRef.current);
    if (hostRef.current) observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [webglReady, phase]);

  // Automated choreography loop driving both TableStage (when WebGL is active) and state
  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const wait = (ms, fn) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    const runCycle = () => {
      setOutcome(null);
      setRotated(false);
      setScore({ you: 1, them: 0 });
      setPhase('place');
      setSlots([null, null, null, null, null]);
      setTacticLane([null, null]);

      const stage = stageRef.current;
      if (stage) {
        stage.deal(demo.game).catch(() => null);
      }

      if (reducedMotion) {
        setSlots([...DEMO_ROTATED]);
        setTacticLane([0, null]);
        setPhase('rotate');
        setRotated(true);
        return;
      }

      // Place each of the 5 starter cards across A, Mid and B
      DEMO_PLACEMENTS.forEach((lane, cardIdx) => {
        wait(450 + cardIdx * 380, () => {
          setSlots(prev => {
            const next = [...prev];
            next[cardIdx] = lane;
            return next;
          });
          const s = stageRef.current;
          if (s && s.phase === 'place') {
            s.slots[cardIdx] = lane;
            s.place();
            s.emit();
          }
        });
      });

      // Drop the Pocket Strat tactic chip onto A Site (lane 0)
      wait(2500, () => {
        setTacticLane([0, null]);
        const s = stageRef.current;
        if (s && s.phase === 'place') {
          s.setTacticLane(0, 0);
        }
      });

      // Lock in: reveal rival's 5 cards across the 3 lanes
      wait(3300, () => {
        setPhase('rotate');
        const s = stageRef.current;
        if (s && s.phase === 'place') {
          s.lockIn();
        }
      });

      // Perform IGL rotate: move starter 1 from A Site (0) to Mid (1)
      wait(4600, () => {
        setRotated(true);
        setSlots([...DEMO_ROTATED]);
        const s = stageRef.current;
        if (s && s.phase === 'rotate') {
          s.slots = rotate(s.slots, 1, 1);
          s.place();
          s.emit();
        }
      });

      // Go / Resolve lanes
      wait(5800, () => {
        setPhase('resolve');
        const s = stageRef.current;
        if (s && s.phase === 'rotate') {
          s.resolve();
        }
      });

      // Show Round Won verdict
      wait(7300, () => {
        setOutcome(demo.resolved);
        setScore({ you: 2, them: 0 });
      });

      // Restart loop
      wait(10200, runCycle);
    };

    runCycle();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [demo, reducedMotion]);

  const placedCount = slots.filter(s => s != null).length;
  const legal = isLegalPlacement(slots, demo.you);
  const revealed = phase !== 'place';

  const laneTotals = useMemo(() => {
    const myTactics = tacticLane[0] != null ? [{ lane: tacticLane[0], card: demo.tactics[0] }] : [];
    const mySide = sideScores({
      roster: demo.you,
      slots,
      maps: demo.game.maps,
      tactics: myTactics,
      enemy: revealed ? demo.enemyTactics : null,
      enemyRoster: revealed ? demo.them : null,
      enemySlots: revealed ? demo.enemySlots : null,
    });
    const theirSide = revealed
      ? sideScores({
        roster: demo.them,
        slots: demo.enemySlots,
        maps: demo.game.maps,
        tactics: demo.enemyTactics,
        enemy: myTactics,
        enemyRoster: demo.you,
        enemySlots: slots,
      })
      : demo.game.maps.map(() => ({ total: 0, steps: [] }));
    return demo.game.maps.map((laneInfo, idx) => ({
      laneInfo,
      youScore: mySide[idx]?.total ?? 0,
      themScore: theirSide[idx]?.total ?? 0,
      youSteps: mySide[idx]?.steps ?? [],
      themSteps: theirSide[idx]?.steps ?? [],
      winner: outcome?.lanes?.[idx]?.winner ?? null,
    }));
  }, [demo, slots, tacticLane, revealed, outcome]);

  const stepNow = () => {
    if (phase === 'place' && legal) {
      setPhase('rotate');
      stageRef.current?.lockIn?.();
    } else if (phase === 'rotate') {
      setPhase('resolve');
      stageRef.current?.resolve?.();
      setOutcome(demo.resolved);
      setScore({ you: 2, them: 0 });
    } else if (outcome) {
      setOutcome(null);
      setRotated(false);
      setScore({ you: 1, them: 0 });
      setPhase('place');
      setSlots([...DEMO_PLACEMENTS]);
      setTacticLane([0, null]);
    }
  };

  return (
    <div className={`${boardStyles.series} ${styles.primerSeriesWrap}`} data-layout="wide">
      <div className={boardStyles.board} ref={hostRef} />

      {/* Synchronized in-game 3-lane board stage when WebGL is unavailable */}
      {!webglReady && (
        <div className={styles.primerLiveTable}>
          <div className={styles.primerLaneGrid}>
            {laneTotals.map(({ laneInfo, youScore, themScore, youSteps, themSteps, winner }, laneIdx) => {
              const total = youScore + themScore;
              const split = total > 0 ? Math.round((youScore / total) * 100) : 50;
              const theirCards = revealed ? demo.them.filter((_, idx) => demo.enemySlots[idx] === laneIdx) : [];
              const yourCards = demo.you.map((card, idx) => ({ card, idx })).filter(item => slots[item.idx] === laneIdx);
              const hasYourChip = tacticLane[0] === laneIdx;
              const hasTheirChip = revealed && demo.enemyTactics.some(chip => chip.lane === laneIdx);
              return (
                <div
                  key={laneInfo.id}
                  className={styles.primerLaneBoard}
                  data-won={winner === 'you' ? 'true' : winner === 'them' ? 'false' : undefined}
                >
                  <div className={styles.primerLaneHeader}>
                    <b>{laneInfo.name}</b>
                    <span>{STAT_LABELS_FULL[laneInfo.stat]}</span>
                  </div>

                  <div className={styles.primerLaneSide} data-side="them">
                    {revealed ? (
                      theirCards.map(card => (
                        <div key={card.id} className={styles.primerBoardCard}>
                          <PlayerCard card={card} displayScale={boardCardScale} canDrag={false} />
                        </div>
                      ))
                    ) : (
                      <div className={styles.primerHiddenPair}>
                        <PlayerCard card={demo.them[laneIdx]} displayScale={boardCardScale} turned canDrag={false} />
                      </div>
                    )}
                  </div>

                  <div className={styles.primerTugWrap}>
                    <div className={styles.primerSegRow} data-row="them">
                      {themSteps.map((step, sIdx) => (
                        <span key={sIdx} data-solid={step.key === 'tactic' || undefined}>
                          {step.op === '×' ? `×${step.value}` : step.value}
                        </span>
                      ))}
                    </div>
                    <div className={styles.primerTugBar}>
                      <i data-side="you" style={{ width: `${youScore > 0 ? (revealed ? split : 100) : 0}%` }} />
                      {revealed && <i data-side="them" style={{ width: `${100 - split}%` }} />}
                      <b data-side="you" data-empty={youScore === 0 || undefined}>{youScore}</b>
                      {revealed && <b data-side="them">{themScore}</b>}
                      {total > 0 && revealed && <s style={{ left: `${split}%` }} />}
                      {hasYourChip && (
                        <span className={styles.primerLaneChip} data-side="you">
                          <ChipFlat chipKey={demo.tactics[0].key} size={34} />
                        </span>
                      )}
                      {hasTheirChip && (
                        <span className={styles.primerLaneChip} data-side="them">
                          <ChipFlat chipKey={demo.enemyTactics[0].card.key} size={34} />
                        </span>
                      )}
                      {winner && (
                        <em className={styles.primerLaneStamp} data-won={winner === 'you'}>
                          {winner === 'you' ? t('WON') : t('LOST')}
                        </em>
                      )}
                    </div>
                    <div className={styles.primerSegRow} data-row="you">
                      {youSteps.map((step, sIdx) => (
                        <span key={sIdx} data-solid={step.key === 'tactic' || undefined}>
                          {step.op === '×' ? `×${step.value}` : step.value}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className={styles.primerLaneSide} data-side="you">
                    {yourCards.map(({ card, idx }) => (
                      <div
                        key={card.id}
                        className={styles.primerBoardCard}
                        data-rotated={rotated && idx === 1 ? 'true' : undefined}
                      >
                        <PlayerCard card={card} displayScale={boardCardScale} isIgl={idx === 0} canDrag={false} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.primerHandTray}>
            <div className={styles.primerHandCards}>
              {demo.you.map((card, idx) => (
                slots[idx] == null && (
                  <div key={card.id} className={styles.primerHandCard}>
                    <PlayerCard card={card} displayScale={boardCardScale} isIgl={idx === 0} canDrag={false} />
                  </div>
                )
              ))}
            </div>
            <div className={styles.primerChipTray}>
              {tacticLane[0] == null && <ChipFlat chipKey={demo.tactics[0].key} size={42} />}
              <ChipFlat chipKey={demo.tactics[1].key} size={42} />
            </div>
          </div>
        </div>
      )}

      {/* Real BoardSeries top scoreboard slab */}
      <div className={`${boardStyles.head} ${styles.primerBoardHead}`}>
        <b className={boardStyles.mapTitle}>{demo.map.name}</b>
        <Pips total={winsNeeded(3)} won={score.you} side="you" />
        <small>Bo3</small>
        <Pips total={winsNeeded(3)} won={score.them} side="them" />
        <span>{demo.opponentName}</span>
      </div>

      {/* Real BoardSeries bottom action slab */}
      <div className={`${boardStyles.bar} ${styles.primerBoardBar}`} ref={barRef}>
        {phase === 'place' && (
          <button type="button" className={boardStyles.primary} disabled={!legal} onClick={stepNow}>
            {legal ? 'Lock in' : `${placedCount}/5 placed`}
          </button>
        )}
        {phase === 'rotate' && (
          <button type="button" className={boardStyles.primary} onClick={stepNow}>
            Go
          </button>
        )}
      </div>

      {/* Real BoardSeries round outcome slab */}
      {outcome && (
        <div className={`${boardStyles.outcome} ${styles.primerOutcome}`} data-won="true" role="status">
          <div className={boardStyles.outcomeStamp}>
            <span className={boardStyles.outcomeRound} aria-hidden="true">2</span>
            <span className={boardStyles.outcomeText}>
              <small>{demo.map.name}</small>
              <h2>Round won</h2>
            </span>
          </div>
          <div className={boardStyles.outcomeBody}>
            <div className={boardStyles.outcomeMetric}>
              <span>Total</span>
              <b>{outcome.youTotal}<em>–{outcome.themTotal}</em></b>
            </div>
            <button type="button" className={boardStyles.primary} onClick={stepNow}>Next round</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Real League Road, Standings Table & Playoffs Bracket ────────────

function buildSeasonTimeline() {
  const picks = SHOWCASE.slice(0, STARTERS).map(card => card.id);
  const initial = newClub({
    seed: 202605,
    name: t('Your club'),
    picks,
    cards: allCards,
    crest: 'shield',
    tone: 0,
  });

  const winOutcome = (state) => {
    const match = nextMatch(state);
    const [map1, map2] = namedSeriesMaps(202605, ['Ascent', 'Bind']);
    const mvp = SHOWCASE[0];
    const rounds = match?.bestOf === 5
      ? [
        { map: map1.name, a: 2, b: 1, winA: true, mvp },
        { map: map2.name, a: 2, b: 1, winA: true, mvp },
        { map: map1.name, a: 3, b: 0, winA: true, mvp },
      ]
      : [
        { map: map1.name, a: 2, b: 1, winA: true, mvp },
        { map: map2.name, a: 2, b: 1, winA: true, mvp },
      ];
    return { won: true, results: rounds, hand: [] };
  };

  const frames = [initial];
  let curr = initial;
  // Advance through all 5 league weeks, Semifinal, and Final using the real season engine
  for (let i = 0; i < 7; i += 1) {
    if (!nextMatch(curr)) break;
    curr = finishSeries(curr, winOutcome(curr), allCards);
    frames.push(curr);
  }
  // Frame after winning the Final: promoted to Ascension (tier 1)
  const promoted = newClub({
    seed: 202699,
    name: t('Your club'),
    picks,
    cards: allCards,
    crest: 'shield',
    tone: 0,
  });
  frames.push({ ...promoted, tier: 1, year: 2, titles: 1 });
  return frames;
}

function PrimerRoad({ state, activeFrame, onSelectFrame }) {
  const cells = state.fixtures.map((week, index) => {
    const id = week.find(pair => pair.includes('you')).find(item => item !== 'you');
    const rival = clubById(state, id);
    const played = state.results[index];
    let status;
    if (played) status = played.won ? 'won' : 'lost';
    else if (state.phase === 'league' && index === state.week) status = 'now';
    return {
      key: index,
      frameIndex: index,
      when: `Week ${index + 1}`,
      short: `W${index + 1}`,
      club: rival,
      name: rival.name,
      status,
    };
  });
  cells.push({
    key: 'po',
    frameIndex: 5,
    when: t('Playoffs'),
    short: 'PO',
    name: t('Top 4'),
    status: state.phase === 'playoffs' || state.phase === 'review' ? (state.phase === 'review' ? 'won' : 'now') : undefined,
  });
  cells.push({
    key: 'win',
    frameIndex: 7,
    when: 'Window',
    short: 'TW',
    name: t('Promotion'),
    status: state.tier > 0 ? 'now' : undefined,
  });

  return (
    <ol className={`${club.road} ${styles.primerRoad}`} aria-label="Season calendar">
      {cells.map(cell => (
        <li
          key={cell.key}
          data-status={cell.status}
          onClick={() => onSelectFrame(cell.frameIndex)}
          style={{ cursor: 'pointer' }}
          aria-current={activeFrame === cell.frameIndex ? 'step' : undefined}
        >
          <span className={club.when}>
            <span className={club.long}>{cell.when}</span>
            <span className={club.short} aria-hidden="true">{cell.short}</span>
          </span>
          <span className={club.who}>
            {cell.club && <Crest club={cell.club} size={22} />}
            <b>{cell.name}</b>
          </span>
        </li>
      ))}
    </ol>
  );
}

function PrimerBracket({ state, table }) {
  const { playoffs } = state;
  const seeds = playoffs?.seeds ?? table.slice(0, 4).map(row => row.id);
  const team = (id, seed, winner) => (
    <li
      className={club.bracketRow}
      data-you={id === 'you' || undefined}
      data-out={winner && winner !== id ? true : undefined}
      data-won={winner === id || undefined}
    >
      <span className={club.bracketSeed}>{seed ?? ''}</span>
      {id === 'you'
        ? <ClubLogo name={state.name} style={state.crest} tone={state.tone} size={24} />
        : <Crest club={clubById(state, id)} size={24} />}
      <b className={club.bracketClubName}>{id === 'you' ? state.name : clubById(state, id).name}</b>
    </li>
  );
  const semi = (index, a, b) => {
    const match = playoffs?.semis[index];
    return (
      <div className={club.match}>
        <div className={club.matchHead}>
          <span>{t('Semifinal')} {index + 1}</span>
          <small>Bo3</small>
        </div>
        <ol className={club.matchPod}>
          {team(match?.ids[0] ?? seeds[a], a + 1, match?.winner)}
          {team(match?.ids[1] ?? seeds[b], b + 1, match?.winner)}
        </ol>
      </div>
    );
  };
  const final = playoffs?.final;
  return (
    <section className={club.bracket} aria-label={t('Playoffs')}>
      <div className={club.bracketHead}>
        <h2 className={club.sectionHead}>{t('Playoffs')}</h2>
        {!playoffs && <span className={club.tag}>{t('Projected')}</span>}
      </div>
      <div className={club.bracketGrid} data-projected={!playoffs || undefined}>
        <div className={club.semis}>{semi(0, 0, 3)}{semi(1, 1, 2)}</div>
        <span className={club.joiner} aria-hidden="true" />
        <div className={club.match} data-final="true">
          <div className={club.matchHead}>
            <span>{t('Final')}</span>
            <small>Bo5</small>
          </div>
          {final ? (
            <ol className={club.matchPod}>
              {team(final.ids[0], null, final.winner)}
              {team(final.ids[1], null, final.winner)}
            </ol>
          ) : (
            <ol className={club.matchPod} data-pending="true">
              <li className={club.bracketRow} data-pending="true">
                <span className={club.bracketSeed} />
                <span className={club.pendingMark} aria-hidden="true" />
                <span className={club.pendingClubName}>{t('Semifinal 1 winner')}</span>
              </li>
              <li className={club.bracketRow} data-pending="true">
                <span className={club.bracketSeed} />
                <span className={club.pendingMark} aria-hidden="true" />
                <span className={club.pendingClubName}>{t('Semifinal 2 winner')}</span>
              </li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function PrimerLeague() {
  const reducedMotion = useReducedMotion();
  const frames = useMemo(() => buildSeasonTimeline(), []);
  const [frameIndex, setFrameIndex] = useState(0);
  const [userPicked, setUserPicked] = useState(false);

  useEffect(() => {
    if (reducedMotion || userPicked) return undefined;
    const timer = setInterval(() => {
      setFrameIndex(i => (i + 1) % frames.length);
    }, 1350);
    return () => clearInterval(timer);
  }, [frames.length, reducedMotion, userPicked]);

  const state = frames[frameIndex] ?? frames[0];
  const table = useMemo(() => standings(state, allCards), [state]);
  const tierLabel = TIER_META[state.tier].label;

  return (
    <div className={styles.primerLeagueStage}>
      <PrimerRoad
        state={state}
        activeFrame={frameIndex}
        onSelectFrame={(idx) => {
          setUserPicked(true);
          playUiSound('select');
          setFrameIndex(Math.min(idx, frames.length - 1));
        }}
      />
      <div className={`${club.leagueBody} ${styles.primerLeagueBody}`}>
        <section className={club.leagueTable} aria-label={t(tierLabel)}>
          <div className={club.tableHeaderGroup}>
            <div className={club.bracketHead}>
              <h2 className={club.sectionHead}>{t(tierLabel)}</h2>
              <span className={club.tierBars} role="img" aria-label={`Tier ${state.tier + 1} of 3`}>
                {[0, 1, 2].map(idx => <i key={idx} data-on={idx === state.tier || undefined} />)}
              </span>
            </div>
            <div className={club.tableColLabels} aria-hidden="true">
              <span>W–L</span>
              <span>RD</span>
            </div>
          </div>
          <ol className={club.table}>
            {table.map(row => (
              <Fragment key={row.id}>
                <li data-you={row.you || undefined}>
                  <b className={club.pos}>{row.pos}</b>
                  {row.you
                    ? <ClubLogo name={state.name} style={state.crest} tone={state.tone} size={28} />
                    : <Crest club={clubById(state, row.id)} size={28} />}
                  <b className={club.clubName}>{row.name}</b>
                  <b className={club.record}>{row.w}–{row.l}</b>
                  <span className={club.rd} data-sign={Math.sign(row.rd)}>{row.rd > 0 ? `+${row.rd}` : row.rd}</span>
                </li>
                {row.pos === 4 && (
                  <li key="cut-playoff" className={club.cutRow} role="separator" aria-label={t('Playoff line')}>
                    <span>{t('Playoff line')}</span>
                  </li>
                )}
                {row.pos === 5 && (
                  <li key="cut-drop" className={club.cutRow} role="separator" aria-label={t('Drop zone')}>
                    <span>{t('Drop zone')}</span>
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        </section>
        <PrimerBracket state={state} table={table} />
      </div>
    </div>
  );
}

// ── Primer Shell ────────────────────────────────────────────────────────────

const STEPS = [
  {
    title: () => t('The starting five'),
    body: () => t('Open five draft packs to sign your core roster. Your leftmost starter commands the team as IGL.'),
    piece: () => <PrimerSquad />,
  },
  {
    title: () => t('Three-lane combat'),
    body: () => t('Deploy your five players across A, Mid and B lanes. Outsmart the rival with your IGL rotation.'),
    piece: () => <PrimerBoard />,
  },
  {
    title: () => t('Championship ladder'),
    body: () => t('Win best-of-3 series to climb the league. Top four reach the playoffs, and finalists earn promotion.'),
    piece: () => <PrimerLeague />,
  },
];

export default function ClubPrimer({ onDone, onSkip, doneLabel }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const goNext = useCallback(() => {
    if (last) onDone();
    else setIndex(i => i + 1);
  }, [last, onDone]);

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onSkip]);

  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <div className={club.titleBlock}>
            <b>{t('How Clubs works')}</b>
            <span className={club.tagRow}>
              <span className={club.tag}>{t('Step {n} / {total}', { n: index + 1, total: STEPS.length })}</span>
            </span>
          </div>
        </div>
        <div className={club.chips}>
          <button type="button" className={club.small} onClick={onSkip}>{t('Skip')}</button>
        </div>
      </header>

      <main className={`${club.ground} ${styles.primerGround}`} style={{ '--map': `url(${assetPath(DEFAULT_MAP)})` }}>
        <section key={index} className={styles.step} aria-live="polite">
          <div className={styles.stepHeader}>
            <h2 className={styles.stepTitle}>{step.title()}</h2>
            <p className={styles.stepLead}>{step.body()}</p>
          </div>

          <div className={styles.piece}>
            {step.piece()}
          </div>

          <div className={styles.pips} role="img" aria-label={t('Step {n} / {total}', { n: index + 1, total: STEPS.length })}>
            {STEPS.map((item, i) => <i key={i} data-on={i <= index || undefined} />)}
          </div>
        </section>
      </main>

      <footer className={styles.stepAct}>
        <button
          type="button"
          className={club.ghost}
          disabled={index === 0}
          onClick={goPrev}
        >
          {t('Back')}
        </button>
        <button
          type="button"
          className={club.primary}
          autoFocus
          onClick={goNext}
        >
          {last ? (doneLabel ?? t('Create your club')) : t('Next')}
        </button>
      </footer>
    </div>
  );
}
