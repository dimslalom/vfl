import { useCallback, useEffect, useState } from 'react';
import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { STARTERS, clubById, findCard, squadCards } from '../../engine/club/season';
import { storyActLabel } from '../../engine/story/storyMemory';
import { t } from '../../lib/i18n';
import { playUiSound } from '../../lib/uiSound';
import ClubLogo from '../ClubLogo';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { DEFAULT_MAP } from './clubSummary';

const STAGE_CARD_SCALE = 0.3;

const MANAGER_PHOTO = '/assets/players/manager-silhouette.png';

function makeManagerCard(tier = 'silver') {
  return {
    id: 'manager-you',
    player: t('You'),
    role: t('Manager'),
    palette: tier ?? 'silver',
    photo: MANAGER_PHOTO,
    noKitSwap: true,
  };
}

/**
 * Manager card: renders a full player card with no stat or stat bg, displaying
 * the authentic photo silhouette of a man (sourced from Pexels, cottonbro studio).
 * When `mini` is set (e.g. board series comms), renders a compact tactical badge.
 */
export function ManagerSilhouette({ pose = 'command', active = false, mini = false, tier = 'silver' }) {
  if (mini) {
    return (
      <span className={styles.managerMiniWrap} data-active={active || undefined} data-pose={pose}>
        <img
          src={assetPath(MANAGER_PHOTO)}
          alt=""
          className={styles.managerMiniImg}
          draggable={false}
        />
      </span>
    );
  }

  return (
    <PlayerCard
      card={makeManagerCard(tier)}
      showStats={false}
      showStatBg={false}
      showSpecialties={false}
      displayScale={STAGE_CARD_SCALE}
      tilt
      canDrag={false}
    />
  );
}

/**
 * Procedural architectural venue backdrop for the dynamic cutscene & dialogue stage.
 */
function VenueBackdrop({ venue = 'locker' }) {
  return (
    <svg className={styles.venueSvg} viewBox="0 0 960 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* Shared horizon & floor grid lines */}
      <line x1="0" y1="250" x2="960" y2="250" stroke="var(--line-bracket)" strokeWidth="2" />
      <line x1="120" y1="250" x2="40" y2="320" stroke="var(--line-bracket)" strokeWidth="1" />
      <line x1="480" y1="250" x2="480" y2="320" stroke="var(--line-bracket)" strokeWidth="1" />
      <line x1="840" y1="250" x2="920" y2="320" stroke="var(--line-bracket)" strokeWidth="1" />

      {venue === 'cafe' && (
        <g>
          <rect x="80" y="24" width="800" height="14" fill="var(--plate)" stroke="var(--line-bracket)" />
          {[180, 310, 440, 570, 700].map(x => (
            <g key={x}>
              <rect x={x} y="140" width="84" height="56" fill="var(--plate-inset)" stroke="var(--line-bracket)" strokeWidth="2" />
              <rect x={x + 34} y="196" width="16" height="24" fill="var(--plate)" />
              <rect x={x + 18} y="220" width="48" height="6" fill="var(--line-bracket)" />
            </g>
          ))}
          <rect x="120" y="226" width="720" height="10" fill="var(--plate)" />
        </g>
      )}

      {venue === 'locker' && (
        <g>
          {[70, 150, 730, 810].map(x => (
            <g key={x}>
              <rect x={x} y="44" width="68" height="206" fill="var(--plate-inset)" stroke="var(--line-bracket)" strokeWidth="2" />
              <line x1={x + 14} y1="68" x2={x + 54} y2="68" stroke="var(--line-bracket)" strokeWidth="2" />
              <line x1={x + 14} y1="80" x2={x + 54} y2="80" stroke="var(--line-bracket)" strokeWidth="2" />
            </g>
          ))}
          {/* Tactical playbook board at center */}
          <rect x="330" y="48" width="300" height="156" fill="var(--plate-inset)" stroke="var(--line-bracket)" strokeWidth="2" />
          <line x1="480" y1="48" x2="480" y2="204" stroke="var(--line-bracket)" strokeDasharray="6 6" />
          <path d="M370 160L430 100L465 125" stroke="var(--win)" strokeWidth="3" fill="none" />
          <rect x="424" y="94" width="12" height="12" fill="var(--win)" />
          <path d="M590 90L530 145" stroke="var(--accent)" strokeWidth="3" fill="none" />
          <rect x="524" y="139" width="12" height="12" fill="var(--accent)" />
        </g>
      )}

      {venue === 'tunnel' && (
        <g>
          <polygon points="140,10 820,10 720,250 240,250" fill="none" stroke="var(--line-bracket)" strokeWidth="2" />
          <polygon points="240,46 720,46 650,250 310,250" fill="none" stroke="var(--line-bracket)" strokeWidth="2" />
          <polygon points="340,84 620,84 580,250 380,250" fill="var(--plate-inset)" stroke="var(--win)" strokeWidth="2" />
          <rect x="370" y="20" width="220" height="8" fill="var(--win)" />
        </g>
      )}

      {venue === 'press' && (
        <g>
          <rect x="140" y="34" width="680" height="176" fill="var(--plate-inset)" stroke="var(--line-bracket)" strokeWidth="2" />
          {[220, 350, 480, 610, 740].map(x => (
            <g key={x}>
              <rect x={x - 24} y="64" width="48" height="20" fill="var(--plate)" />
              <rect x={x - 24} y="114" width="48" height="20" fill="var(--plate)" />
              <rect x={x - 24} y="164" width="48" height="20" fill="var(--plate)" />
            </g>
          ))}
          {/* Press desk and twin microphones */}
          <rect x="260" y="218" width="440" height="32" fill="var(--plate)" stroke="var(--line-bracket)" strokeWidth="2" />
          <path d="M440 218V190L452 182" stroke="var(--ink)" strokeWidth="3" />
          <rect x="448" y="176" width="10" height="10" fill="var(--win)" />
          <path d="M520 218V190L508 182" stroke="var(--ink)" strokeWidth="3" />
          <rect x="502" y="176" width="10" height="10" fill="var(--accent)" />
        </g>
      )}

      {venue === 'office' && (
        <g>
          <rect x="120" y="36" width="320" height="164" fill="var(--plate-inset)" stroke="var(--line-bracket)" strokeWidth="2" />
          {[60, 88, 116, 144, 172].map(y => (
            <line key={y} x1="120" y1={y} x2="440" y2={y} stroke="var(--line-bracket)" strokeWidth="2" />
          ))}
          <rect x="500" y="48" width="320" height="140" fill="var(--plate-inset)" stroke="var(--line-bracket)" strokeWidth="2" />
          <rect x="524" y="72" width="120" height="14" fill="var(--win)" />
          <rect x="524" y="98" width="240" height="10" fill="var(--plate)" />
          <rect x="524" y="118" width="190" height="10" fill="var(--plate)" />
          <rect x="524" y="138" width="220" height="10" fill="var(--plate)" />
        </g>
      )}

      {venue === 'stage' && (
        <g>
          <polygon points="80,18 880,18 830,52 130,52" fill="var(--plate)" stroke="var(--line-bracket)" strokeWidth="2" />
          {[200, 340, 480, 620, 760].map(x => (
            <polygon key={x} points={`${x - 16},52 ${x + 16},52 ${x + 42},250 ${x - 42},250`} fill="var(--plate-inset)" />
          ))}
          <rect x="180" y="198" width="220" height="52" fill="var(--plate)" stroke="var(--line-bracket)" strokeWidth="2" />
          <rect x="560" y="198" width="220" height="52" fill="var(--plate)" stroke="var(--line-bracket)" strokeWidth="2" />
        </g>
      )}

      {venue === 'trophy' && (
        <g>
          <polygon points="440,70 520,70 502,158 458,158" fill="var(--gold)" />
          <polygon points="416,82 440,82 452,134 430,134" fill="var(--gold)" />
          <polygon points="544,82 520,82 508,134 530,134" fill="var(--gold)" />
          <rect x="464" y="158" width="32" height="26" fill="var(--plate-hi)" />
          <rect x="430" y="184" width="100" height="66" fill="var(--plate)" stroke="var(--gold)" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}

function SelectionBrackets() {
  return (
    <span className={styles.choiceBrackets} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

/** One standing stat: value, the picked choice's change before you commit, and the line where it starts to matter. */
function HudStat({ label, value, delta = 0, max = 0, mark = 0, good = false }) {
  const next = max ? Math.max(0, Math.min(max, value + delta)) : Math.max(0, value + delta);
  const over = mark && next >= mark;
  return (
    <div className={styles.storyHudStat}>
      <small>{label}</small>
      <b data-win={(over && good) || undefined} data-out={(over && !good) || undefined}>
        {next}
        {delta !== 0 && <i data-up={delta > 0 || undefined}>{delta > 0 ? `+${delta}` : delta}</i>}
      </b>
      {max > 0 && (
        <span className={styles.storyMeter} style={{ '--v': `${(next / max) * 100}%`, '--m': `${(mark / max) * 100}%` }} aria-hidden="true" />
      )}
    </div>
  );
}

function StoryHud({ state, actLabel, stepLabel, onSkip, preview = null }) {
  return (
    <header className={club.hud}>
      <div className={club.plate}>
        <ClubLogo name={state.name} style={state.crest} tone={state.tone} size={44} />
        <div className={club.titleBlock}>
          <b>{state.name}</b>
          <span className={club.tagRow}>
            {actLabel && <span className={club.tag} data-solid>{actLabel}</span>}
            <span className={club.tag}>{stepLabel ?? t('Year {n}', { n: state.year })}</span>
          </span>
        </div>
      </div>
      <div className={club.chips}>
        {state.story && (
          <div className={styles.storyHudStats} aria-label={t('Club standing')}>
            <HudStat label={t('Trust')} value={state.story.trust} delta={preview?.trust} max={100} mark={60} good />
            <HudStat label={t('Pressure')} value={state.story.pressure} delta={preview?.pressure} max={100} mark={65} />
            <HudStat label={t('Reputation')} value={state.reputation} delta={preview?.reputation} />
          </div>
        )}
        {onSkip && (
          <button type="button" className={club.small} onClick={onSkip}>{t('Skip')}</button>
        )}
      </div>
    </header>
  );
}

/**
 * Dynamic scene composer shared by StoryCutscene and StoryDialogue.
 * Places "YOU" (ManagerSilhouette) on the left and the speaking PlayerCard(s) on the right
 * over a procedural venue stage.
 */
function DynamicSceneStage({
  venue = 'locker',
  pose = 'command',
  activeSide = 'both',
  speakerName,
  speakerRole,
  speakerCard,
  castCards = [],
  rivalClub = null,
  iglId = null,
  tier = 'silver',
}) {
  const youSpeaking = activeSide === 'you' || activeSide === 'both';
  const themSpeaking = activeSide === 'them' || activeSide === 'both';
  const cardsToShow = speakerCard ? [speakerCard] : castCards.slice(0, 3);

  return (
    <div className={styles.sceneStage} data-venue={venue}>
      <VenueBackdrop venue={venue} />

      <div className={styles.stageActors}>
        {/* Left actor: YOU (Team Manager) */}
        <div className={styles.stageActor} data-side="you" data-speaking={youSpeaking || undefined}>
          <div className={styles.stageCardWrap}>
            <ManagerSilhouette pose={pose} active={youSpeaking} tier={tier} />
          </div>
          <div className={styles.actorPlate}>
            <span className={styles.actorPip} data-on={youSpeaking || undefined} />
            <small>{t('Manager')}</small>
            <b>{t('You')}</b>
          </div>
        </div>

        {/* Center stage emblem when a rival club is featured */}
        {rivalClub && (
          <div className={styles.stageCenterMark} aria-hidden="true">
            <ClubLogo name={rivalClub.name} logo={rivalClub.logo} style={rivalClub.crest} tone={rivalClub.tone} size={52} />
            <small>{rivalClub.name}</small>
          </div>
        )}

        {/* Right actor(s): Speaking player card or starting trio */}
        <div className={styles.stageActor} data-side="them" data-speaking={themSpeaking || undefined}>
          <div className={styles.stageCardGroup}>
            {cardsToShow.map((card, idx) => (
              <div key={card.id} className={styles.stageCardWrap}>
                <PlayerCard
                  card={card}
                  isIgl={iglId ? card.id === iglId : idx === 0}
                  displayScale={cardsToShow.length === 1 ? STAGE_CARD_SCALE : 0.24}
                  tilt
                  canDrag={false}
                />
              </div>
            ))}
          </div>
          <div className={styles.actorPlate}>
            <span className={styles.actorPip} data-on={themSpeaking || undefined} />
            <small>{speakerRole ?? (cardsToShow.length > 1 ? t('Starting five') : t('Player'))}</small>
            <b>{speakerName ?? cardsToShow[0]?.player ?? ''}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Milestone cutscene: 2 to 3 storyboard frames rendered on the dynamic scene stage
 * with the Manager Silhouette and squad cards, skippable at any time.
 */
export function StoryCutscene({ state, scene, cards, map = DEFAULT_MAP, onDone }) {
  if (scene?.reel) return <StoryReel state={state} scene={scene} onChoose={onDone} />;
  return <StoryBoardCutscene state={state} scene={scene} cards={cards} map={map} onDone={onDone} />;
}

function StoryBoardCutscene({ state, scene, cards, map = DEFAULT_MAP, onDone }) {
  const frames = scene?.frames ?? [];
  const [index, setIndex] = useState(0);
  const frame = frames[index] ?? frames[0];
  const last = index >= frames.length - 1;
  const starters = squadCards(state, cards).slice(0, STARTERS);
  const iglId = starters[0]?.id;
  const actLabel = storyActLabel(state);

  const goNext = useCallback(() => {
    playUiSound('select');
    if (last) onDone();
    else setIndex(i => i + 1);
  }, [last, onDone]);

  const goPrev = useCallback(() => {
    playUiSound('select');
    setIndex(i => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onDone();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onDone]);

  if (!frame) return null;

  const speakerCard = frame.cardId ? (starters.find(c => c.id === frame.cardId) ?? findCard(state, cards, frame.cardId)) : null;
  const activeSide = frame.side ?? 'both';
  const speakerName = frame.speaker ?? (speakerCard ? speakerCard.player : state.name);

  return (
    <div className={club.stage}>
      <StoryHud
        state={state}
        actLabel={actLabel}
        stepLabel={t('Step {n} / {total}', { n: index + 1, total: frames.length })}
        onSkip={onDone}
      />

      <main className={club.ground} style={{ '--map': `url(${assetPath(map)})` }}>
        <section key={index} className={styles.cinemaWrap} aria-live="polite">
          <DynamicSceneStage
            venue={frame.venue ?? scene?.venue ?? 'stage'}
            pose={frame.pose ?? 'command'}
            activeSide={activeSide}
            speakerName={speakerCard ? speakerCard.player : state.name}
            speakerRole={speakerCard ? (speakerCard.id === iglId ? 'IGL' : t('Squad')) : t('Starting five')}
            speakerCard={speakerCard}
            castCards={starters}
            iglId={iglId}
            tier={state?.tier ?? 'silver'}
          />

          <div className={styles.dialogueDeck}>
            <div className={styles.dialogueHead}>
              <div className={styles.dialogueMeta}>
                <span className={styles.stepKicker}>{frame.kicker}</span>
                <h2 className={styles.dialogueTitle}>{frame.title}</h2>
              </div>
              <div className={styles.pips} role="img" aria-label={t('Step {n} / {total}', { n: index + 1, total: frames.length })}>
                {frames.map((_, i) => <i key={i} data-on={i <= index || undefined} />)}
              </div>
            </div>

            <div className={styles.dialogueExchange}>
              <div className={styles.dialogueTurn} data-side={activeSide === 'you' ? 'you' : 'them'}>
                <span className={styles.turnSpeaker}>{speakerName}</span>
                <p className={styles.turnText}>{frame.body}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.stepAct}>
        <button type="button" className={club.ghost} disabled={index === 0} onClick={goPrev}>
          {t('Back')}
        </button>
        <button type="button" className={club.primary} autoFocus onClick={goNext}>
          {last ? t('Continue') : t('Next')}
        </button>
      </footer>
    </div>
  );
}

/**
 * Interactive dialogue scene: places "YOU" (ManagerSilhouette) opposite the speaking
 * player on the dynamic scene stage, with a back-and-forth dialogue exchange and reply choices.
 */
export function StoryDialogue(props) {
  // Scenes with rendered art play as an illustrated reel; the rest keep the portrait dialogue.
  return props.scene?.reel ? <StoryReel {...props} /> : <StoryPortraitDialogue {...props} />;
}

function SignalIcon({ up = false }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d={up ? 'M6 1 11 10H1z' : 'M6 11 1 2h10z'} fill="currentColor" />
    </svg>
  );
}

const storyArt = name => assetPath(`/assets/story/${name}.webp`);

/**
 * Illustrated reel: full-bleed rendered frames with one caption each, ending on a
 * decision where every choice is shown as its own consequence illustration.
 */
function StoryReel({ state, scene, onChoose }) {
  const reel = scene.reel;
  const choices = scene.choices ?? [];
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(0);
  const deciding = choices.length > 0 && index >= reel.length;
  const lastFrame = !choices.length && index === reel.length - 1;
  const frame = reel[index];

  const next = useCallback(() => {
    if (deciding || lastFrame) { playUiSound('lock_in'); onChoose(picked); return; }
    playUiSound('select'); setIndex(i => i + 1);
  }, [deciding, lastFrame, onChoose, picked]);
  const back = useCallback(() => { playUiSound('select'); setIndex(i => Math.max(0, i - 1)); }, []);
  const skip = useCallback(() => (choices.length ? setIndex(reel.length) : onChoose(0)), [choices.length, onChoose, reel.length]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const n = Number(event.key);
      if (deciding && n >= 1 && n <= choices.length) { event.preventDefault(); setPicked(n - 1); return; }
      if (event.key === 'Enter' || (!deciding && (event.key === ' ' || event.key === 'ArrowRight'))) { event.preventDefault(); next(); }
      else if (deciding && event.key === 'ArrowRight') { event.preventDefault(); setPicked(i => (i + 1) % choices.length); }
      else if (deciding && event.key === 'ArrowLeft') { event.preventDefault(); setPicked(i => (i - 1 + choices.length) % choices.length); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); back(); }
      else if (event.key === 'Escape' && !deciding) { event.preventDefault(); skip(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back, choices.length, deciding, next, skip]);

  return (
    <div className={club.stage}>
      <StoryHud
        state={state}
        actLabel={storyActLabel(state)}
        stepLabel={scene.title}
        onSkip={deciding ? undefined : skip}
        preview={deciding ? choices[picked]?.effects : null}
      />

      <main className={styles.reel}>
        {deciding ? (
          <section key={`c${picked}`} className={styles.reelFrame} data-cam="push">
            {choices[picked]?.art && <img src={storyArt(choices[picked].art)} alt="" draggable="false" />}
            <div className={styles.reelCard} aria-live="polite">
              <h2>{choices[picked]?.label}</h2>
              {choices[picked]?.detail && <p>{choices[picked].detail}</p>}
              <span className={styles.reelSignals}>
                {choices[picked]?.outcome && <span data-gain><SignalIcon up />{choices[picked].outcome}</span>}
                {choices[picked]?.cost && <span data-cost><SignalIcon />{choices[picked].cost}</span>}
              </span>
            </div>
          </section>
        ) : (
          <section key={index} className={styles.reelFrame} data-cam={frame.cam}>
            <img src={storyArt(frame.art)} alt="" draggable="false" />
            <p className={styles.reelSub} aria-live="polite">
              {frame.speaker && <small>{frame.speaker}</small>}
              <span aria-label={frame.line}>
                {[...frame.line].map((ch, i) => <i key={i} aria-hidden="true" style={{ '--i': i }}>{ch}</i>)}
              </span>
            </p>
          </section>
        )}
      </main>

      {deciding && (
        <div className={styles.reelTabs} role="radiogroup" aria-label={scene.title}>
          {choices.map((choice, idx) => (
            <button
              key={choice.label}
              type="button"
              role="radio"
              className={styles.reelTab}
              aria-checked={picked === idx}
              onClick={() => { playUiSound('select'); setPicked(idx); }}
            >
              <kbd>{idx + 1}</kbd>
              <span>{choice.label}</span>
            </button>
          ))}
        </div>
      )}

      <footer className={`${styles.stepAct} ${styles.reelFoot}`}>
        <button type="button" className={club.ghost} disabled={index === 0} onClick={back}>{t('Back')}</button>
        <span className={styles.reelPips} role="img" aria-label={t('Step {n} / {total}', { n: Math.min(index + 1, reel.length + 1), total: reel.length + 1 })}>
          {(choices.length ? [...reel, null] : reel).map((_, i) => <i key={i} data-on={i <= index || undefined} />)}
        </span>
        <button type="button" className={club.primary} autoFocus onClick={next}>
          {deciding ? t('Confirm') : lastFrame ? t('Continue') : t('Next')}
        </button>
      </footer>
    </div>
  );
}

function StoryPortraitDialogue({ state, scene, cards, map = DEFAULT_MAP, onChoose }) {
  const choices = scene?.choices ?? [];
  const [picked, setPicked] = useState(0);
  const [replying, setReplying] = useState(false);
  const squad = squadCards(state, cards);
  const speakerCard = (scene?.cardId && (squad.find(c => c.id === scene.cardId) ?? findCard(state, cards, scene.cardId))) ?? squad[0];
  const rivalClub = scene?.rivalId ? clubById(state, scene.rivalId) : null;
  const onRival = rivalClub && speakerCard && !squad.some(c => c.id === speakerCard.id);
  const role = onRival ? rivalClub.name : (speakerCard?.id === squad[0]?.id ? 'IGL' : state.name);
  const choice = choices[picked] ?? choices[0];

  // Confirm plays your line as its own beat; Continue then applies the choice.
  const confirm = useCallback(() => {
    if (replying) { playUiSound('lock_in'); onChoose(picked); return; }
    playUiSound('select'); setReplying(true);
  }, [onChoose, picked, replying]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const n = Number(event.key);
      if (!replying && n >= 1 && n <= choices.length) { event.preventDefault(); setPicked(n - 1); }
      else if (!replying && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        setPicked(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
      } else if (event.key === 'Enter') { event.preventDefault(); confirm(); }
      else if (event.key === 'Escape' && replying) { event.preventDefault(); setReplying(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choices.length, confirm, replying]);

  if (!scene) return null;

  return (
    <div className={club.stage}>
      <StoryHud state={state} actLabel={storyActLabel(state)} stepLabel={scene.title} preview={choice?.effects} />

      <main className={club.ground} style={{ '--map': `url(${assetPath(map)})` }}>
        <section className={styles.talk}>
          <figure className={styles.talkPortrait}>
            {speakerCard && <PlayerCard card={speakerCard} displayScale={0.42} tilt canDrag={false} />}
            <figcaption>
              <small>{role}</small>
              <b>{scene.speaker}</b>
            </figcaption>
          </figure>

          <div className={styles.talkBody}>
            <p className={styles.talkLine}>{scene.text}</p>

            {replying ? (
              <div className={styles.talkReply} aria-live="polite">
                <small>{t('You')}</small>
                <p>{choice.reply ?? choice.label}</p>
                <span className={styles.reelSignals}>
                  {choice.outcome && <span data-gain><SignalIcon up />{choice.outcome}</span>}
                  {choice.cost && <span data-cost><SignalIcon />{choice.cost}</span>}
                </span>
              </div>
            ) : (
              <div className={styles.talkChoices} role="radiogroup" aria-label={t('Replies')}>
                {choices.map((item, idx) => (
                  <button
                    key={item.label}
                    type="button"
                    role="radio"
                    aria-checked={picked === idx}
                    className={styles.talkChoice}
                    onClick={() => { playUiSound('select'); setPicked(idx); }}
                  >
                    {picked === idx && <SelectionBrackets />}
                    <kbd>{idx + 1}</kbd>
                    <b>{item.label}</b>
                    <span className={styles.reelSignals}>
                      {item.outcome && <span data-gain><SignalIcon up />{item.outcome}</span>}
                      {item.cost && <span data-cost><SignalIcon />{item.cost}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className={styles.stepAct}>
        {replying ? <button type="button" className={club.ghost} onClick={() => setReplying(false)}>{t('Back')}</button> : <span />}
        <button type="button" className={club.primary} autoFocus onClick={confirm}>
          {replying ? t('Continue') : t('Confirm')}
        </button>
      </footer>
    </div>
  );
}

/**
 * Era Chronicle: summarizes the four narrative axes at the end of the Origin campaign
 * before transitioning into the unending Dynasty Eras.
 */
export function StoryChronicle({ state, chronicle, onContinue }) {
  if (!chronicle) return null;
  const art = chronicle.titles > 0 ? 'lift' : 'stage';
  return (
    <div className={club.stage}>
      <StoryHud state={state} actLabel={t('Era chronicle')} stepLabel={t('Year {n}', { n: chronicle.year })} />

      <main className={styles.reel}>
        <section className={styles.reelFrame} data-cam="rise">
          <img src={storyArt(art)} alt="" draggable="false" />
          <article className={styles.cover}>
            <small>{t('Season review, year {n}', { n: chronicle.year })}</small>
            <h2>{chronicle.title}</h2>
            <p>{chronicle.summary}</p>
            <dl>
              {chronicle.axes.map(axis => (
                <div key={axis.label}>
                  <dt>{axis.label}</dt>
                  <dd><b>{axis.value}</b>{axis.fact && <span>{axis.fact}</span>}</dd>
                </div>
              ))}
            </dl>
          </article>
        </section>
      </main>

      <footer className={`${styles.stepAct} ${styles.reelFoot}`}>
        <span />
        <span />
        <button type="button" className={club.primary} autoFocus onClick={onContinue}>
          {t('Continue into next era')}
        </button>
      </footer>
    </div>
  );
}
