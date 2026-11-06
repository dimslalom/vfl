import { useCallback, useEffect, useRef, useState } from 'react';
import { playUiSound } from '../../shared/src/lib/gameAudio';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import { BOARD_SKILLS, hasSkill, seriesWinner, winsNeeded } from '../engine/board/board';
import { refillTacticHand, settleTactic } from '../engine/endless/seriesCards';
import { namedSeriesMaps, pickSeriesMaps, roundBoard, roundResult } from '../prototype/boardSetup';
import { chipInfo, chipPlan } from '../chip3d/chipData';
import { chipCopy, planLine } from '../chip3d/chipCopy';
import { titleCase } from '../lib/titleCase';
import { t } from '../lib/i18n';
import MatchIntro from './MatchIntro';
import { settleMatchMusic, stopMatchMusic } from '../lib/music';
import { ChipGuideButton, ChipLadder } from '../chip3d/ChipHelp';
import { STAT_LABELS, STAT_LABELS_FULL } from '../../shared/src/data/statFields';
import styles from './BoardSeries.module.css';

// The picked piece, in detail: a light tag hung off the piece itself, in the board's
// perspective. Cards and chips use the same tag, so everything you can pick explains
// itself the same way. It never dims the board, so the lanes stay tappable. The tag
// follows the piece every frame: above it when there is room, below it when the piece
// sits near the top, beside it when neither fits.
const TAG_GAP = 4;
const TAG_TOP = 64;
const TAG_EDGE = 8;

// `anchor()` returns where the piece is on screen (TableStage.cardAnchor / chipAnchor).
function BoardTag({ anchor, hostRef, label, children }) {
  const tagRef = useRef(null);
  const anchorRef = useRef(anchor);
  useEffect(() => { anchorRef.current = anchor; });

  useEffect(() => {
    let frame = 0;
    const follow = () => {
      frame = requestAnimationFrame(follow);
      const tag = tagRef.current;
      const at = anchorRef.current?.();
      const host = hostRef.current;
      if (!tag || !at || !host) return;
      const w = tag.offsetWidth;
      const h = tag.offsetHeight;
      const ox = host.offsetLeft;
      const oy = host.offsetTop;
      const topAnchor = at.topPeak ?? { x: at.x, y: at.top };
      const botAnchor = at.bottomPeak ?? { x: at.x, y: at.bottom };
      // Above the piece's peak, else below it, else beside it on whichever side has more room.
      let side = 'above';
      if (topAnchor.y - TAG_GAP - h < TAG_TOP) {
        side = botAnchor.y + TAG_GAP + h <= at.height - TAG_EDGE
          ? 'below'
          : (at.width - at.right > at.left ? 'right' : 'left');
      }
      let left, top, point;
      if (side === 'above') {
        left = Math.max(TAG_EDGE, Math.min(at.width - w - TAG_EDGE, topAnchor.x - w / 2));
        top = topAnchor.y - TAG_GAP - h;
        point = Math.max(18, Math.min(w - 18, topAnchor.x - left));
      } else if (side === 'below') {
        left = Math.max(TAG_EDGE, Math.min(at.width - w - TAG_EDGE, botAnchor.x - w / 2));
        top = botAnchor.y + TAG_GAP;
        point = Math.max(18, Math.min(w - 18, botAnchor.x - left));
      } else {
        left = side === 'right' ? at.right + TAG_GAP : at.left - TAG_GAP - w;
        left = Math.max(TAG_EDGE, Math.min(at.width - w - TAG_EDGE, left));
        top = Math.max(TAG_TOP, Math.min(at.height - h - TAG_EDGE, at.y - h / 2));
        point = Math.max(16, Math.min(h - 16, at.y - top));
      }
      tag.style.left = `${Math.round(ox + left)}px`;
      tag.style.top = `${Math.round(oy + top)}px`;
      const angle = (at.angle ?? 0).toFixed(2);
      const rx = (at.rx ?? 11).toFixed(2);
      const ry = (at.ry ?? 0).toFixed(2);
      tag.style.transform = `perspective(620px) rotateZ(${angle}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;
      tag.style.setProperty('--point', `${Math.round(point)}px`);
      tag.dataset.side = side;
      tag.dataset.ready = 'true';
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [hostRef]);

  return <aside ref={tagRef} className={styles.tag} aria-label={label}>{children}</aside>;
}

function CardView({ view, stageRef, hostRef, onPlaceLane, onBack }) {
  const { card, lane, lanes, live, canMove, canReturn, igl } = view;
  const skills = Object.keys(BOARD_SKILLS).filter(key => hasSkill(card, key));
  const bestScore = Math.max(...lanes.map(info => card.stats[info.stat] ?? 0));
  return (
    <BoardTag anchor={() => stageRef.current?.cardAnchor?.()} hostRef={hostRef} label={`${card.player} details`}>
      <div className={styles.tagHead}>
        <b>{card.player}</b>
        <span>{igl && <em>IGL</em>}{card.role}</span>
      </div>
      <ol className={styles.laneValues} aria-label="What this card scores on each lane">
        {lanes.map((info, index) => {
          const val = card.stats[info.stat];
          const isBest = lane == null && val === bestScore;
          return (
            <li
              key={info.name}
              data-on={lane === index || undefined}
              data-best={isBest || undefined}
              data-clickable={canMove || undefined}
              onClick={canMove ? () => onPlaceLane?.(index) : undefined}
            >
              <span>{info.name}</span>
              <small title={STAT_LABELS_FULL[info.stat]}>{STAT_LABELS[info.stat]}</small>
              <b>{val}</b>
            </li>
          );
        })}
      </ol>
      {skills.length > 0 && (
        <ul className={styles.skillList}>
          {skills.map(key => (
            <li key={key} data-live={live === key || undefined} data-skill={key}>
              <b>{BOARD_SKILLS[key].label}</b>
              <span>{BOARD_SKILLS[key].text}</span>
            </li>
          ))}
        </ul>
      )}
      {canReturn && <button type="button" className={styles.back} onClick={onBack}>Back to hand</button>}
    </BoardTag>
  );
}

// A picked hand chip, on the same tag as a card: its name and tier, what goes on the
// lane and what it pays, the effect in a line, and what it does for this squad.
// The flat lab board has no chip anchor, so it pins the tag to the point it reports.
function ChipView({ view, roster, stageRef, hostRef }) {
  const info = chipInfo(view.selected);
  const copy = chipCopy(info.key);
  const plan = chipPlan(view.selected, roster);
  const anchor = () => stageRef.current?.chipAnchor?.() ?? (view.anchor && hostRef.current && {
    ...view.anchor, top: view.anchor.y, bottom: view.anchor.y, left: view.anchor.x, right: view.anchor.x,
    width: hostRef.current.clientWidth, height: hostRef.current.clientHeight,
  });
  return (
    <BoardTag key={view.selected} anchor={anchor} hostRef={hostRef} label={`${titleCase(info.name)} details`}>
      <div className={styles.tagHead}>
        <b>{titleCase(info.name)}</b>
        <span><em data-tier={info.tier}>{info.tier}</em></span>
      </div>
      <ChipLadder chipKey={view.selected} />
      <p className={styles.tagLine}>{copy.effect}</p>
      <p className={styles.tagPlan} data-fits={plan.fits || undefined}>{planLine(plan)}</p>
      <ChipGuideButton className={styles.tagGuide} />
    </BoardTag>
  );
}

function Pips({ total, won, side }) {
  return (
    <span className={styles.pips} data-side={side}>
      {Array.from({ length: total }, (_, index) => <i key={index} data-on={index < won ? 'true' : undefined} />)}
    </span>
  );
}

// One enemy, played as Bo3 or Bo5 rounds on the Pixi board. It owns the rounds
// and the tactic hand for the length of a series, then hands `onDone` map-shaped
// results so the run's rewards and bracket need not know how they were won.
// Buttons stay in the DOM, so keyboard and screen reader support comes free.
// three: play on the 2.5D board (one three.js scene, chips included), with the
// Pixi board as the fallback when WebGL or three.js can't start.
// intro: { you: { club, cards }, them: { club, cards }, stage } plays the match
// intro over the board while it loads, then drops the 3D camera into the first deal.
// settings: controls shown in a panel behind the gear beside Leave (the Club passes its music controls).
export default function BoardSeries({ squad, opponent, opponentName, bestOf, seed, hand, onDone, onLeave, doneLabel = 'Continue', fixed = false, three = false, arena = 'tint', mapNames = null, intro = null, settings = null }) {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const chipHostRef = useRef(null);
  const chipsRef = useRef(null);
  const barRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [maps] = useState(() => (mapNames ? namedSeriesMaps(seed, mapNames) : pickSeriesMaps(seed, bestOf)));
  const arenaRef = useRef(arena);
  const [state, setState] = useState({ phase: 'loading', legal: false, placed: 0, moves: 1 });
  const [score, setScore] = useState({ you: 0, them: 0 });
  const [outcome, setOutcome] = useState(null);
  // false, or why the board couldn't start: 'webgl' (this browser can't draw 3D) or 'load'.
  const [failed, setFailed] = useState(false);
  const [introOn, setIntroOn] = useState(Boolean(intro));
  const [boardReady, setBoardReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Match music lasts as long as the match does.
  useEffect(() => () => stopMatchMusic(), []);
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setSettingsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);
  const introRef = useRef(introOn);
  // The first round's pieces, for preloading behind the intro without making the
  // board's setup effect depend on arrays the parent rebuilds every render.
  const firstRef = useRef({ cards: [...squad, ...opponent], mapName: maps[0].name });
  useEffect(() => {
    introRef.current = introOn;
    firstRef.current = { cards: [...squad, ...opponent], mapName: maps[0].name };
  });
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [chipView, setChipView] = useState(null);
  const [cardView, setCardView] = useState(null);
  const runRef = useRef({ you: 0, them: 0, hand, results: [] });
  const finishedRef = useRef(false);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDone({ won: outcome.champion === 'you', results: runRef.current.results, hand: runRef.current.hand });
  }

  function playRound() {
    const run = runRef.current;
    const round = run.you + run.them;
    run.hand = refillTacticHand(() => ((seed * (round + 7)) % 997) / 997, run.hand, { roster: squad, map: maps[round] });
    setOutcome(null);
    chipsRef.current?.setChips(run.hand.map(card => card.key));
    stageRef.current?.deal(roundBoard({ seed, round, map: maps[round], you: squad, them: opponent, tactics: run.hand }))
      .catch((error) => {
        if (import.meta.env.DEV) console.error(error);
        setFailed('load');
      });
  }

  function finishRound(result) {
    const run = runRef.current;
    const round = run.you + run.them;
    const won = result.winner === 'you';
    if (won) run.you += 1;
    else run.them += 1;
    // Each chip lives or dies with its own lane: a won lane hands it back, a lost one burns it.
    const played = result.tactics ?? [];
    if (played.length) {
      let rest = run.hand.filter(card => !played.some(chip => chip.card.uid === card.uid));
      for (const chip of played) rest = settleTactic(rest, chip.card, result.lanes[chip.lane]?.winner === 'you');
      run.hand = rest;
    }
    run.results.push(roundResult(result, maps[round].name, squad));
    setScore({ you: run.you, them: run.them });
    const champion = seriesWinner(bestOf, run.you, run.them);
    if (champion) playUiSound(champion === 'you' ? 'series_win' : 'series_loss');
    else playUiSound(won ? 'round_win' : 'round_loss');
    setOutcome({ ...result, champion });
  }
  const finishRoundRef = useRef(finishRound);
  useEffect(() => {
    arenaRef.current = arena;
    stageRef.current?.setArena?.(arena);
  }, [arena]);
  // Fetch every map's arena for the series up front; each is small, and later
  // rounds then swap sets without waiting.
  useEffect(() => {
    if (!three || arena === 'off') return;
    import('../table3d/arena.js')
      .then(({ preloadArena }) => maps.forEach(map => preloadArena(map.name)))
      .catch(() => null);
  }, [three]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { finishRoundRef.current = finishRound; });
  const playRoundRef = useRef(playRound);
  useEffect(() => { playRoundRef.current = playRound; });

  useEffect(() => {
    let stage;
    let chips;
    let cancelled = false;
    // Board pixels to page pixels: the chip layer reads the page, the board its own canvas.
    const toPage = (spot) => {
      const box = hostRef.current?.getBoundingClientRect();
      return spot && box ? { ...spot, x: box.left + spot.x, y: box.top + spot.y } : null;
    };
    const onState = (next) => {
      setState(next);
      chipsRef.current?.setLocked(next.phase !== 'place');
      if (next.result) finishRoundRef.current(next.result);
    };
    (async () => {
      try {
        if (three) {
          try {
            const { default: TableStage } = await import('../table3d/TableStage.js');
            if (cancelled) return;
            stage = new TableStage(hostRef.current, { reducedMotion, onState, onChipView: setChipView, onCardView: setCardView, arena: arenaRef.current });
            if (await stage.init()) {
              if (cancelled) return;
              stageRef.current = stage;
              // With an intro, the first deal waits for the panels to part.
              if (introRef.current) {
                stage.raiseForDrop();
                await stage.preload(firstRef.current).catch(() => null);
                if (cancelled) return;
                setBoardReady(true);
              } else {
                playRoundRef.current();
              }
              return;
            }
            // init() is false only when the browser won't give us a WebGL context.
            stage.destroy();
            if (!cancelled) setFailed('webgl');
            return;
          } catch {
            stage?.destroy();
            if (!cancelled) setFailed('load');
            return;
          }
        }
        // The flat board below serves only the labs that ask for it (three=false).
        // The Club board is 3D or nothing: a flat stand-in looks broken, so a
        // failure says what happened and offers a retry instead.
        // The 3D chips are a nicety: if three.js or WebGL fails, the board keeps its flat chips.
        try {
          const { default: ChipStack } = await import('../chip3d/ChipStack.js');
          if (cancelled) return;
          chips = new ChipStack(chipHostRef.current, {
            reducedMotion,
            events: hostRef.current,
            single: true,
            anchors: () => stageRef.current?.chipAnchors() ?? { closed: { x: 0, y: 0, size: 64 }, open: { x: 0, y: 0, size: 96 } },
            dropTarget: (x, y) => {
              const board = stageRef.current;
              const box = hostRef.current?.getBoundingClientRect();
              if (!board || !box || board.phase !== 'place') return null;
              const lane = board.laneAt(x - box.left, y - box.top);
              return lane == null ? null : toPage(board.chipSpot(lane));
            },
            onPlace: (index, lane) => stageRef.current?.setTacticLane(index, lane),
            onChange: setChipView,
          });
          if (!(await chips.init())) chips = null;
        } catch {
          chips?.destroy();
          chips = null;
        }
        if (cancelled) return;
        chipsRef.current = chips;
        const { default: BoardStage } = await import('../prototype/BoardStage.js');
        if (cancelled) return;
        stage = new BoardStage(hostRef.current, {
          reducedMotion,
          chips3d: Boolean(chips),
          onChipSpot: (index, spot) => chipsRef.current?.repin(index, toPage(spot)),
          onState,
        });
        stageRef.current = stage;
        if (await stage.init()) {
          playRoundRef.current();
          chips?.fit();
        }
      } catch {
        // No WebGL, or the board's code or images could not load.
        if (!cancelled) setFailed('load');
      }
    })();
    return () => {
      cancelled = true;
      stage?.destroy();
      chips?.destroy();
      stageRef.current = null;
      chipsRef.current = null;
    };
  }, [reducedMotion, attempt, three]);

  // The 2.5D board keeps its hand clear of the button docked beside it, so it is
  // told how much of the bottom right the button covers whenever that changes.
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
  }, [attempt]);

  // Stable, so the intro's effects don't re-run on every board update.
  const openIntro = useCallback(() => playRoundRef.current(), []);
  const skipDrop = useCallback(() => stageRef.current?.skipDrop?.(), []);
  const endIntro = useCallback(() => { settleMatchMusic(); setIntroOn(false); }, []);

  function retry() {
    setFailed(false);
    setAttempt(value => value + 1);
  }

  const skills = Object.keys(BOARD_SKILLS).filter(key => squad.some(card => hasSkill(card, key)));
  const { phase, legal, placed, moves, rotated, layout } = state;
  // The finished round stays on screen until the next one is dealt.
  const shownRound = Math.min(score.you + score.them - (outcome ? 1 : 0), bestOf - 1);
  return (
    <div className={styles.series} data-fixed={fixed === true ? 'true' : fixed || undefined} data-layout={layout}>
      <div className={styles.board} key={attempt} ref={hostRef} onClick={() => phase === 'resolve' && stageRef.current?.skip()} />
      <div className={styles.chips} key={`chips${attempt}`} ref={chipHostRef} aria-hidden="true" />
      {chipView?.selected && <ChipView view={chipView} roster={squad} stageRef={stageRef} hostRef={hostRef} />}
      {cardView && <CardView view={cardView} stageRef={stageRef} hostRef={hostRef} onPlaceLane={lane => stageRef.current?.placePicked(lane)} onBack={() => stageRef.current?.unplace()} />}
      {phase === 'loading' && !failed && !introOn && <p className={styles.notice} role="status">Dealing the board</p>}
      {failed && (
        <div className={styles.result} role="alert">
          <h2 data-won="false">{failed === 'webgl' ? 'This browser can’t show the 3D board' : 'The board couldn’t load'}</h2>
          <p className={styles.hint}>
            {failed === 'webgl'
              ? 'Turn on hardware acceleration in your browser settings, or open the game in another browser. Your club is saved.'
              : 'Check your connection, then try again. Your club is saved.'}
          </p>
          <button type="button" className={styles.primary} onClick={retry}>Try again</button>
          {onLeave && <button type="button" className={styles.secondary} onClick={onLeave}>Back to club</button>}
        </div>
      )}
      {introOn && intro && !failed && (
        <MatchIntro
          you={intro.you}
          them={intro.them}
          stage={intro.stage}
          bestOf={bestOf}
          ready={boardReady}
          reducedMotion={reducedMotion}
          onOpen={openIntro}
          onSkipDrop={skipDrop}
          onDone={endIntro}
        />
      )}
      {!failed && (onLeave || settings) && (
        <div className={styles.tools}>
          {settings && (
            <button type="button" className={styles.tool} aria-label="Settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><path d="M14 4v6M8 14v6" /></svg>
            </button>
          )}
          {onLeave && (
            <button type="button" className={styles.leave} data-armed={leaving || undefined} onBlur={() => setLeaving(false)} onClick={() => (leaving ? onLeave() : setLeaving(true))}>
              {leaving ? 'Leave and replay later' : 'Leave'}
            </button>
          )}
          {settings && settingsOpen && <div className={styles.settingsPanel} role="dialog" aria-label="Settings">{settings}</div>}
        </div>
      )}
      <div className={styles.head} aria-label={`Round ${shownRound + 1}, best of ${bestOf}, ${maps[shownRound].name} against ${opponentName}`}>
        <b key={shownRound} className={styles.mapTitle}>{maps[shownRound].name}</b>
        <Pips total={winsNeeded(bestOf)} won={score.you} side="you" />
        <small>Bo{bestOf}</small>
        <Pips total={winsNeeded(bestOf)} won={score.them} side="them" />
        <span>{opponentName}</span>
      </div>
      {/* On the 3D board each card shows its own live skill; the flat board keeps the list. */}
      {!three && skills.length > 0 && (
        <ul className={styles.skills} aria-label="Your squad's skills">
          {skills.map(key => <li key={key}><b>{BOARD_SKILLS[key].label}</b>{BOARD_SKILLS[key].text}</li>)}
        </ul>
      )}
      <div className={styles.bar} ref={barRef}>
        {phase === 'place' && (
          <button type="button" className={styles.primary} disabled={!legal} onClick={() => stageRef.current?.lockIn()}>
            {legal ? 'Lock in' : placed < 5 ? `${placed}/5 placed` : 'Fill every lane'}
          </button>
        )}
        {phase === 'rotate' && (
          <button type="button" className={styles.primary} onClick={() => stageRef.current?.resolve()}>
            {rotated ? 'Rotate and go' : 'Go without rotating'}
          </button>
        )}
        {phase === 'rotate' && !three && <p className={styles.hint}>{moves === 2 ? 'Mastermind IGL: move two players' : 'IGL rotate: move one player'}</p>}
        {phase === 'resolve' && <p className={styles.hint}>Tap to skip</p>}
      </div>
      {outcome && outcome.lanes?.length === 3 && outcome.youWon === 3 && (
        <div className={styles.flawlessBanner} role="status" aria-label={t('FLAWLESS')}>
          <span className={styles.flawlessKicker}>{t('Clean sweep')}</span>
          <b className={styles.flawlessTitle}>{t('FLAWLESS')}</b>
          <span className={styles.flawlessSub}>{t('All 3 lanes won')}</span>
        </div>
      )}
      {outcome && (() => {
        const won = (outcome.champion ?? outcome.winner) === 'you';
        const flawless = outcome.lanes?.length === 3 && outcome.youWon === 3;
        // A round shows its number as a big numeral beside the map name, so the
        // two never need a typed separator. The series verdict keeps its score.
        const kicker = outcome.champion ? `Series ${score.you}–${score.them}` : maps[shownRound].name;
        return (
          <div className={styles.outcome} data-won={won} role="status">
            <div className={styles.outcomeStamp}>
              {!outcome.champion && (
                <>
                  <span className={styles.outcomeRound} aria-hidden="true">{shownRound + 1}</span>
                  <span className={styles.srOnly}>Round {shownRound + 1}</span>
                </>
              )}
              <span className={styles.outcomeText}>
                <small>{kicker}</small>
                <h2>
                  {outcome.champion
                    ? (won ? 'Series won' : 'Series lost')
                    : (won ? 'Round won' : 'Round lost')}
                </h2>
                {flawless && <span className={styles.flawlessPill}>{t('FLAWLESS')}</span>}
              </span>
            </div>
            <div className={styles.outcomeBody}>
              <div className={styles.outcomeMetric}>
                <span>Total</span>
                <b>{outcome.youTotal}<em>–{outcome.themTotal}</em></b>
              </div>
              {outcome.champion
                ? <button type="button" className={styles.primary} onClick={finish}>{doneLabel}</button>
                : <button type="button" className={styles.primary} onClick={playRound}>Next round</button>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
