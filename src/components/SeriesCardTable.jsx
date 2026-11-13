import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'motion/react';
import { TACTICS } from '../engine/endless/seriesCards.js';
import useCardTilt from '../../shared/src/lib/useCardTilt.js';
import useMediaQuery from '../lib/useMediaQuery.js';
import { DUR, EASE, STAGGER } from '../../shared/src/lib/motion.js';
import { playUiSound } from '../lib/uiSound.js';
import useReducedMotion from '../../shared/src/lib/useReducedMotion.js';
import { assetPath } from '../../shared/src/lib/utils.js';
import { t } from '../lib/i18n.js';
import SquadDock from './SquadDock.jsx';
import TacticalButton from './TacticalButton.jsx';
import styles from './SeriesCardTable.module.css';
import GameIcon from './GameIcon';

const ROLE_MARK = { Duelist: 'DLT', Initiator: 'INI', Controller: 'CTL', Sentinel: 'SEN' };
const NARROW = '(max-width: 820px)';
const CARD_RATIO = 580 / 400;
const PREVIEW_GAP = 10;
const PREVIEW_MARGIN = 8;

// Shared physical object for every non-player card: the supplied 400×580
// silhouette, three parallax planes, spring tilt, and a drag that snaps home.
//
// Every card is authored twice. The full face carries the whole panel
// hierarchy and needs ~170px to read; the small face carries only what
// identifies the card and scales its type in container units, so it stays
// legible down to the 64px live-cast rail. A small card is never a shrunken
// full card — pointing at one raises the full face in a portal instead.
function TableCard(props) {
  const {
    className = '', seed, label, clickable = false, onClick, style,
    background, subject, information,
    smallSubject = null, smallInformation = null,
    small = false, previewWidth = 230,
    faceDown = false, back = null, isPreview = false, ...attributes
  } = props;
  const {
    tiltRef, onPointerMove, onPointerEnter, onPointerDown, onPointerUp,
    onPointerLeave, onFocus, onBlur,
  } = useCardTilt({ seed, disabled: isPreview });
  const buttonRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const previewable = small && !isPreview;

  const closePreview = useCallback(() => setPreview(null), []);

  // Resolved to final viewport pixels here rather than a CSS translate:
  // Motion writes `transform` inline while it animates, which would wipe a
  // translate(-50%,-100%) out mid-flight and hang the card off its own
  // top-left corner. Clamped on both axes so it is always fully on screen.
  const openPreview = useCallback(() => {
    const node = buttonRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = previewWidth;
    const height = width * CARD_RATIO;
    const clamp = (value, max) => Math.max(PREVIEW_MARGIN, Math.min(value, Math.max(PREVIEW_MARGIN, max)));
    const above = rect.top - PREVIEW_GAP - height > PREVIEW_MARGIN;
    setPreview({
      left: clamp(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - PREVIEW_MARGIN),
      top: clamp(
        above ? rect.top - PREVIEW_GAP - height : rect.bottom + PREVIEW_GAP,
        window.innerHeight - height - PREVIEW_MARGIN,
      ),
      above,
    });
  }, [previewWidth]);

  // The preview is anchored to a viewport rect, so anything that moves the
  // card underneath it dismisses rather than drifts. Touch has no pointerleave
  // it can trust, so a press anywhere else dismisses instead.
  useEffect(() => {
    if (!preview) return undefined;
    const dismiss = () => setPreview(null);
    const onKey = (event) => { if (event.key === 'Escape') dismiss(); };
    const onOutside = (event) => {
      if (!buttonRef.current?.contains(event.target)) dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside, true);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside, true);
    };
  }, [preview]);

  // On a small card the first press shows the full face and the second one
  // commits, which is the only affordance touch gets in place of hover.
  const activate = () => {
    if (previewable && !preview) { openPreview(); return; }
    if (!clickable) { closePreview(); return; }
    playUiSound('select');
    closePreview();
    onClick?.();
  };

  return (
    <>
      <m.button
        ref={buttonRef}
        type="button"
        className={[styles.cardObject, className].join(' ')}
        style={{ ...style, '--card-mask': `url(${assetPath('/assets/card-mask.svg')})` }}
        aria-label={label}
        aria-disabled={!clickable}
        tabIndex={clickable && !isPreview ? 0 : -1}
        aria-hidden={isPreview || undefined}
        data-small={small ? 'true' : undefined}
        data-preview={isPreview ? 'true' : undefined}
        onClick={activate}
        drag={!isPreview}
        dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
        dragElastic={0.2}
        dragMomentum={false}
        whileDrag={{ zIndex: 80 }}
        onDragStart={() => { closePreview(); playUiSound('lift'); }}
        onDragEnd={() => playUiSound('drop')}
        onPointerMove={onPointerMove}
        onPointerEnter={(event) => {
          onPointerEnter(event);
          playUiSound('hover');
          if (previewable && event.pointerType === 'mouse') openPreview();
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={(event) => {
          onPointerLeave(event);
          // Touch fires pointerleave on release, which would close the
          // preview the first tap just opened.
          if (event.pointerType === 'mouse') closePreview();
        }}
        onFocus={(event) => { onFocus(event); if (previewable) openPreview(); }}
        onBlur={(event) => { onBlur(event); closePreview(); }}
        {...attributes}
      >
        <span className={styles.cardShadow} aria-hidden="true" />
        <span ref={tiltRef} className={styles.cardTilt}>
          <span className={styles.cardFlip} data-face-down={faceDown ? 'true' : undefined}>
            <span className={styles.cardFace} data-face="front" aria-hidden={faceDown}>
              <span className={styles.cardMask}>
                <span className={styles.cardPlane} data-plane="background">{background}</span>
                <span className={styles.cardPlane} data-plane="subject">{small ? smallSubject : subject}</span>
                <span className={styles.cardPlane} data-plane="information">{small ? smallInformation : information}</span>
                <span className={styles.cardGlare} aria-hidden="true" />
                <CardBorder />
              </span>
            </span>
            <span className={styles.cardFace} data-face="back" aria-hidden={!faceDown}>
              <span className={styles.cardMask}>
                <span className={styles.cardPlane} data-plane="background">{back}</span>
                <CardBorder />
              </span>
            </span>
          </span>
        </span>
      </m.button>
      {preview && typeof document !== 'undefined' && createPortal(
        <m.div
          className={styles.cardPreview}
          data-place={preview.above ? 'above' : 'below'}
          style={{
            left: preview.left,
            top: preview.top,
            width: previewWidth,
            transformOrigin: preview.above ? 'center bottom' : 'center top',
          }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DUR.hover, ease: EASE.out }}
        >
          <TableCard {...props} small={false} isPreview clickable={false} />
        </m.div>,
        document.body,
      )}
    </>
  );
}

function CardBorder() {
  return (
    <svg className={styles.cardBorder} viewBox="0 0 400 580" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 41L200 2L398 41V539L200 578L2 539Z" />
    </svg>
  );
}

function OpponentShelf({ opponent, activeIds = [] }) {
  if (!opponent?.roster?.length) return null;
  return (
    <div className={styles.opponentShelf}>
      <SquadDock
        roster={opponent.roster}
        size={5}
        starterCount={5}
        iglId={opponent.iglId}
        squadName={opponent.name}
        locked
        activeIds={activeIds}
      />
    </div>
  );
}

// Small map face carries the place, its letter and the live rule; mastery
// pips and role marks stay on the full face.
export function MapCard({ card, owner = null, selectable = false, onPick, mastery = 0, compact = false, edge = null }) {
  const ownerMark = owner === 'player' ? '★' : '◆';
  return (
    <TableCard
      className={styles.mapCard}
      seed={`map-${card.id}-${card.year}`}
      label={edge
        ? t('{map}: {rule}. You {you}, them {them}', { map: card.name, rule: card.label, you: edge.you, them: edge.them })
        : `${card.name}: ${card.label}`}
      clickable={selectable}
      onClick={() => onPick?.(card)}
      small={compact}
      previewWidth={186}
      data-owner={owner ?? undefined}
      data-selectable={selectable ? 'true' : undefined}
      style={{ '--map-hue': card.hue, '--card-edge': card.hue }}
      background={<span className={styles.mapPhoto}><img src={assetPath(card.image)} alt="" draggable={false} /></span>}
      subject={<span className={styles.mapGeometry} aria-hidden="true"><i /><i /><i /></span>}
      information={(
        <span className={styles.mapInformation}>
          <span className={styles.mapName}>{card.name}</span>
          <span className={styles.ruleSticker} data-changed={card.changed ? 'true' : undefined}>
            <b>{card.label}</b>
            <span className={styles.roleRun}>{card.roles.map(role => <i key={role}><em>{ROLE_MARK[role]}</em></i>)}</span>
          </span>
          <span className={styles.mastery} aria-label={t('{n} map mastery', { n: mastery })}>
            {Array.from({ length: 6 }, (_, index) => <i key={index} data-on={index < mastery ? 'true' : undefined} />)}
          </span>
          {owner && <span className={styles.ownerStamp} aria-hidden="true">{ownerMark}</span>}
          {edge && (
            <span className={styles.mapEdge} aria-hidden="true">
              <b>{edge.you}</b>
              <b data-side="them">{edge.them}</b>
            </span>
          )}
        </span>
      )}
      smallInformation={(
        <span className={styles.mapSmallInformation}>
          <span className={styles.mapSmallName}>{card.name}</span>
          <span className={styles.mapSmallRule} data-changed={card.changed ? 'true' : undefined}><em>{card.label}</em></span>
          {owner && <span className={styles.ownerStampSmall} aria-hidden="true">{ownerMark}</span>}
        </span>
      )}
    />
  );
}

const MAP_GAP = 14;

// How far each dealt card tucks under the one before it: a plain 14px gap
// while the row fits, and just enough overlap to fit once it doesn't. Read
// off the fan's real width and the card's real width (it changes at the
// 820px breakpoint), the same way the dock sizes its own overlap.
function useFanOverlap(count) {
  const fanRef = useRef(null);
  const [overlap, setOverlap] = useState(-MAP_GAP);
  useEffect(() => {
    const fan = fanRef.current;
    if (!fan) return undefined;
    const measure = () => {
      const cardWidth = fan.firstElementChild?.offsetWidth ?? 0;
      if (!cardWidth || count < 2) return;
      setOverlap(Math.max(-MAP_GAP, (count * cardWidth - fan.clientWidth) / (count - 1)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(fan);
    return () => observer.disconnect();
  }, [count]);
  return [fanRef, overlap];
}

export function MapDealTable({ maps, playerPicks = [], opponentPicks = [], picksPerSide = 1, selectableIds, onPick, mastery, opponent, edgeFor = null }) {
  const picksLeft = Math.max(0, picksPerSide - playerPicks.length);
  const [fanRef, overlap] = useFanOverlap(maps.length);
  return (
    <section className={styles.table} data-phase="maps">
      <OpponentShelf opponent={opponent} />
      <div className={styles.prepHead} aria-live="polite">
        <p className={styles.pickPrompt}>{picksLeft > 0 ? t('Pick a map') : t('Series locked')}</p>
        {picksPerSide > 1 && <StepPips current={playerPicks.length} total={picksPerSide} label={t('Pick {n} of {total}', { n: playerPicks.length, total: picksPerSide })} />}
      </div>
      {/* A hand, like the dock: as many cards as the series deals, overlapped
          just enough to fit the row, each lifting clear on hover. */}
      <div ref={fanRef} className={styles.mapFan} style={{ '--map-overlap': `${overlap}px` }}>
        {maps.map((card, index) => (
          <m.div key={card.id} className={styles.dealtMap} initial={{ opacity: 0, y: -32, rotate: (index - maps.length / 2) * 4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: DUR.deal, ease: EASE.deal, delay: index * STAGGER }}>
            <MapCard
              card={card}
              owner={playerPicks.includes(card.id) ? 'player' : opponentPicks.includes(card.id) ? 'opponent' : null}
              selectable={picksLeft > 0 && selectableIds.has(card.id)}
              onPick={onPick}
              mastery={mastery?.[card.name] ?? 0}
              edge={edgeFor?.(card) ?? null}
            />
          </m.div>
        ))}
      </div>
    </section>
  );
}

// Small tactic face carries name and rule; the tag becomes the edge colour
// rather than a label that cannot fit.
export function TacticCard({ instance, selected = false, disabled = false, onPlay, compact = false, replace = false, hidden = false, mult = null }) {
  const tactic = TACTICS[instance?.key];
  if (!tactic) return null;
  return (
    <TableCard
      className={styles.tacticCard}
      seed={`tactic-${instance.uid}`}
      label={hidden
        ? t('Opponent tactic face down')
        : mult != null
          ? t('{name}: {rule}. Multiplies by {mult}', { name: tactic.name, rule: tactic.rule, mult: mult.toFixed(1) })
          : `${tactic.name}: ${tactic.rule}`}
      clickable={!disabled && !hidden}
      onClick={() => onPlay?.(instance)}
      small={compact}
      previewWidth={150}
      data-uid={instance.uid}
      data-tier={tactic.tier}
      data-tag={tactic.tag}
      data-selected={selected ? 'true' : undefined}
      data-replace={replace ? 'true' : undefined}
      data-hidden={hidden ? 'true' : undefined}
      faceDown={hidden}
      back={<span className={styles.tacticBack}><i /><b>⌁</b><i /></span>}
      background={<span className={styles.tacticMaterial} />}
      subject={<span className={styles.tacticCut} aria-hidden="true"><i /><i /><i /></span>}
      information={(
        <span className={styles.tacticInformation}>
          <span className={styles.tacticTag}>{tactic.tag}</span>
          <b className={styles.tacticName}>{tactic.name}</b>
          <span className={styles.tacticRule}>{tactic.rule}</span>
          <span className={styles.tacticSource} data-source={instance.source}>{instance.source === 'igl' ? '⌁' : '✦'}</span>
          {mult != null && <span className={styles.tacticBonus}>×{mult.toFixed(1)}</span>}
        </span>
      )}
      smallSubject={<span className={styles.tacticSmallBand} aria-hidden="true" />}
      smallInformation={(
        <span className={styles.tacticSmallInformation}>
          <b className={styles.tacticSmallName}>{tactic.name}</b>
          <span className={styles.tacticSmallRule}>{tactic.rule}</span>
          {mult != null && <span className={styles.tacticSmallBonus}>×{mult.toFixed(1)}</span>}
        </span>
      )}
    />
  );
}

// One pip per map in the series, filled up to the one in play. `current` counts
// from 1 for a map in progress and from 0 for picks already made.
function StepPips({ current, total, label }) {
  return (
    <ol className={styles.stepPips} role="img" aria-label={label}>
      {Array.from({ length: total }, (_, index) => (
        <li key={index} data-on={index < current ? 'true' : undefined} />
      ))}
    </ol>
  );
}

// A tug between the two squads. The bar's split is the read; the numbers at
// each end are there to compare exactly. Your side is always the accent.
function EdgeBar({ you, them, heat = 0 }) {
  const share = you + them > 0 ? (you / (you + them)) * 100 : 50;
  return (
    <div className={styles.edgeBar} data-heat={heat || undefined} role="img" aria-label={t('Edge: you {you}, them {them}', { you, them })}>
      <b className={styles.edgeYou}>{you}</b>
      <span className={styles.edgeTrack} aria-hidden="true">
        <i style={{ transform: `scaleX(${share / 100})` }} />
      </span>
      <b className={styles.edgeThem}>{them}</b>
    </div>
  );
}

const STEP_LABEL = { base: 'Base', map: 'Map', tactic: 'Call', clash: 'Counter' };

function stepValue(step) {
  return step.key === 'tactic' ? `×${step.value.toFixed(1)}` : `+${step.value}`;
}

function StepTokens({ steps, shown, side }) {
  return (
    <ol className={styles.edgeTokens} data-side={side}>
      {steps.slice(0, shown).map(step => (step.value ? (
        <m.li key={step.key} data-step={step.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.hover, ease: EASE.out }}>
          <small>{t(STEP_LABEL[step.key])}</small>
          <b>{stepValue(step)}</b>
        </m.li>
      ) : null))}
    </ol>
  );
}

// How big a final edge has to be before the meter reacts to it.
const HEAT_AT = [85, 105];

// The sum after a tactic is played, one beat at a time: base, map, tactic,
// counter. Both sides move on the same beat, so the tug is the story.
function EdgeStack({ stack }) {
  const reducedMotion = useReducedMotion();
  const last = stack.you.length - 1;
  const [beat, setBeat] = useState(reducedMotion ? last : 0);
  useEffect(() => {
    if (beat >= last) return undefined;
    const timer = setTimeout(() => setBeat(value => value + 1), stack.beatMs);
    return () => clearTimeout(timer);
  }, [beat, last, stack.beatMs]);
  useEffect(() => {
    if (beat > 0) playUiSound(beat === last && stack.you[last].total >= HEAT_AT[0] ? 'impact' : 'specialty');
  }, [beat, last, stack.you]);
  const you = stack.you[beat].total;
  const heat = beat === last ? HEAT_AT.filter(at => you >= at).length : 0;
  return (
    <div className={styles.edgeStack}>
      <StepTokens steps={stack.you} shown={beat + 1} side="you" />
      <EdgeBar you={you} them={stack.them[beat].total} heat={heat} />
      <StepTokens steps={stack.them} shown={beat + 1} side="them" />
    </div>
  );
}

export function TacticTable({ map, hand, opponentHand = [], opponent, opponentActiveIds = [], onPlay, reveal, step = null, edge = null, multFor = null, onHover = null }) {
  const enemyCards = opponentHand.length ? opponentHand : (reveal?.opponent ? [reveal.opponent] : []);
  // The arena squeezes cards to ~105px below 820px, which is small-face
  // territory; the full face is one press away.
  const narrow = useMediaQuery(NARROW);
  return (
    <section className={styles.table} data-phase="tactics">
      <OpponentShelf opponent={opponent} activeIds={opponentActiveIds} />
      {step && (
        <div className={styles.prepHead} aria-live="polite">
          <StepPips current={step.current} total={step.total} label={t('Map {n} of {total}', { n: step.current, total: step.total })} />
        </div>
      )}
      {/* Your hand | the map being fought over | their hand. The map is the
          axis the two sides mirror across, so it sits in the middle column
          and each hand pulls in toward it. */}
      <div className={styles.tacticArena} data-reveal={reveal ? 'true' : undefined}>
        <AnimatePresence mode="popLayout">
          {reveal ? (
            <m.div key={reveal.player.uid} className={styles.selectedTactic} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.deal, ease: EASE.deal }}>
              <TacticCard instance={reveal.player} selected disabled compact={narrow} />
            </m.div>
          ) : (
            <m.div key="player-hand" className={styles.tacticHand} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {hand.map((card, index) => (
                <m.div key={card.uid} className={styles.handCard} onPointerEnter={() => onHover?.(card)} onPointerLeave={() => onHover?.(null)} onFocus={() => onHover?.(card)} onBlur={() => onHover?.(null)} initial={{ opacity: 0, y: 24, rotate: (index - hand.length / 2) * 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: DUR.deal, ease: EASE.deal, delay: index * STAGGER }}><TacticCard instance={card} onPlay={onPlay} compact={narrow} mult={multFor?.(card) ?? null} /></m.div>
              ))}
            </m.div>
          )}
        </AnimatePresence>
        <div className={styles.arenaCenter}>
          <div className={styles.activeMap}><MapCard card={map} compact /></div>
          <m.span className={styles.clashMark} data-edge={reveal?.edge} transition={{ duration: DUR.transform, ease: EASE.deal }} animate={{ opacity: reveal ? 1 : 0, scale: reveal ? 1 : .75 }}>×</m.span>
        </div>
        <div className={styles.enemyTacticHand}>
          <AnimatePresence mode="popLayout">
            {enemyCards.map((card, index) => {
              const chosen = reveal?.opponent?.uid === card.uid;
              if (reveal && !chosen) return null;
              return (
                <m.div key={card.uid} layout initial={{ opacity: 0, y: -24, rotate: index ? 3 : -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -16, scale: .96 }} transition={{ duration: DUR.deal, ease: EASE.deal }}>
                  <TacticCard instance={card} selected={chosen} disabled hidden={!reveal} compact={narrow} />
                </m.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      {reveal?.stack
        ? <EdgeStack key={reveal.player.uid} stack={reveal.stack} />
        : edge && <EdgeBar you={edge.you} them={edge.them} />}
    </section>
  );
}

function RewardPack({ kind, mark, onChoose }) {
  return (
    <TableCard
      className={styles.rewardPack}
      seed={`reward-${kind}`}
      label={kind === 'player' ? t('Player pack') : t('Tactic pack')}
      clickable
      onClick={() => onChoose(kind)}
      data-kind={kind}
      background={<span className={styles.rewardMaterial} />}
      subject={<span className={styles.packBurst}>{mark}</span>}
      information={<span className={styles.rewardInformation}><b>{kind === 'player' ? t('Player') : t('Tactic')}</b><i>+</i></span>}
    />
  );
}

export function RewardTable({
  step, tacticOffers, tacticHand, onChoosePack, onChooseTactic,
  rewardTacticPicks = [], picksNeeded = 2, pendingTactics = [], onReplace,
}) {
  const incoming = pendingTactics[0] ?? null;
  return (
    <section className={styles.table} data-phase="reward">
      {step === 'packs' && <div className={styles.rewardPair}><RewardPack kind="player" mark="★" onChoose={onChoosePack} /><RewardPack kind="tactic" mark="⌁" onChoose={onChoosePack} /></div>}
      {step === 'tactics' && (
        <div className={styles.rewardTacticsWrap}>
          <span className={styles.rewardPickLabel}>{t('Pick {n} of {total}', { n: picksNeeded - rewardTacticPicks.length, total: tacticOffers.length })}</span>
          <div className={styles.rewardTactics}>
            {tacticOffers.map(card => (
              <TacticCard key={card.uid} instance={card} selected={rewardTacticPicks.some(picked => picked.uid === card.uid)} onPlay={onChooseTactic} />
            ))}
          </div>
        </div>
      )}
      {step === 'replace' && incoming && (
        <div className={styles.replaceTable}>
          {pendingTactics.length > 1 && <span className={styles.rewardPickLabel}>{t('{n} tactics left to place', { n: pendingTactics.length })}</span>}
          <TacticCard instance={incoming} selected disabled />
          <span className={styles.replaceArrow}><GameIcon name="arrow" dir="right" size={16} /></span>
          <div className={styles.replaceHand}>{tacticHand.map(card => <TacticCard key={card.uid} instance={card} compact replace onPlay={onReplace} />)}</div>
          <TacticalButton className={styles.replaceKeep} onClick={() => onReplace(null)}>{t('Keep hand')}</TacticalButton>
        </div>
      )}
    </section>
  );
}

export function MapPatchTable({ cards }) {
  if (!cards?.length) return null;
  return (
    <section className={styles.patchTable} aria-label={t('Map rule changes')}>
      <div className={styles.patchCards}>{cards.map((card, index) => <m.div key={card.id} initial={{ opacity: 0, y: -20, rotate: (index - 1) * .5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: DUR.deal, ease: EASE.deal, delay: index * STAGGER }}><MapCard card={card} compact /></m.div>)}</div>
    </section>
  );
}
