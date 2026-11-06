import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import allCards from '../../shared/src/data/cards.json';
import { STAT_KEYS, STAT_LABELS, STAT_LABELS_FULL } from '../../shared/src/data/statFields';
import PlayerCard from '../../shared/src/components/PlayerCard';
import { playUiSound } from '../../shared/src/lib/gameAudio';
import { assetPath } from '../../shared/src/lib/utils';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import BoardSeries from '../components/BoardSeries';
import PackTear from '../pack3d/Pack3DTear';
import EvoShowcase from '../evo3d/EvoShowcase';
import SpecialtyIcon from '../../shared/src/components/SpecialtyIcon';
import { SPECIALTIES } from '../../shared/src/data/specialties';
import { EVO_ART } from '../../shared/src/components/evoArt';
import {
  GOLD_PITY, GOLD_RATING, NAME_MAX, PACK_KEYS, PACK_VALUE, RENAME_PRICE, REROLL_PRICE, TAPE_MAX, TITLES_PER_ICON, clubFatigueExtra, packValue,
  squadMax, stock,
} from '../engine/club/economy';
import {
  canReroll, cleanName, renameClub, setClubCrest, chooseChip, choosePick, goldDue, openBlocker, openPack, rerollChips, setTacticEquipped, useTape as spendTape,
} from '../engine/club/rewards';
import { tapeCount } from '../engine/club/tapes';
import { chipInfo } from '../chip3d/chipData';
import Chip3D from '../chip3d/Chip3D';
import { ChipBrief, ChipGuideButton, ChipLadder, ChipNoteButton } from '../chip3d/ChipHelp';
import { EvoChip, EvoFacts, EvoFits, EvoNoteButton } from '../chip3d/EvoChip';
import { TACTIC_HAND_MAX } from '../engine/endless/seriesCards';
import { FATIGUE_PENALTY_FROM, fatiguePenalty } from '../../shared/src/engine/endless/career';
import { BOARD_SKILLS } from '../engine/board/board';
import {
  CONTRACT_MAX, DRAFT_PACKS, EVO_CHIPS, SKILL_SESSIONS, STARTERS, STAT_STEP, XP_PER_POINT, clubById, clubCard, clubRoster,
  clubScore, closeWindow, commitEvolution, draftPack, finishSeries, isEligibleForEvo, isValidClub, moveSquad, newClub, nextMatch, squadCards, standings,
  trainingOffer, windowOffers, windowTotals,
} from '../engine/club/season';
import { TIER_META } from '../engine/endless/ladder';
import { pickSeriesMaps } from '../prototype/boardSetup';
import ClubLogo from '../components/ClubLogo';
import { LOGO_STYLES, LOGO_TONES, defaultLogoStyle, defaultLogoTone, logoSvg } from '../engine/club/logo';
import { CLUB_SAVE_KEY, clearClub, loadClub, saveClub } from '../lib/clubSave';
import ClubLanding from '../components/club/ClubLanding';
import ClubPrimer from '../components/club/ClubPrimer';
import ClubSettings from '../components/club/ClubSettings';
import ClubHint from '../components/club/ClubHint';
import ClubSyncChoice from '../components/club/ClubSyncChoice';
import ClubRename from '../components/club/ClubRename';
import AmbientBroadcast from '../components/club/AmbientBroadcast';
import { LatestMove, Scout } from '../components/club/HubFeed';
import { attention, pressing } from '../engine/club/attention';
import SeasonIntro from '../components/club/SeasonIntro';
import { stageLabel } from '../components/club/clubSummary';
import useClubSync from '../lib/useClubSync';
import { fetchGlobalClubs, syncClubScore } from '../lib/globalLeaderboard';
import { preloadMusic } from '../lib/music';
import MusicControls from '../components/MusicControls';
import { hintFor, loadOnboarding, markHintSeen, primerDue, saveOnboarding } from '../lib/clubOnboarding';
import { t } from '../lib/i18n';
import { titleCase } from '../lib/titleCase';
import entry from '../components/club/ClubEntry.module.css';
import styles from './Club.module.css';

const cardById = new Map(allCards.map(card => [card.id, card]));
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;
const tapeName = key => STAT_LABELS_FULL[key] ?? BOARD_SKILLS[key]?.label ?? 'Any skill';
const tierName = tier => TIER_META[tier].label;
const initials = name => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
const mapArt = name => assetPath(`/assets/maps/${name.toLowerCase()}.webp`);
const screenFor = state => {
  if (!state) return 'start';
  if (state.phase === 'over') return 'over';
  if (state.phase === 'review') return 'review';
  // A pack torn but not yet picked from waits for its pick, even across a reload.
  if (state.opening) return 'open';
  return 'home';
};
// The match and the hub agree on the series seed, so the hub can show the first map.
const seriesSeed = (state, match) => (state.seed ^ (state.year * 977 + state.week * 131 + match.bestOf)) >>> 0;

// Card sizes for the current screen. `slot` fits five lane slots across the width,
// and `squadSlot` fits a 3 + 2 grid on phones so cards on the Squad screen can be bigger.
function useCardScale() {
  const read = () => {
    if (typeof window === 'undefined') return { scale: 0.4, slot: 0.27, homeSlot: 0.27, heroWidth: 300, heroCard: 0.2, squadSlot: 0.27, phone: false };
    const { innerWidth: w, innerHeight: h } = window;
    const phone = w < 760;
    const scale = phone ? Math.min(0.22, (h - 240) / 2200) : h < 560 ? 0.24 : h < 760 ? 0.32 : 0.4;
    // The squad is the hero, sized to the width it has.
    // Desktop: the five starters share the width, nothing beside them.
    const room = phone ? w - 24 - 4 * 4 : Math.min(w, 1600) - 80 - 48 - 6 * 14 - 64;
    const slotWidth = Math.min(200, room / (phone ? 5 : 6.2)) - (phone ? 2 : 4);
    const maxSlotH = phone ? (h - 330) / 960 : (h - 280) / 1100;
    const slot = Math.max(0.12, Math.min(0.5, slotWidth / 400, maxSlotH));
    // The hub shows the starting five only (the bench lives on the Squad screen).
    // The next match is a full-height column on the right, so it costs the cards width, not height.
    const heroWidth = w < 1500 ? 300 : 360;
    const homeWidth = phone ? slotWidth : Math.min(240, (room - heroWidth - 32) / 5) - 4;
    // The rival's best three fit the hero's width; on phones and short screens they become faces (0).
    const heroFit = Math.min(0.26, (heroWidth - 48) / 3.3 / 400, (h - 640) / 650);
    const heroCard = phone || heroFit < 0.12 ? 0 : heroFit;
    const homeSlot = phone ? slot : Math.max(0.12, Math.min(0.5, homeWidth / 400, maxSlotH));
    // On the Squad screen on phones, starters wrap 3 on top + 2 below so each card is ~30% larger.
    // Subtract stage padding (24), ground padding (16), and 2 column gaps (16) = 56px.
    const squadWidth = phone ? (w - 56) / 3 : slotWidth;
    const maxSquadH = phone ? (h - 340) / 1500 : maxSlotH;
    const squadSlot = phone ? Math.max(0.14, Math.min(0.3, squadWidth / 400, maxSquadH)) : slot;
    return { scale: Math.max(0.14, scale), slot, homeSlot, heroWidth, heroCard, squadSlot, phone };
  };
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

function useEscape(action) {
  const latest = useRef(action);
  useEffect(() => { latest.current = action; });
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') latest.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// ── shared pieces ─────────────────────────────────────────────────────────────

function Tag({ solid, children }) {
  return <span className={styles.tag} data-solid={solid || undefined}>{children}</span>;
}

// A still of the 3D pack and a count: packs are the club's currency.
function Packs({ n, label = true }) {
  return (
    <span className={styles.packs} role="img" aria-label={`${n} ${n === 1 ? 'pack' : 'packs'}`}>
      <img src={assetPath('/assets/pack3d/pack-icon.webp')} alt="" aria-hidden="true" draggable={false} /><b>{n}</b>{label && <small>Packs</small>}
    </span>
  );
}

function Crest({ club, size }) {
  return (
    <span className={styles.crestDisc} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      {club.logo ? <img src={assetPath(club.logo)} alt="" /> : initials(club.name)}
    </span>
  );
}

// The player's own club mark, rebuilt from its name and chosen style.
function OwnMark({ state, size }) {
  return <ClubLogo name={state.name} style={state.crest} tone={state.tone} size={size} />;
}

function BackButton({ onClick, label = 'Back to the club' }) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} onClick={onClick}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
  );
}

function Hud({ title, tags = [], logo, mark, back, chips = [], children }) {
  return (
    <header className={styles.hud}>
      <div className={styles.plate}>
        {back}
        {mark}
        {logo !== undefined && (logo ? <img className={styles.crest} src={assetPath(logo)} alt="" /> : <span className={styles.crest} aria-hidden="true" />)}
        <div className={styles.titleBlock}>
          <b>{title}</b>
          {tags.length > 0 && <span className={styles.tagRow}>{tags.map(([text, solid]) => <Tag key={text} solid={solid}>{text}</Tag>)}</span>}
        </div>
      </div>
      <div className={styles.chips}>
        {chips.map(([value, label]) => <div className={styles.chip} key={label}><b>{value}</b><span>{label}</span></div>)}
        {children}
      </div>
    </header>
  );
}

// The club's screens rest flat and top-down. Each one lands tilted and settles,
// so the 2.5D lives in the arrival; the match board is the one tilted view.
function Ground({ map, className = '', style, children }) {
  return (
    <main className={`${styles.ground} ${className}`} style={map || style ? { ...style, ...(map && { '--map': `url(${map})` }) } : undefined}>
      {children}
    </main>
  );
}

// A card in its place, with nothing behind it to compete: the role (or IGL) as a
// label above, and the contract's years left as bars below.
function Slot({ card, scale, tab, lit, years, note, noteLit, held, onClick, label, isIgl }) {
  return (
    <div className={styles.slot} data-held={held || undefined}>
      <span className={styles.slotTop}>
        {tab && <b data-lit={lit || undefined}>{tab}</b>}
        {note && <em data-lit={noteLit || undefined}>{note}</em>}
      </span>
      <div className={styles.slotCard}>
        <PlayerCard card={card} displayScale={scale} tilt={isIgl} isIgl={isIgl} canDrag={false} onClick={onClick} pressScale={onClick ? 0.97 : 1} />
        {held && <span className={styles.brackets} aria-hidden="true"><i /><i /><i /><i /></span>}
      </div>
      {years != null && (
        <span className={styles.years} role="img" aria-label={label ?? `${years} contract ${years === 1 ? 'year' : 'years'} left`}>
          {Array.from({ length: CONTRACT_MAX }, (_, index) => (
            <i key={index} data-on={index < years || undefined} data-last={years === 1 || undefined} />
          ))}
        </span>
      )}
    </div>
  );
}

function Card({ card, scale, onClick, selected, children, dim, highlight }) {
  return (
    <div className={styles.card} data-dim={dim || undefined}>
      <PlayerCard card={card} displayScale={scale} tilt={false} canDrag={false} onClick={onClick} selected={selected} pressScale={onClick ? 0.97 : 1} highlightStat={highlight} />
      {children}
    </div>
  );
}

// The season as a calendar strip: one cell per league week with its rival, then
// playoffs and the window. This week is filled; a won week turns green, a lost one fades.
function Road({ state }) {
  const cells = state.fixtures.map((week, index) => {
    const id = week.find(pair => pair.includes('you')).find(item => item !== 'you');
    const club = clubById(state, id);
    const played = state.results[index];
    let status;
    if (played) status = played.won ? 'won' : 'lost';
    else if (state.phase === 'league' && index === state.week) status = 'now';
    return { key: index, when: `Week ${index + 1}`, short: `W${index + 1}`, club, name: club.name, status, aria: played ? (played.won ? 'won' : 'lost') : undefined };
  });
  cells.push({ key: 'po', when: 'Playoffs', short: 'PO', name: 'Top 4', status: state.phase === 'playoffs' ? 'now' : undefined });
  cells.push({ key: 'win', when: 'Window', short: 'TW', name: 'Transfers' });
  return (
    <ol className={styles.road} aria-label="Season calendar">
      {cells.map(cell => (
        <li key={cell.key} data-status={cell.status} aria-label={cell.aria ? `${cell.when}, ${cell.name}, ${cell.aria}` : undefined} aria-current={cell.status === 'now' ? 'step' : undefined}>
          <span className={styles.when}><span className={styles.long}>{cell.when}</span><span className={styles.short} aria-hidden="true">{cell.short}</span></span>
          <span className={styles.who}>
            {cell.club && <Crest club={cell.club} size={22} />}
            <b>{cell.name}</b>
          </span>
        </li>
      ))}
    </ol>
  );
}

// ── start ───────────────────────────────────────────────────────────────────

function CrestPicker({ name, value, tone, onStyle, onTone, onClose }) {
  return (
    <div className={styles.crestSheet} role="dialog" aria-modal="true" aria-label={t('Choose club crest')} onClick={onClose}>
      <div className={styles.crestGrid} onClick={event => event.stopPropagation()}>
        <h2>{t('Pick a crest')}</h2>
        {LOGO_STYLES.map(option => (
          <button key={option.id} type="button" className={styles.crestOption} aria-pressed={option.id === value} onClick={() => onStyle(option.id)} autoFocus={option.id === value}>
            <span dangerouslySetInnerHTML={{ __html: logoSvg(name, option.id, tone) }} />
            <b>{t(option.label)}</b>
          </button>
        ))}
        <div className={styles.toneRow} role="group" aria-label={t('Colour')}>
          {LOGO_TONES.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={styles.tone}
              aria-pressed={index === tone}
              aria-label={t(option.label)}
              title={t(option.label)}
              style={{ '--tone-main': option.main, '--tone-second': option.second }}
              onClick={() => onTone(index)}
            />
          ))}
        </div>
        <button type="button" className={styles.crestDone} onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  );
}

// Changing the crest of a club that already exists. Closing keeps the choice.
function CrestEdit({ state, onDone }) {
  const [style, setStyle] = useState(state.crest ?? defaultLogoStyle(state.name));
  const [tone, setTone] = useState(state.tone ?? defaultLogoTone(state.name));
  useEscape(() => onDone(style, tone));
  return <CrestPicker name={state.name} value={style} tone={tone} onStyle={setStyle} onTone={setTone} onClose={() => onDone(style, tone)} />;
}

function Start({ onStart, onExit, scale, exitLabel = 'Back' }) {
  const [seed] = useState(() => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  const [name, setName] = useState('');
  const [picks, setPicks] = useState([]);
  const [crest, setCrest] = useState(null);
  const [toneIndex, setToneIndex] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const shownName = cleanName(name) || t('Your club');
  const style = crest ?? defaultLogoStyle(shownName);
  const tone = toneIndex ?? defaultLogoTone(shownName);
  useEscape(() => setChoosing(false));
  // Each draft pack is torn open before its cards can be picked.
  const [torn, setTorn] = useState(false);
  const done = picks.length >= DRAFT_PACKS;
  const enter = () => {
    if (!done) return;
    playUiSound('lock_in');
    onStart(seed, shownName, picks.map(card => card.id), style, tone);
  };
  const offers = useMemo(() => (done ? [] : draftPack(seed, picks.length, picks.map(card => card.id), allCards)), [seed, picks, done]);
  useEffect(() => {
    if (!torn || done) return undefined;
    if (offers.some(card => card.rating > 80 || card.league === 'icon')) playUiSound('jackpot');
    else playUiSound('reveal', picks.length);
    return undefined;
  }, [torn, done, offers, picks.length]);
  return (
    <div className={styles.stage}>
      <header className={styles.hud}>
        <div className={styles.plate}>
          <button type="button" className={styles.crestButton} aria-label={t('Choose club crest')} aria-haspopup="dialog" onClick={() => setChoosing(true)}>
            <ClubLogo name={shownName} style={style} tone={tone} size={44} />
          </button>
          {/* The name can be typed any time during the draft; once the five are in,
              naming becomes the screen's one task. */}
          {done ? <div className={styles.titleBlock}><b>{cleanName(name) || t('Your club')}</b></div> : (
            <label className={styles.nameField}>
              <span>{t('Club name')}</span>
              <input value={name} maxLength={NAME_MAX} placeholder={t('Your club')} onChange={event => setName(event.target.value)} />
            </label>
          )}
        </div>
        <div className={styles.chips}>
          <BackButton onClick={onExit} label={exitLabel} />
          <div className={styles.chip}><b>{Math.min(picks.length + 1, DRAFT_PACKS)} / {DRAFT_PACKS}</b><span>Pack</span></div>
        </div>
      </header>
      <main className={`${styles.play} ${styles.centered}`}>
        {done && (
          <form className={entry.naming} onSubmit={(event) => { event.preventDefault(); enter(); }}>
            <div className={styles.moment}>{t('Squad ready')}</div>
            <label className={entry.nameBig}>
              <span>{t('Name your club')}</span>
              <input autoFocus value={name} maxLength={NAME_MAX} placeholder={t('Your club')} onChange={event => setName(event.target.value)} />
            </label>
            <p className={styles.sub}>{t('Naming it is free now. Renaming later costs {n} packs.', { n: RENAME_PRICE })}</p>
          </form>
        )}
        {!done && !torn && (
          // The pack stands as tall as the cards that come out of it.
          <div className={styles.packSpot} style={{ '--pack-scale': (580 * scale * 1.25) / 283, height: 580 * scale * 1.25 }}>
            <PackTear key={picks.length} interactive onTorn={() => setTorn(true)} />
          </div>
        )}
        {!done && torn && (
          <div className={styles.offers}>
            {offers.map((card, index) => (
              <div key={card.id} className={styles.dealt} style={{ '--deal': index }}>
                <Card card={card} scale={scale * 1.25} onClick={() => { playUiSound('sign'); setPicks([...picks, card]); setTorn(false); }} />
              </div>
            ))}
          </div>
        )}
      </main>
      <footer className={styles.act}>
        <div className={styles.slots}>
          {Array.from({ length: DRAFT_PACKS }, (_, index) => (picks[index]
            ? <Card key={picks[index].id} card={picks[index]} scale={scale * 0.5} />
            : <span key={index} className={styles.empty} style={{ width: 400 * scale * 0.5, height: 580 * scale * 0.5 }}>Open</span>))}
        </div>
        <button type="button" className={styles.primary} disabled={!done} onClick={enter}>{t('Enter league')}</button>
      </footer>
      {choosing && <CrestPicker name={shownName} value={style} tone={tone} onStyle={setCrest} onTone={setToneIndex} onClose={() => setChoosing(false)} />}
    </div>
  );
}

// ── hub ─────────────────────────────────────────────────────────────────────

function ClubMenu({ onAbandon, onSettings, onPrimer, onRename, onCrest }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  useEscape(() => { setOpen(false); setArmed(false); });
  return (
    <div className={styles.menuWrap}>
      <button type="button" className={styles.iconButton} aria-label="Club menu" aria-expanded={open} onClick={() => { setOpen(!open); setArmed(false); }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      {open && (
        <div className={styles.menu}>
          {onRename && <button type="button" onClick={onRename}>{t('Rename club')}</button>}
          {onCrest && <button type="button" onClick={onCrest}>{t('Change crest')}</button>}
          {onPrimer && <button type="button" onClick={onPrimer}>{t('How it plays')}</button>}
          {onSettings && <button type="button" onClick={onSettings}>{t('Settings')}</button>}
          <button type="button" data-armed={armed || undefined} onBlur={() => setArmed(false)} onClick={() => (armed ? onAbandon() : setArmed(true))}>
            {armed ? 'Tap again to delete this club' : 'Abandon club'}
          </button>
        </div>
      )}
    </div>
  );
}

// The pack counter: one pack and the club's total pack value, then its skill tapes.
// The tier split lives in the vault; tapping the counter goes there.
function PackCounter({ state, onOpen, bump, flyTarget, value: shown }) {
  const value = shown ?? packValue(state);
  const tapes = tapeCount(state);
  const label = `${value} pack value, ${tapes} training ${tapes === 1 ? 'tape' : 'tapes'}`;
  const inner = (
    <>
      <span className={styles.counterPart}>
        <img src={assetPath('/assets/pack3d/pack-icon.webp')} alt="" aria-hidden="true" draggable={false} />
        <b>{value}</b>
      </span>
      <span className={styles.counterPart} data-dim={tapes === 0 || undefined}>
        <TapeCard scale={0.05} />
        <b>{tapes}</b>
      </span>
    </>
  );
  return onOpen
    ? <button type="button" className={styles.counter} data-bump={bump || undefined} data-fly-target={flyTarget || undefined} aria-label={`Vault: ${label}`} onClick={onOpen}>{inner}</button>
    : <span className={styles.counter} data-bump={bump || undefined} data-fly-target={flyTarget || undefined} role="img" aria-label={label}>{inner}</span>;
}

// A reward that travels to where it lives: it shows where it was earned, then flies
// into the pack counter, which bumps as it lands.
function FlyHome({ children, delay = 700, onLand }) {
  const ref = useRef(null);
  const [vars, setVars] = useState(null);
  const reducedMotion = useReducedMotion();
  const landRef = useRef(onLand);
  useEffect(() => { landRef.current = onLand; });
  useLayoutEffect(() => {
    const el = ref.current;
    const target = document.querySelector('[data-fly-target]');
    if (!el || !target || reducedMotion) { landRef.current?.(); return undefined; }
    const from = el.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    setVars({ '--dx': `${to.left + to.width / 2 - (from.left + from.width / 2)}px`, '--dy': `${to.top + to.height / 2 - (from.top + from.height / 2)}px`, '--delay': `${delay}ms` });
    const timer = setTimeout(() => landRef.current?.(), delay + 650);
    return () => clearTimeout(timer);
  }, [delay, reducedMotion]);
  return <span ref={ref} className={styles.fly} data-go={vars ? true : undefined} style={vars ?? undefined}>{children}</span>;
}

const PACK_NAMES = { silver: 'Silver', gold: 'Gold', icons: 'Icons' };
// A still of each kind of 3D pack.
const PACK_STILL = { silver: '/assets/pack3d/pack-icon.webp', gold: '/assets/pack3d/pack-icon-gold.webp', icons: '/assets/pack3d/pack-icon-icons.webp' };
function PackArt({ kind, size = 'm' }) {
  return <img className={styles.packArt} data-kind={kind} data-size={size} src={assetPath(PACK_STILL[kind])} alt="" aria-hidden="true" draggable={false} />;
}

// One size for a tape in a list, so it stays put moving between Inventory and Train.
const tapeItemScale = size => (size.phone ? 0.16 : size.scale * 0.75);
// The same for a chip or an evo in a list.
const itemArtSize = size => (size.phone ? 72 : Math.round(320 * size.scale));

// The cassette still carries the original skill label. Targeted tapes have their own label.
function TapeCard({ scale = 0.3, target }) {
  const size = { width: 400 * scale, height: 580 * scale };
  const art = <img className={styles.tapeCard} src={assetPath('/assets/tape3d/tape-icon.webp')} alt="" aria-hidden="true" draggable={false} style={size} />;
  if (!target) return art;
  return (
    <span className={styles.tapeToken} aria-hidden="true" style={size}>
      {art}
      <span data-stat={STAT_KEYS.includes(target) || undefined} style={{ fontSize: 46 * scale }}>
        {STAT_LABELS[target] ?? SPECIALTIES[target]?.code ?? 'TRAINING'}
      </span>
    </span>
  );
}

// An open bench place: a card-shaped space the size of a bench card, saying how to fill it.
function BenchOpen({ scale, onClick }) {
  const body = (
    <>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      <small>Open a pack</small>
    </>
  );
  const style = { width: 400 * scale, height: 580 * scale };
  return onClick
    ? <button type="button" className={styles.benchOpen} style={style} onClick={onClick} aria-label="Open bench place: open a pack in the vault">{body}</button>
    : <span className={styles.benchOpen} style={style}>{body}</span>;
}

function Home({ state, go, onAbandon, onSettings, onPrimer, size }) {
  const squad = squadCards(state, allCards);
  const match = nextMatch(state);
  const opponent = clubById(state, match.id);
  const pos = standings(state, allCards).find(row => row.you).pos;
  const started = state.results.length > 0;
  const max = squadMax(state);
  const hand = state.hand ?? [];
  const reserve = state.tacticReserve?.length ?? 0;
  const tapes = tapeCount(state);
  // Whatever wants a look marks its tile; the tile's own value says how much.
  const due = new Set(attention(state, 99).map(item => item.go));
  const tile = (screen, label, value, idle) => (
    <button type="button" className={styles.tile} data-idle={idle || undefined} onClick={() => go(screen)}>
      {due.has(screen) && <span className={styles.pip} role="img" aria-label={t('Needs a look')} />}
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
    </button>
  );
  return (
    <div className={styles.stage}>
      <Hud title={state.name} tags={[[tierName(state.tier), true], [`Year ${state.year}`], ...(started ? [[`${ordinal(pos)} in table`]] : [])]} mark={<OwnMark state={state} size={50} />}>
        <PackCounter state={state} onOpen={() => go('vault')} />
        <ClubMenu onAbandon={onAbandon} onSettings={onSettings} onPrimer={onPrimer} onRename={() => go('rename')} onCrest={() => go('crest')} />
      </Hud>
      <Ground className={styles.home} style={{ '--hero-w': `${size.heroWidth}px` }}>
        <Road state={state} />
        <section className={styles.homeSquad} aria-label="Your squad">
          <span className={styles.groupLabel}>Starting five</span>
          <div className={styles.homeRow}>
            {squad.slice(0, STARTERS).map((card, index) => {
              const last = state.contracts[card.id] === 1;
              return <Slot key={card.id} card={card} scale={size.homeSlot} isIgl={index === 0} years={last ? 1 : null} note={last ? 'Last year' : ''} noteLit onClick={() => go('squad')} />;
            })}
          </div>
        </section>
        <nav className={styles.tileRow} aria-label="Club">
          {tile('squad', 'Squad', <><b>{squad.length}</b><small>/ {max}</small></>)}
          {tile('vault', 'Vault', <PackArt kind="silver" size="m" />)}
          {tile('chips', 'Inventory', <><b>{hand.length}</b><small>/ {TACTIC_HAND_MAX}</small>{reserve > 0 && <em className={styles.newBadge}>{reserve} in reserve</em>}</>, hand.length === 0 && reserve === 0 && !state.chipOffer)}
          {tile('train', 'Train', <TapeCard scale={0.07} />, tapes === 0)}
          {tile('league', 'League', started ? <><b>{ordinal(pos)}</b><small>of 6</small></> : <b>–</b>)}
        </nav>
        <aside className={styles.hero}>
          <Scout state={state} cards={allCards} cardScale={size.heroCard}>
            <button type="button" className={`${styles.primary} ${styles.playBig}`} autoFocus onClick={() => go('match')} aria-label={`Play ${opponent.name}, best of ${match.bestOf}`}>Play</button>
          </Scout>
        </aside>
        <LatestMove state={state} cards={allCards} />
      </Ground>
    </div>
  );
}

// ── squad ───────────────────────────────────────────────────────────────────

// Who starts is decided here, before kickoff: tap two to swap. Fatigue costs a
// starter rating; the bench learns at a share of the rate. Roles matter to chips.
// The selected player's card in a menu's side panel (Squad, transfer window).
const SPOTLIGHT_SCALE = 0.38;

// The hub's five menus, in the hub's tile order.
const SECTIONS = [['squad', 'Squad'], ['vault', 'Vault'], ['chips', 'Inventory'], ['train', 'Train'], ['league', 'League']];

// Every club screen wears one header: back, the club, the five menus as tabs (Q and
// E step through them, like a pad's bumpers), the screen's own tabs, then counters.
// Without `go` (the transfer window), the title stands in for the menus.
function ScreenHeader({ state, at, go, title, onBack, tabs, selected, onTab, stats = [], packs }) {
  const current = useRef(null);
  // Centre the active menu in its strip when the strip scrolls (phones). Only the strip
  // moves: scrollIntoView would also scroll the fixed stage sideways.
  useEffect(() => {
    const tab = current.current;
    const strip = tab?.parentElement;
    if (!strip) return;
    const a = tab.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    strip.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [at]);
  useEffect(() => {
    if (!go) return undefined;
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, textarea')) return;
      const step = { q: -1, e: 1 }[event.key.toLowerCase()];
      if (!step) return;
      const index = SECTIONS.findIndex(([key]) => key === at);
      go(SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length][0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, go]);
  return (
    <header className={styles.eafcTopNav}>
      <div className={styles.eafcNavLeft}>
        {onBack && <BackButton onClick={onBack} />}
        <span className={styles.eafcCrumb}>{state.name}</span>
        {go ? (
          <nav className={styles.sections} aria-label="Club">
            {SECTIONS.map(([key, label]) => (
              <button key={key} type="button" ref={key === at ? current : undefined} data-on={key === at || undefined} aria-current={key === at ? 'page' : undefined} onClick={() => key !== at && go(key)}>{label}</button>
            ))}
          </nav>
        ) : <b className={styles.eafcTitle}>{title}</b>}
        {tabs && (
          <>
            <span className={styles.eafcDivider} aria-hidden="true" />
            <nav className={styles.eafcTabs} aria-label={`${title ?? SECTIONS.find(([key]) => key === at)?.[1]} categories`}>
              {tabs.map(([key, label, due]) => (
                <button key={key} type="button" data-on={selected === key || undefined} aria-pressed={selected === key} onClick={() => onTab(key)}>
                  {label}{due && <span className={styles.tabPip} role="img" aria-label={t('Needs a look')} />}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
      <div className={styles.chips}>
        {stats.map(([label, value]) => <div key={label} className={styles.chip}><b>{value}</b><span>{label}</span></div>)}
        <PackCounter state={state} value={packs} onOpen={go && at !== 'vault' ? () => go('vault') : undefined} />
      </div>
    </header>
  );
}

function ManagementScreen({ state, at, go, title, onBack, tabs, selected, onTab, stats, packs, inspector, action, bottom, footer, packed, children }) {
  return (
    <div className={styles.stage}>
      <ScreenHeader state={state} at={at} go={go} title={title} onBack={onBack} tabs={tabs} selected={selected} onTab={onTab} stats={stats} packs={packs} />
      <Ground className={`${styles.managementGround} ${packed ? styles.packed : ''}`}>
        <aside className={styles.managementInspector} aria-label={`${title} selection`}>
          <div className={styles.managementDetails}>{inspector}</div>
          <div className={styles.managementActions}>{action}</div>
        </aside>
        <div className={styles.managementMain}>{children}</div>
        <div className={styles.managementBottom}>{bottom}</div>
      </Ground>
      {footer}
    </div>
  );
}

function LedgerRow({ label, children }) {
  return <div className={styles.eafcLedgerRow}><span>{label}</span><b>{children}</b></div>;
}

function SelectionCorners() {
  return <span className={styles.brackets} aria-hidden="true"><i /><i /><i /><i /></span>;
}

function ItemChoice({ selected, children, ...props }) {
  return (
    <button type="button" aria-pressed={selected} {...props}>
      {selected && <SelectionCorners />}
      {children}
    </button>
  );
}

// A bar that fills to `value` of `max`, scaled rather than resized so it animates on
// the compositor. `bad` turns it red: fatigue past the point where it costs rating.
function Meter({ value, max, bad, label }) {
  return (
    <span className={styles.meterBar} data-bad={bad || undefined} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <i style={{ transform: `scaleX(${Math.min(1, Math.max(0, value / max))})` }} />
    </span>
  );
}

// Contract years as pips, the last one red.
function YearPips({ years }) {
  return (
    <span className={styles.yearPips} role="img" aria-label={`${years} contract ${years === 1 ? 'year' : 'years'} left`}>
      {Array.from({ length: CONTRACT_MAX }, (_, index) => <i key={index} data-on={index < years || undefined} data-last={years === 1 || undefined} />)}
    </span>
  );
}

// A player's state as readouts: fatigue (red once it costs rating) and growth to the next point.
function PlayerReadout({ state, card }) {
  const dev = state.dev?.[card.id];
  const fatigue = dev?.f ?? 0;
  const penalty = fatiguePenalty(dev) + clubFatigueExtra(dev);
  const xp = Math.round(((state.xp?.[card.id] ?? 0) / XP_PER_POINT) * 100);
  return (
    <>
      <LedgerRow label="Fatigue"><span className={styles.readout}>{penalty > 0 && <em>−{penalty.toFixed(1)}</em>}<Meter value={fatigue} max={100} bad={fatigue > FATIGUE_PENALTY_FROM} label={`Fatigue ${fatigue} of 100`} /></span></LedgerRow>
      <LedgerRow label="Growth"><span className={styles.readout}><Meter value={xp} max={100} label={`Growth ${xp}%`} /></span></LedgerRow>
    </>
  );
}

function Squad({ state, go, onMove, onBack, onVault, size }) {
  const squad = squadCards(state, allCards);
  const max = squadMax(state);
  const [selected, setSelected] = useState(squad[0].id);
  const [moving, setMoving] = useState(false);
  useEscape(() => (moving ? setMoving(false) : onBack()));
  const index = Math.max(0, squad.findIndex(card => card.id === selected));
  const player = squad[index];
  const cardScale = size.phone ? 0.23 : Math.min(0.42, Math.max(0.3, size.scale * 1.12));
  const tap = (nextIndex) => {
    if (moving) {
      if (nextIndex !== index) {
        playUiSound(nextIndex === 0 || index === 0 ? 'igl' : 'drop');
        onMove(index, nextIndex);
      }
      setMoving(false);
      return;
    }
    playUiSound('select');
    setSelected(squad[nextIndex].id);
  };
  const slot = (card, position) => (
    <div key={card.id} className={styles.windowSlot} data-moving={moving && position !== index ? true : undefined}>
      <div className={styles.slotCard}>
        <PlayerCard
          card={card}
          displayScale={cardScale}
          isIgl={position === 0}
          tilt={position === 0}
          canDrag={false}
          onClick={() => tap(position)}
        />
        {position === index && <SelectionCorners />}
      </div>
    </div>
  );
  return (
    <ManagementScreen state={state} at="squad" go={go} packed onBack={onBack} stats={[[ 'Squad', `${squad.length}/${max}` ]]} inspector={
      <>
        <div className={styles.eafcSpotlight}>
          <span className={styles.eafcSpotlightTag}>{index === 0 ? 'IGL' : index < STARTERS ? 'Starter' : 'Bench'}</span>
          {!size.phone && <PlayerCard card={player} displayScale={SPOTLIGHT_SCALE} tilt={false} canDrag={false} />}
          <b className={styles.eafcSpotlightName}>{player.player}</b>
        </div>
        <div className={styles.eafcLedgerWrap}>
          <div className={styles.eafcLedger}>
            <LedgerRow label="Role">{player.role}</LedgerRow>
            <LedgerRow label="Contract"><YearPips years={state.contracts[player.id]} /></LedgerRow>
            <PlayerReadout state={state} card={player} />
          </div>
        </div>
      </>
    } action={
      <button type="button" className={styles.eafcSignBtn} onClick={() => setMoving(!moving)}>{moving ? 'Cancel swap' : `Swap ${player.player}`}</button>
    } bottom={
      <section className={styles.eafcStageRow}>
        <h2 className={styles.eafcRowHead}>Bench {squad.length - STARTERS} / {max - STARTERS}</h2>
        <div className={styles.eafcCardsRow}>
          {squad.slice(STARTERS).map((card, i) => slot(card, STARTERS + i))}
          {Array.from({ length: max - squad.length }, (_, i) => <BenchOpen key={i} scale={cardScale * 0.6} onClick={onVault} />)}
        </div>
      </section>
    }>
      <section className={styles.eafcStageRow}>
        <h2 className={styles.eafcRowHead}>Starting five</h2>
        <div className={`${styles.eafcCardsRow} ${styles.squadStarters}`}>{squad.slice(0, STARTERS).map(slot)}</div>
      </section>
    </ManagementScreen>
  );
}

// ── vault ───────────────────────────────────────────────────────────────────

// Packs only: tapes live in Inventory and are spent in Train. A kind you have none
// of dims and loses its button; its pips still show how close the next one is.
function Vault({ state, go, onOpenPack, onBack, onWindow }) {
  useEscape(onBack);
  const dry = state.pity?.gold ?? 0;
  const titles = state.titles ?? 0;
  const toIcon = TITLES_PER_ICON - (titles % TITLES_PER_ICON);
  const blockLabel = { open: 'Pack open', over: 'Closed' };
  const column = (kind) => {
    const count = stock(state, kind);
    const blocker = openBlocker(state, kind);
    return (
      <section key={kind} className={styles.vaultKind} data-empty={count === 0 || undefined}>
        <div className={styles.vaultStack}>
          {Array.from({ length: Math.min(3, Math.max(1, count)) }, (_, index) => <PackArt key={index} kind={kind} size="l" />)}
        </div>
        <div className={styles.vaultCount}><b>{count}</b><span><strong>{PACK_NAMES[kind]}</strong><small>Worth {PACK_VALUE[kind]}</small></span></div>
        <div className={styles.vaultNote}>
          {kind === 'silver' && (
            <>
              <span className={styles.sessions} role="img" aria-label={`${dry} of ${GOLD_PITY} towards a gold`}>
                {Array.from({ length: GOLD_PITY }, (_, index) => <i key={index} data-on={index < dry || undefined} />)}
              </span>
              <small>{goldDue(state) ? 'Next one holds a gold' : `Gold within ${GOLD_PITY - dry}`}</small>
            </>
          )}
          {kind === 'icons' && (
            <>
              <span className={styles.sessions} role="img" aria-label={`${titles % TITLES_PER_ICON} of ${TITLES_PER_ICON} titles towards an icon pack`}>
                {Array.from({ length: TITLES_PER_ICON }, (_, index) => <i key={index} data-on={index < titles % TITLES_PER_ICON || undefined} />)}
              </span>
              <small>Next in {toIcon} {toIcon === 1 ? 'title' : 'titles'}</small>
            </>
          )}
        </div>
        {count > 0
          ? <button type="button" className={styles.ghost} disabled={Boolean(blocker)} onClick={() => onOpenPack(kind)}>{blocker ? blockLabel[blocker] : 'Open'}</button>
          : <span className={styles.vaultUse} aria-hidden="true" />}
      </section>
    );
  };
  return (
    <div className={styles.stage}>
      <ScreenHeader state={state} at="vault" go={go} onBack={onBack} />
      <Ground className={styles.vaultGround}>
        <div className={styles.vaultRow}>{PACK_KEYS.map(column)}</div>
      </Ground>
      {onWindow && (
        <footer className={`${styles.act} ${styles.actEnd}`}>
          <button type="button" className={styles.ghost} onClick={onWindow}>Transfer window</button>
        </footer>
      )}
    </div>
  );
}

// ── pack open ───────────────────────────────────────────────────────────────

function OpenPack({ state, onChoose, size }) {
  const { opening } = state;
  const [torn, setTorn] = useState(false);
  const [picked, setPicked] = useState(null);
  const [passing, setPassing] = useState(false);
  const [tapeLanded, setTapeLanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const cards = opening.ids.map(id => clubCard(state, cardById.get(id)));
  const full = state.squad.length >= squadMax(state);
  // A full squad signs by swapping, as at the transfer window: the weakest goes unless you pick another.
  const squad = full ? squadCards(state, allCards) : [];
  const [swapOutId, setSwapOutId] = useState(() => squad.reduce((low, card) => (!low || card.rating < low.rating ? card : low), null)?.id ?? null);
  const swapOut = squad.find(card => card.id === swapOutId);
  const pickedCard = cards.find(card => card.id === picked);
  const ovrDelta = pickedCard && swapOut ? pickedCard.rating - swapOut.rating : 0;
  const offerScale = size.scale * (full ? 0.8 : 1.15);
  const squadScale = size.scale * 0.55;
  useEffect(() => {
    if (!torn) return undefined;
    if (cards.some(card => card.rating >= GOLD_RATING || card.league === 'icon')) playUiSound('jackpot');
    else playUiSound('reveal', 1);
    return undefined;
  }, [torn]); // eslint-disable-line react-hooks/exhaustive-deps
  const passPack = () => {
    if (passing) return;
    playUiSound('tape');
    if (reducedMotion || (state.tapes ?? 0) >= TAPE_MAX) { onChoose(null); return; }
    setPassing(true);
  };
  return (
    <div className={styles.stage}>
      <Hud title={`${PACK_NAMES[opening.kind]} pack`} tags={[['Pick 1 of 3']]}>
        <PackCounter state={ tapeLanded ? { ...state, tapes: Math.min(TAPE_MAX, (state.tapes ?? 0) + 1) } : state } bump={tapeLanded ? 'tape' : undefined} flyTarget />
        {!torn && <button type="button" className={styles.ghost} onClick={() => { playUiSound('pack_open'); setTorn(true); }}>Skip</button>}
      </Hud>
      <Ground className={styles.openGround}>
        {!torn ? (
          <div className={styles.packSpot} style={{ '--pack-scale': (580 * size.scale * 1.3) / 283, height: 580 * size.scale * 1.3 }}>
            <PackTear type={opening.kind} interactive onTorn={() => setTorn(true)} />
          </div>
        ) : (
          <div className={styles.offers} data-passing={passing || undefined}>
            {cards.map((card, index) => (
              <div key={card.id} className={`${styles.dealt} ${styles.pickCard}`} data-on={picked === card.id || undefined} style={{ '--deal': index }}>
                <span className={styles.guarantee}>{opening.guaranteed && cardById.get(card.id).rating >= GOLD_RATING ? 'Guaranteed gold' : ''}</span>
                <div className={styles.slotCard}>
                  <PlayerCard card={card} displayScale={offerScale} tilt={false} canDrag={false} onClick={() => !passing && setPicked(card.id)} />
                  {picked === card.id && <span className={styles.brackets} aria-hidden="true"><i /><i /><i /><i /></span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {torn && full && (
          <section className={`${styles.eafcStageRow} ${styles.packSwap}`}>
            <div className={styles.eafcCardsRow}>
              {squad.map(card => {
                const isSwap = card.id === swapOutId;
                return (
                  <div key={card.id} className={styles.windowSlot} data-swap={isSwap || undefined}>
                    <div className={styles.slotCard}>
                      <PlayerCard card={card} displayScale={squadScale} tilt={false} canDrag={false} pressScale={0.97} onClick={() => { if (passing) return; playUiSound('select'); setSwapOutId(card.id); }} />
                      {isSwap && <span className={styles.brackets} data-swap="true" aria-hidden="true"><i /><i /><i /><i /></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </Ground>
      {torn && (
        <footer className={`${styles.act} ${styles.actEnd}`}>
          <div className={styles.actPair}>
            <button type="button" className={`${styles.ghost} ${styles.even} ${styles.passFor}`} data-passing={passing || undefined} disabled={passing} onClick={passPack} aria-label="Pass for a skill tape">
              <span>Pass</span>
              <b>+1</b>
              {passing ? (
                <FlyHome delay={0} onLand={() => { playUiSound('vault_bump'); setTapeLanded(true); setTimeout(() => onChoose(null), 220); }}>
                  <TapeCard scale={0.06} />
                </FlyHome>
              ) : (
                <TapeCard scale={0.06} />
              )}
            </button>
            <button type="button" className={`${styles.primary} ${styles.even}`} disabled={!picked || (full && !swapOut) || passing} onClick={() => { playUiSound('sign'); onChoose(picked, full ? swapOut.id : null); }}>{full && swapOut ? <>Swap for {swapOut.player}{pickedCard && <small className={styles.swapGain}>{ovrDelta > 0 ? '+' : ''}{ovrDelta}</small>}</> : 'Sign'}</button>
          </div>
        </footer>
      )}
    </div>
  );
}

// ── chip pick ───────────────────────────────────────────────────────────────

// A chip as a lit 3D object (flat print without WebGL); see src/chip3d/Chip3D.jsx.
function ChipDisc({ chipKey, size = 'm', phase = 0 }) {
  const pixels = typeof size === 'number' ? size : size === 's' ? 52 : size === 'm' ? 72 : 150;
  return <Chip3D chipKey={chipKey} size={pixels} phase={phase} className={styles.chipDisc} />;
}

function Inventory({ state, go, onPick, onEquip, onTraining, onBack, size }) {
  useEscape(onBack);
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const hand = state.hand ?? [];
  const reserve = state.tacticReserve ?? [];
  const tactics = new Map();
  for (const chip of [...hand, ...reserve]) {
    if (!tactics.has(chip.key)) tactics.set(chip.key, { id: `tactic:${chip.key}`, key: chip.key, name: titleCase(chipInfo(chip.key).name), kind: 'tactic' });
  }
  const tacticItems = [...tactics.values()];
  const tapes = Object.entries(state.trainingTapes ?? {}).filter(([, n]) => n > 0);
  if (state.tapes > 0) tapes.unshift([null, state.tapes]);
  const tapeItems = tapes.map(([key, count]) => ({ id: `tape:${key}`, key, name: `${tapeName(key)} tape`, kind: 'tape', count }));
  const evos = new Map();
  for (const key of state.evoInventory ?? []) evos.set(key, (evos.get(key) ?? 0) + 1);
  const evoItems = [...evos].map(([key, count]) => ({ id: `evo:${key}`, key, name: EVO_CHIPS[key].name, kind: 'evo', count }));
  const sections = [
    ['tactics', 'Tactic reserve', tacticItems.filter(item => reserve.some(chip => chip.key === item.key))],
    ['tapes', 'Training tapes', tapeItems],
    ['evos', 'Evos', evoItems],
  ];
  const gridItems = sections.filter(([key]) => tab === 'all' || tab === key).flatMap(([, , items]) => items);
  const available = tab === 'all' ? [...tacticItems, ...tapeItems, ...evoItems] : tab === 'tactics' ? tacticItems : gridItems;
  const item = (selected?.uid ? tacticItems : available).find(entry => entry.id === selected?.id) ?? available[0];
  const equipped = item?.kind === 'tactic' ? hand.filter(chip => chip.key === item.key) : [];
  const copies = item?.kind === 'tactic' ? reserve.filter(chip => chip.key === item.key) : [];
  const remove = equipped.find(chip => chip.uid === selected?.uid) ?? equipped[0];
  const fromHand = selected?.id === item?.id && equipped.some(chip => chip.uid === selected?.uid);
  const action = item?.kind === 'tactic' && (fromHand || !copies.length) ? 'unequip' : 'equip';
  const itemSize = itemArtSize(size);
  const loadoutSize = size.phone ? 52 : 68;
  const art = (entry, large = false) => {
    if (entry.kind === 'tactic') return <ChipDisc chipKey={entry.key} size={large ? 'l' : itemSize} />;
    if (entry.kind === 'tape') return <TapeCard scale={large ? 0.23 : tapeItemScale(size)} target={entry.key} />;
    return <EvoChip evoKey={entry.key} size={large ? 135 : itemSize} />;
  };
  const select = (entry, uid) => {
    playUiSound('select');
    setSelected({ id: entry.id, uid });
  };
  return (
    <ManagementScreen state={state} at="chips" go={go} onBack={onBack} selected={tab} onTab={(key) => { if (key === 'pick') { onPick(); return; } setTab(key); setSelected(null); }} tabs={[
      ...(state.chipOffer ? [['pick', 'Pick a chip', true]] : []), ['all', 'All'], ['tactics', `Tactics (${hand.length + reserve.length})`], ['tapes', `Tapes (${tapeCount(state)})`], ['evos', `Evos (${state.evoInventory?.length ?? 0})`],
    ]} stats={[[ 'Equipped', `${hand.length}/${TACTIC_HAND_MAX}` ]]} inspector={
      item ? (
        <>
          <div className={styles.eafcSpotlight}>
            <span className={styles.eafcSpotlightTag}>{item.kind === 'evo' ? 'Evolution' : item.kind === 'tape' ? 'Training tape' : 'Match tactic'}</span>
            <div className={styles.inventorySpotlightArt}>{art(item, true)}</div>
            <b className={styles.eafcSpotlightName}>{item.name}</b>
          </div>
          <div className={styles.eafcLedgerWrap}>
            <div className={styles.eafcLedger}>
              {item.kind === 'tactic' ? (
                <>
                  <LedgerRow label="Equipped">{equipped.length}</LedgerRow>
                  <LedgerRow label="Reserve">{copies.length}</LedgerRow>
                  <ChipLadder chipKey={item.key} />
                </>
              ) : (
                <>
                  <LedgerRow label="Owned">{item.count}</LedgerRow>
                  {item.kind === 'tape' ? <LedgerRow label="Training">{STAT_KEYS.includes(item.key) ? `+${STAT_STEP} ${tapeName(item.key)}` : '+1 skill session'}</LedgerRow> : <EvoFacts evoKey={item.key} />}
                </>
              )}
            </div>
            {item.kind === 'tactic' && <ChipNoteButton chipKey={item.key} />}
          </div>
        </>
      ) : null
    } action={item && (item.kind === 'tactic' ? (
      <button type="button" className={styles.eafcSignBtn} disabled={action === 'equip' && hand.length >= TACTIC_HAND_MAX} onClick={() => onEquip(action === 'equip' ? copies[0].uid : remove.uid, action === 'equip')}>
        {action === 'unequip' ? 'Unequip' : hand.length >= TACTIC_HAND_MAX ? 'Loadout full' : 'Equip tactic'}
      </button>
    ) : <button type="button" className={styles.eafcSignBtn} onClick={() => onTraining(item)}>Open Training</button>)} bottom={
      <section className={styles.eafcStageRow} aria-label="Match loadout">
        <h2 className={styles.eafcRowHead}>Match loadout</h2>
        <div className={`${styles.eafcCardsRow} ${styles.inventoryLoadout}`} style={{ '--tactic-slot-size': `${loadoutSize}px` }}>
          {Array.from({ length: TACTIC_HAND_MAX }, (_, index) => {
            const chip = hand[index];
            if (!chip) return <span key={index} className={styles.emptyTactic} aria-label="Empty slot" />;
            const entry = tactics.get(chip.key);
            return (
              <ItemChoice key={chip.uid} className={styles.inventoryItem} aria-label={`Equipped ${entry.name}`} selected={selected?.uid === chip.uid} onClick={() => select(entry, chip.uid)}>
                <ChipDisc chipKey={chip.key} size={loadoutSize} />
              </ItemChoice>
            );
          })}
        </div>
      </section>
    }>
      {/* One grid of everything; the tabs above do the sorting. */}
      {gridItems.length ? (
        <div className={styles.itemGrid} aria-label="Items">
          {gridItems.map(entry => (
            <ItemChoice key={entry.id} className={styles.inventoryItem} data-item selected={item?.id === entry.id && !fromHand} onClick={() => select(entry)}>
              <span className={styles.inventoryArt}>{art(entry)}</span>
              <b>{entry.name}</b>
              <span>×{entry.count ?? reserve.filter(chip => chip.key === entry.key).length}</span>
            </ItemChoice>
          ))}
        </div>
      ) : <p className={styles.managementEmpty}>Nothing here yet.</p>}
    </ManagementScreen>
  );
}

export function ChipPick({ state, go, squad, onTake, onPass, onReroll, onBack, onInventory }) {
  useEscape(onBack);
  const offer = state.chipOffer;
  const hand = state.hand ?? [];
  const [picked, setPicked] = useState(null);
  const [drop, setDrop] = useState(null);
  const pickedOption = offer?.options.find(o => o.uid === picked);
  const isEvoPicked = pickedOption?.kind === 'evo' || pickedOption?.evo;
  const full = !isEvoPicked && (hand.length >= TACTIC_HAND_MAX);
  const ready = picked && (!full || drop || isEvoPicked);
  const take = () => { playUiSound('chip_drop'); onTake(picked, drop); };
  // A second tap on the picked chip takes it, once nothing else is needed first.
  const choose = uid => { if (uid === picked && ready) { take(); return; } playUiSound('chip_lift'); setPicked(uid); };
  return (
    <div className={styles.stage}>
      <ScreenHeader state={state} at="chips" go={go} title="Pick a chip" onBack={onBack} selected="pick" onTab={key => key === 'all' && onInventory?.()} tabs={[['pick', 'Pick a chip', true], ['all', 'All']]} />
      <Ground className={styles.chipGround}>
        {offer ? (
          <div className={styles.chipOffer}>
            {offer.options.map((option, index) => {
              if (option.kind === 'evo' || option.evo) {
                const evo = EVO_CHIPS[option.key];
                return (
                  <div key={option.uid} className={styles.chipSlot}>
                    <button type="button" className={styles.chipOption} style={{ '--deal': index }} data-on={picked === option.uid || undefined} aria-pressed={picked === option.uid} onClick={() => choose(option.uid)}>
                      <EvoChip evoKey={option.key} size={140} />
                      <span className={styles.chipTier} data-evo={evo.tier}>{evo.tier} evo</span>
                      <b>{evo.name}</b>
                      <EvoFacts evoKey={option.key} />
                      <EvoFits evoKey={option.key} roster={squad} />
                    </button>
                    <EvoNoteButton evoKey={option.key} className={styles.chipQ} />
                  </div>
                );
              }
              const info = chipInfo(option.key);
              return (
                <div key={option.uid} className={styles.chipSlot}>
                  <button type="button" className={styles.chipOption} style={{ '--deal': index }} data-on={picked === option.uid || undefined} aria-pressed={picked === option.uid} onClick={() => choose(option.uid)}>
                    <ChipDisc chipKey={option.key} size="l" phase={index * 1.7} />
                    <span className={styles.chipTier}>{info.tier}</span>
                    <b>{info.name}</b>
                    <ChipLadder chipKey={option.key} />
                    <ChipBrief chipKey={option.key} roster={squad} effect={false} />
                  </button>
                  <ChipNoteButton chipKey={option.key} className={styles.chipQ} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.plain}>Win a series to pick a new chip.</p>
        )}
        <section className={styles.chipHand} aria-label={`Hand, ${hand.length} of ${TACTIC_HAND_MAX}`}>
          <span className={styles.groupLabel}>Hand {hand.length} / {TACTIC_HAND_MAX}</span>
          <ChipGuideButton />
          <div className={styles.handSlots}>
            {Array.from({ length: TACTIC_HAND_MAX }, (_, index) => {
              const chip = hand[index];
              if (!chip) return <span key={index} className={styles.handSlot} />;
              const droppable = offer && full;
              return (
                <button key={chip.uid} type="button" className={styles.handSlot} data-droppable={droppable || undefined} data-drop={drop === chip.uid || undefined} disabled={!droppable} aria-label={`${chipInfo(chip.key).name}${droppable ? ', drop' : ''}`} onClick={() => { playUiSound('chip_lift'); setDrop(drop === chip.uid ? null : chip.uid); }}>
                  <ChipDisc chipKey={chip.key} size="s" phase={index} />
                </button>
              );
            })}
          </div>
        </section>
      </Ground>
      {offer && (
        <footer className={`${styles.act} ${styles.actEnd}`}>
          {/* Three choices, three buttons of one size: only the colour says which is the main one. */}
          <div className={styles.actPair}>
            <button type="button" className={`${styles.ghost} ${styles.even}`} onClick={() => { playUiSound('drop'); onPass(); }}>Pass</button>
            <button type="button" className={`${styles.ghost} ${styles.even}`} disabled={!canReroll(state)} onClick={() => { playUiSound('chip_reroll'); setPicked(null); onReroll(); }}>
              Reroll<span className={styles.cost}><PackArt kind="silver" size="s" />{REROLL_PRICE}</span>
            </button>
            <button type="button" className={`${styles.primary} ${styles.even}`} disabled={!ready} onClick={take}>Take</button>
          </div>
        </footer>
      )}
    </div>
  );
}

// ── train ───────────────────────────────────────────────────────────────────


function previewEvoCard(baseCard, evoDef, targetLevel = 2) {
  if (!evoDef) return baseCard;
  const l1Stats = evoDef.level1?.stats ?? {};
  const l2Stats = targetLevel === 2 ? (evoDef.level2?.stats ?? {}) : {};
  const addStats = {};
  for (const [k, v] of Object.entries(l1Stats)) {
    addStats[k] = (addStats[k] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(l2Stats)) {
    addStats[k] = (addStats[k] ?? 0) + v;
  }
  const stats = { ...(baseCard.stats ?? {}) };
  for (const [k, v] of Object.entries(addStats)) {
    stats[k] = (stats[k] ?? baseCard[k] ?? 0) + v;
  }
  const evoOvrGain = Math.round(Object.values(addStats).reduce((a, b) => a + b, 0) / STAT_KEYS.length);
  const learned = targetLevel === 2 && evoDef.level2?.skill
    ? [...new Set([...(baseCard.learned ?? []), evoDef.level2.skill])]
    : (baseCard.learned ?? []);
  return {
    ...baseCard,
    ...stats,
    stats,
    rating: (baseCard.rating ?? 0) + evoOvrGain,
    learned,
    evoTheme: evoDef.theme,
    evoLevel: targetLevel,
    evoBadge: targetLevel === 2 ? evoDef.badge : 'EVO I',
  };
}

export function Train({ state, go, onTape, onEvo, onBack, size, initialFocus = null, initialEvoKey = null }) {
  const squad = squadCards(state, allCards);
  const [who, setWho] = useState(0);
  const [picked, setPicked] = useState(initialFocus === 'evo' && initialEvoKey ? `evo:${initialEvoKey}` : initialFocus);
  const [drilling, setDrilling] = useState(false);
  const drillTimer = useRef(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => () => clearTimeout(drillTimer.current), []);
  const back = () => { if (!drilling) onBack(); };
  useEscape(back);
  const card = squad[who];

  const tapes = [
    ...(state.tapes > 0 ? [{ id: 'tape', key: null, count: state.tapes }] : []),
    ...Object.entries(state.trainingTapes ?? {}).filter(([, count]) => count > 0)
      .map(([key, count]) => ({ id: `tape:${key}`, key, count })),
  ];
  const evoInventory = new Map();
  for (const key of state.evoInventory ?? []) evoInventory.set(key, (evoInventory.get(key) ?? 0) + 1);
  const activeEvo = state.activeEvo;
  const evos = [...evoInventory].map(([key, count]) => ({ id: `evo:${key}`, key, count, evo: true }));
  const active = activeEvo && { id: 'active-evo', key: activeEvo.evoKey, evo: true };
  const options = [...tapes, ...(active ? [active] : []), ...evos];
  const chosen = options.find(item => item.id === picked)
    ?? (picked === 'evo' ? active ?? evos[0] : null)
    ?? options[0];
  const evo = chosen?.evo ? EVO_CHIPS[chosen.key] : null;
  const isActive = chosen?.id === active?.id && Boolean(active);
  const evolving = isActive ? squad.find(item => item.id === activeEvo.cardId) : null;
  const subject = evolving ?? card;
  const target = chosen && !evo ? trainingOffer(state, card, chosen.key) : null;
  const isStat = Boolean(target && STAT_KEYS.includes(chosen.key));
  const preview = target ? spendTape(state, card, chosen.key) : state;
  const eligible = evo ? isEligibleForEvo(subject, chosen.key) : null;
  const canEvolve = Boolean(evo && !activeEvo && eligible.eligible);
  const canApply = canEvolve || preview !== state;
  const highlight = isStat ? target.stat : null;
  const nextLevel = isActive && !activeEvo.l1Done ? 1 : 2;
  const after = evo
    ? previewEvoCard(subject, evo, nextLevel)
    : preview !== state ? clubCard(preview, cardById.get(card.id)) : card;

  const choose = (id) => { playUiSound('select'); setPicked(id); };
  const apply = () => {
    if (!canApply || drilling) return;
    const finish = () => {
      setDrilling(false);
      if (evo) {
        playUiSound('train_done');
        onEvo(card.id, chosen.key);
        return;
      }
      const learned = !isStat && target.sessions + 1 >= SKILL_SESSIONS;
      playUiSound(learned ? `skill_${target.skill}` : 'train_done');
      onTape(card, chosen.key);
    };
    if (reducedMotion) {
      finish();
    } else {
      playUiSound(evo ? 'train_start' : 'tape');
      setDrilling(true);
      drillTimer.current = setTimeout(finish, 750);
    }
  };

  const skill = target && BOARD_SKILLS[target.skill];
  const statName = highlight && STAT_LABELS_FULL[highlight];
  const nextGoal = isActive && (activeEvo.l1Done ? evo.level2 : evo.level1);
  const progress = isActive && ((activeEvo.l1Done ? activeEvo.l2Progress : activeEvo.l1Progress) ?? 0);
  const playerScale = size.phone ? 0.22 : Math.max(0.27, size.scale * 0.85);
  return (
    <ManagementScreen state={state} at="train" go={drilling ? () => {} : go} onBack={back} inspector={
      <>
        <section className={styles.trainingPreview} aria-label="Training preview">
          {chosen ? (
            <div className={styles.trainingCompare} data-drill={drilling || undefined}>
              <div className={styles.trainingBefore}>
                <span className={styles.eafcSpotlightTag}>Before</span>
                <PlayerCard card={subject} displayScale={90 / 400} tilt={false} canDrag={false} highlightStat={highlight} />
              </div>
              <span className={styles.trainingArrow} aria-hidden="true">→</span>
              <div>
                <span className={styles.eafcSpotlightTag}>After</span>
                {after.evoTheme
                  ? <EvoShowcase card={after} displayScale={126 / 400} tilt={false} highlightStat={highlight} />
                  : <PlayerCard card={after} displayScale={126 / 400} tilt={false} canDrag={false} highlightStat={highlight} />}
              </div>
            </div>
          ) : (
            <>
              <span className={styles.eafcSpotlightTag}>{who < STARTERS ? (who === 0 ? 'IGL' : 'Starter') : 'Bench'}</span>
              {!size.phone && <PlayerCard card={subject} displayScale={SPOTLIGHT_SCALE} tilt={false} canDrag={false} />}
            </>
          )}
          <b className={styles.eafcSpotlightName}>{subject.player}</b>
          {isStat && (
            <span className={styles.trainingDelta}>{STAT_LABELS[highlight]} {card.stats[highlight]} → {after.stats[highlight]}</span>
          )}
        </section>
        <div className={styles.eafcLedgerWrap}>
          {!chosen && <div className={styles.eafcLedger}><PlayerReadout state={state} card={subject} /></div>}
          {target && (
            <div className={styles.eafcLedger}>
              {isStat
                ? <LedgerRow label="Stat">{statName}</LedgerRow>
                : <LedgerRow label={skill?.label ?? tapeName(chosen.key)}>{skill ? `${target.sessions} / ${SKILL_SESSIONS} → ${target.sessions + 1} / ${SKILL_SESSIONS}` : 'Unavailable'}</LedgerRow>}
              {after.tier !== card.tier && <LedgerRow label="New tier">{after.developmentRating} OVR {after.tier}</LedgerRow>}
              <LedgerRow label="Cost">1 tape</LedgerRow>
            </div>
          )}
          {evo && (
            <>
              <div className={styles.eafcLedger}>
                <LedgerRow label="Evolution">{evo.name}</LedgerRow>
                {nextGoal && <LedgerRow label="Progress">{progress} / {nextGoal.count}</LedgerRow>}
              </div>
              {nextGoal && <span className={styles.plain}>{nextGoal.label}</span>}
              {!isActive && !canEvolve && <span className={styles.plain}>{activeEvo ? 'An Evo is already active.' : eligible.reason}</span>}
            </>
          )}
          {target && !canApply && <span className={styles.plain}>{isStat ? 'This stat is at its training limit.' : 'This player cannot use this skill tape.'}</span>}
        </div>
      </>
    } action={chosen && !isActive && (
      <button type="button" className={styles.eafcSignBtn} disabled={!canApply || drilling} onClick={apply}>
        {drilling ? 'Applying' : evo ? `Evolve ${card.player}` : `Use ${tapeName(chosen.key)} tape`}
      </button>
    )} bottom={
      <section className={styles.eafcStageRow} aria-label="Squad">
        <h2 className={styles.eafcRowHead}>Squad</h2>
        <div className={styles.eafcCardsRow}>
          {squad.map((item, index) => (
            <div className={styles.windowSlot} key={item.id}>
              <PlayerCard card={item} displayScale={playerScale} tilt={false} canDrag={false} onClick={drilling ? undefined : () => {
                if (isActive) setPicked(tapes[0]?.id ?? evos[0]?.id ?? null);
                setWho(index);
              }} />
              {subject.id === item.id && <SelectionCorners />}
              <Meter value={state.dev?.[item.id]?.f ?? 0} max={100} bad={(state.dev?.[item.id]?.f ?? 0) > FATIGUE_PENALTY_FROM} label={`${item.player} fatigue`} />
            </div>
          ))}
        </div>
      </section>
    }>
      <section className={styles.eafcStageRow} aria-label="Training tapes">
        <h2 className={styles.eafcRowHead}>Training tapes</h2>
        <div className={styles.eafcCardsRow}>
          {/* Same item as in Inventory, so a tape looks identical on both screens. */}
          {tapes.length ? tapes.map(item => (
            <ItemChoice key={item.id} className={styles.inventoryItem} data-item selected={chosen?.id === item.id} disabled={drilling} aria-label={`${tapeName(item.key)} tape, ${item.count} owned`} onClick={() => choose(item.id)}>
              <span className={styles.inventoryArt}><TapeCard scale={tapeItemScale(size)} target={item.key} /></span>
              <b>{tapeName(item.key)} tape</b>
              <span>×{item.count}</span>
            </ItemChoice>
          )) : <span className={styles.inventoryItem} data-item data-empty aria-label="No tapes"><span className={styles.inventoryArt}><TapeCard scale={tapeItemScale(size)} /></span><span>×0</span></span>}
        </div>
      </section>
      {(evos.length > 0 || active) && (
        <section className={styles.eafcStageRow} aria-label="Evolutions">
          <h2 className={styles.eafcRowHead}>Evolutions</h2>
          <div className={styles.eafcCardsRow}>
            {[...(active ? [active] : []), ...evos].map(item => (
              <ItemChoice key={item.id} className={styles.inventoryItem} data-item selected={chosen?.id === item.id} disabled={drilling} onClick={() => choose(item.id)}>
                <span className={styles.inventoryArt}><EvoChip evoKey={item.key} size={itemArtSize(size)} /></span>
                <b>{EVO_CHIPS[item.key].name}</b>
                <span>{item.id === 'active-evo' ? 'In progress' : `×${item.count}`}</span>
              </ItemChoice>
            ))}
          </div>
        </section>
      )}
    </ManagementScreen>
  );
}

// ── series result ───────────────────────────────────────────────────────────

export function Result({ state, onContinue, size }) {
  const { scale } = size;
  const { last } = state;
  const opponent = clubById(state, last.opponent);
  const won = last.rounds.filter(round => round.winA).length;
  const [dismissCelebration, setDismissCelebration] = useState(false);
  const tapes = new Map();
  for (const key of last.tapes ?? []) tapes.set(key, (tapes.get(key) ?? 0) + 1);
  const milestones = last.growth.filter(row => row.mvp || row.ovrGain > 0 || row.tier);
  return (
    <div className={styles.stage}>
      <Hud title={opponent.name} logo={opponent.logo ?? null} tags={[[last.stage]]} />
      <Ground className={styles.resultGround}>
        <div className={styles.verdict}>
          <div className={styles.moment} data-won={last.won}>{last.won ? 'Victory' : 'Defeat'}</div>
          <b className={styles.score}>{won}–{last.rounds.length - won}</b>
        </div>
        <ul className={styles.lootPile} aria-label="Series rewards">
          {last.packs > 0 && <li><PackArt kind="silver" /><b>Silver pack ×{last.packs}</b></li>}
          {last.tactic && <li><ChipDisc chipKey={last.tactic.key} /><b>{chipInfo(last.tactic.key).name}</b></li>}
          {[...tapes].map(([key, count]) => (
            <li key={key}><TapeCard scale={0.135} target={key} /><b>{tapeName(key)} tape ×{count}</b></li>
          ))}
          {last.evoReward && <li><EvoChip evoKey={last.evoReward} size={90} /><b>{EVO_CHIPS[last.evoReward].name} Evo</b></li>}
          {last.flawlessRounds > 0 && (
            <li className={styles.flawlessLootItem}>
              <span className={styles.flawlessLootBadge}>{t('FLAWLESS')}</span>
              <b>{t('Clean sweep bonus')}</b>
            </li>
          )}
        </ul>
        {milestones.length > 0 && (
          <ul className={styles.resultMilestones} aria-label="Player milestones">
            {milestones.map(row => (
              <li key={row.id}>
                <b>{cardById.get(row.id)?.player}</b>
                {row.mvp && <span>MVP</span>}
                {row.ovrGain > 0 && <span>+{row.ovrGain} OVR</span>}
                {row.tier && <span data-tier={row.tier}>{row.tier}</span>}
              </li>
            ))}
          </ul>
        )}
        <details className={styles.resultDetails}>
          <summary>Details</summary>
          <ol className={styles.mapRows}>
            {last.rounds.map((round, index) => (
              <li key={index} data-won={round.winA} style={{ '--deal': index }}>
                <img src={mapArt(round.map)} alt="" />
                <b>{round.map}</b>
                <span className={styles.mapScore}>
                  {round.a}–{round.b}
                  {round.a === 3 && <small className={styles.mapFlawlessTag}>{t('FLAWLESS')}</small>}
                </span>
                <em>{round.winA ? 'Won' : 'Lost'}</em>
              </li>
            ))}
          </ol>
          <ul className={styles.resultGrowth} aria-label="Squad growth">
            {last.growth.map(row => (
              <li key={row.id}>
                <span>{cardById.get(row.id)?.player}</span>
                <meter min={0} max={XP_PER_POINT} value={row.pct} aria-label={`Growth to next overall for ${cardById.get(row.id)?.player}`} />
                <b>+{row.gain} XP</b>
              </li>
            ))}
          </ul>
          {last.evoProgress && !last.evoProgress.completed && (
            <p className={styles.plain}>{last.evoProgress.name} ({last.evoProgress.progress}/{last.evoProgress.total})</p>
          )}
        </details>
      </Ground>
      {/* An evo stage finished: its own moment, in the same voice as the series verdict. */}
      {last.evoProgress?.completed && !dismissCelebration && (() => {
        const done = last.evoProgress;
        const evo = EVO_CHIPS[done.evoKey];
        const art = EVO_ART[evo.theme];
        const evolved = squadCards(state, allCards).find(item => item.id === done.cardId);
        const skill = done.skill && SPECIALTIES[done.skill];
        const stage = done.level === 2 ? 'Evo II' : 'Evo I';
        return (
          <div className={styles.evoMoment} role="dialog" aria-modal="true" aria-label={`${evo.name}, ${stage}`}>
            <span className={styles.evoStage} style={{ color: art.metal[1] }}>{stage}</span>
            <h2 className={styles.evoName}>{evo.name}</h2>
            {evolved && <EvoShowcase card={evolved} displayScale={scale * 1.25} tilt={false} />}
            <div className={styles.evoGains}>
              {Object.entries(done.gainedStats ?? {}).map(([key, value]) => (
                <span key={key} className={styles.evoGain}><b>{STAT_LABELS[key]}</b><em className={styles.plus}>+{value}</em></span>
              ))}
            </div>
            {skill && (
              <div className={styles.evoSkill} style={{ color: art.metal[1] }}>
                <SpecialtyIcon spec={skill.key} size={28} />
                <b>{skill.code}</b>
                <span>{skill.name}</span>
                <small>{skill.board}</small>
              </div>
            )}
            <button type="button" className={styles.primary} autoFocus onClick={() => { playUiSound('select'); setDismissCelebration(true); }}>Claim</button>
          </div>
        );
      })()}
      <footer className={styles.act}>
        <button type="button" className={styles.primary} autoFocus onClick={onContinue}>Continue</button>
      </footer>
    </div>
  );
}

// ── league ──────────────────────────────────────────────────────────────────

// The playoffs as a bracket: two semifinals that feed one final. Until the league
// ends, the top four as it stands today fill the seeds, marked as a projection.
function Bracket({ state, table }) {
  const { playoffs } = state;
  const seeds = playoffs?.seeds ?? table.slice(0, 4).map(row => row.id);
  const team = (id, seed, winner) => (
    <li
      className={styles.bracketRow}
      data-you={id === 'you' || undefined}
      data-out={winner && winner !== id ? true : undefined}
      data-won={winner === id || undefined}
    >
      <span className={styles.bracketSeed}>{seed ?? ''}</span>
      {id === 'you' ? <OwnMark state={state} size={24} /> : <Crest club={clubById(state, id)} size={24} />}
      <b className={styles.bracketClubName}>{id === 'you' ? state.name : clubById(state, id).name}</b>
    </li>
  );
  const semi = (index, a, b) => {
    const match = playoffs?.semis[index];
    return (
      <div className={styles.match}>
        <div className={styles.matchHead}>
          <span>{t('Semifinal')} {index + 1}</span>
          <small>Bo3</small>
        </div>
        <ol className={styles.matchPod}>
          {team(match?.ids[0] ?? seeds[a], a + 1, match?.winner)}
          {team(match?.ids[1] ?? seeds[b], b + 1, match?.winner)}
        </ol>
      </div>
    );
  };
  const final = playoffs?.final;
  return (
    <section className={styles.bracket} aria-label={t('Playoffs')}>
      <div className={styles.bracketHead}>
        <h2 className={styles.sectionHead}>{t('Playoffs')}</h2>
        {!playoffs && <Tag>{t('Projected')}</Tag>}
      </div>
      <div className={styles.bracketGrid} data-projected={!playoffs || undefined}>
        <div className={styles.semis}>{semi(0, 0, 3)}{semi(1, 1, 2)}</div>
        <span className={styles.joiner} aria-hidden="true" />
        <div className={styles.match} data-final="true">
          <div className={styles.matchHead}>
            <span>{t('Final')}</span>
            <small>Bo5</small>
          </div>
          {final ? (
            <ol className={styles.matchPod}>
              {team(final.ids[0], null, final.winner)}
              {team(final.ids[1], null, final.winner)}
            </ol>
          ) : (
            <ol className={styles.matchPod} data-pending="true">
              <li className={styles.bracketRow} data-pending="true">
                <span className={styles.bracketSeed} />
                <span className={styles.pendingMark} aria-hidden="true" />
                <span className={styles.pendingClubName}>{t('Semifinal 1 winner')}</span>
              </li>
              <li className={styles.bracketRow} data-pending="true">
                <span className={styles.bracketSeed} />
                <span className={styles.pendingMark} aria-hidden="true" />
                <span className={styles.pendingClubName}>{t('Semifinal 2 winner')}</span>
              </li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function League({ state, go, onBack, onChallenge, size }) {
  useEscape(onBack);
  const [tab, setTab] = useState('season');
  const [globalRows, setGlobalRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const table = standings(state, allCards);

  useEffect(() => {
    let cancelled = false;
    fetchGlobalClubs(state, allCards).then(rows => {
      if (!cancelled) {
        setGlobalRows(rows);
        if (rows.length > 0) setSelectedId(curr => curr ?? rows[0].id);
      }
    });
    return () => { cancelled = true; };
  }, [state]);

  const selectedClub = useMemo(
    () => globalRows.find(c => c.id === selectedId) ?? globalRows[0],
    [globalRows, selectedId],
  );

  return (
    <div className={styles.stage}>
      <ScreenHeader
        state={state}
        at="league"
        go={go}
        onBack={onBack}
        tabs={[['season', t('Season')], ['global', t('Global')]]}
        selected={tab}
        onTab={setTab}
      />
      {tab === 'season' ? (
        <Ground className={styles.leagueGround}>
          <Road state={state} />
          <div className={styles.leagueBody}>
            <section className={styles.leagueTable} aria-label={tierName(state.tier)}>
              <div className={styles.tableHeaderGroup}>
                <div className={styles.bracketHead}>
                  <h2 className={styles.sectionHead}>{tierName(state.tier)}</h2>
                  <span className={styles.tierBars} role="img" aria-label={`Tier ${state.tier + 1} of 3`}>
                    {[0, 1, 2].map(index => <i key={index} data-on={index === state.tier || undefined} />)}
                  </span>
                </div>
                <div className={styles.tableColLabels} aria-hidden="true">
                  <span>W–L</span>
                  <span>RD</span>
                </div>
              </div>
              <ol className={styles.table}>
                {table.map(row => (
                  <Fragment key={row.id}>
                    <li data-you={row.you || undefined}>
                      <b className={styles.pos}>{row.pos}</b>
                      {row.you ? <OwnMark state={state} size={32} /> : <Crest club={clubById(state, row.id)} />}
                      <b className={styles.clubName}>{row.name}</b>
                      <b className={styles.record}>{row.w}–{row.l}</b>
                      <span className={styles.rd} data-sign={Math.sign(row.rd)}>{row.rd > 0 ? `+${row.rd}` : row.rd}</span>
                    </li>
                    {row.pos === 4 && (
                      <li key="cut-playoff" className={styles.cutRow} role="separator" aria-label={t('Playoff line')}>
                        <span>{t('Playoff line')}</span>
                      </li>
                    )}
                    {row.pos === 5 && (
                      <li key="cut-drop" className={styles.cutRow} role="separator" aria-label={t('Drop zone')}>
                        <span>{t('Drop zone')}</span>
                      </li>
                    )}
                  </Fragment>
                ))}
              </ol>
            </section>
            <Bracket state={state} table={table} />
          </div>
        </Ground>
      ) : (
        <Ground className={styles.managementGround}>
          {selectedClub && (
            <aside className={styles.managementInspector} aria-label={selectedClub.name}>
              <div className={styles.managementDetails}>
                <span className={styles.inspectorTag}>
                  {selectedClub.you ? `${t('Rank')} #${selectedClub.pos} (${t('You')})` : `${t('Rank')} #${selectedClub.pos}`}
                </span>
                <h2 className={styles.inspectorName}>{selectedClub.name}</h2>
                {!size?.phone && (
                  <div className={styles.inventorySpotlightArt}>
                    <PlayerCard card={selectedClub.starCard} displayScale={SPOTLIGHT_SCALE} tilt={false} canDrag={false} />
                  </div>
                )}
                <div className={styles.ledger}>
                  <LedgerRow label={t('Score')}>{selectedClub.score}</LedgerRow>
                  <LedgerRow label={t('Record')}>{`${selectedClub.w}-${selectedClub.l}`}</LedgerRow>
                  <LedgerRow label={t('Roster power')}>{`${selectedClub.power} OVR`}</LedgerRow>
                  <LedgerRow label={t('Star player')}>{selectedClub.starCard?.player ?? ''}</LedgerRow>
                </div>
              </div>
              <div className={styles.managementActions}>
                {!selectedClub.you && (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => onChallenge(selectedClub)}
                  >
                    {t('Challenge club')}
                  </button>
                )}
              </div>
            </aside>
          )}
          <div className={styles.managementMain}>
            <ol className={styles.globalTable}>
              <li className={styles.tableHead} aria-hidden="true">
                <span>{t('Rank')}</span>
                <span />
                <span>{t('Club')}</span>
                <span className={styles.globalPower}>{t('Power')}</span>
                <span>{t('Record')}</span>
                <span style={{ textAlign: 'right' }}>{t('Score')}</span>
              </li>
              {globalRows.map(row => {
                const isSelected = row.id === selectedId;
                return (
                  <li
                    key={row.id}
                    data-you={row.you || undefined}
                    data-top={row.pos === 1 ? '1' : undefined}
                    data-cut={row.pos === 10 && globalRows.length > 10 ? t('Top 10') : undefined}
                    onClick={() => setSelectedId(row.id)}
                  >
                    {isSelected && <SelectionCorners />}
                    <b className={styles.pos}>{row.pos}</b>
                    <span className={styles.crestDisc}>
                      <ClubLogo name={row.name} style={row.style} tone={row.tone} size={28} />
                    </span>
                    <div className={styles.clubName}>
                      {row.name}
                      {row.you && <span className={styles.youBadge}>{t('You')}</span>}
                    </div>
                    <span className={styles.globalPower}>{row.power}</span>
                    <b className={styles.record}>{row.w}-{row.l}</b>
                    <b className={styles.globalScore}>{row.score}</b>
                  </li>
                );
              })}
            </ol>
          </div>
        </Ground>
      )}
    </div>
  );
}

// ── year review ─────────────────────────────────────────────────────────────

const PLAYOFF_LABEL = { 1: 'Champion', 2: 'Final', 3: 'Semi-final' };
const MOVEMENT = { promote: 'Promoted', relegate: 'Relegated', warned: 'Last place', hold: 'Held' };

function Review({ state, onNext, size }) {
  const { scale } = size;
  const { review } = state;
  const squad = squadCards(state, allCards);
  const changes = new Map(review.changes.map(row => [row.id, row]));
  const headline = review.placement === 1 ? 'Champions' : `${ordinal(review.leaguePos)} place`;
  const toTier = review.fromTier + (review.movement === 'promote' ? 1 : review.movement === 'relegate' ? -1 : 0);
  useEffect(() => {
    if (review.placement === 1 || review.movement === 'promote') playUiSound('series_win');
    else if (review.movement === 'relegate' || review.movement === 'warned') playUiSound('series_loss');
    else playUiSound('round_win');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.stage}>
      <Hud title={state.name} tags={[[`Year ${state.year}`, true]]}>
        <PackCounter state={state} />
      </Hud>
      <Ground className={styles.resultGround}>
        <div className={styles.verdict}>
          <div className={styles.moment} data-won={review.movement !== 'relegate' && review.movement !== 'warned'}>{headline}</div>
          {/* The year's packs, by kind: each its own pack and count. */}
          <span className={styles.verdictRow}>
            {PACK_KEYS.map(kind => {
              const n = kind === 'silver' ? review.packs : review[kind] ?? 0;
              return n > 0 && <span key={kind} className={styles.gain1}><PackArt kind={kind} size="m" /><b>+{n}</b><small>{PACK_NAMES[kind]}</small></span>;
            })}
          </span>
          <span className={styles.verdictRow}>
            <Tag solid>{PLAYOFF_LABEL[review.placement] ?? 'Out of playoffs'}</Tag>
            <Tag>{MOVEMENT[review.movement]}</Tag>
          </span>
          {toTier !== review.fromTier && (
            <p className={styles.tierMove}><span>{tierName(review.fromTier)}</span><b aria-hidden="true">→</b><span data-to="true">{tierName(toTier)}</span></p>
          )}
          {review.movement === 'warned' && <p className={styles.tierMove}><span data-to="true">Finish last again and the run ends</span></p>}
        </div>
      </Ground>
      <div className={styles.hand}>
        {squad.map(card => {
          const delta = changes.get(card.id)?.delta ?? 0;
          return (
            <div key={card.id} className={styles.handCard}>
              <PlayerCard card={card} displayScale={scale * 0.6} tilt={false} canDrag={false} />
              <b className={styles.delta} data-delta={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>{delta > 0 ? `+${delta}` : delta}</b>
            </div>
          );
        })}
      </div>
      <footer className={`${styles.act} ${styles.actEnd}`}>
        <button type="button" className={styles.primary} autoFocus onClick={onNext}>Transfer window</button>
      </footer>
    </div>
  );
}

// ── transfer window ─────────────────────────────────────────────────────────

function MarketCard({ item, taken, picked, badge, onPick, scale }) {
  return (
    <div className={styles.marketItem} data-on={picked || undefined} data-taken={taken || undefined}>
      <div className={styles.slotCard}>
        {badge && <span className={styles.cardBadge} data-kind={badge.kind}>{badge.text}</span>}
        <PlayerCard card={item.card} displayScale={scale} tilt={false} canDrag={false} onClick={onPick} pressScale={0.97} />
        {picked && <span className={styles.brackets} aria-hidden="true"><i /><i /><i /><i /></span>}
      </div>
    </div>
  );
}

function Window({ state, onClose, size }) {
  const { phone } = size;
  const offers = useMemo(() => windowOffers(state, allCards), [state]);
  const [own, setOwn] = useState({});
  const [buy, setBuy] = useState([]);
  const [drop, setDrop] = useState([]);
  // Maps a newly signed player's id -> the squad player id they swapped in for (so releasing restores them).
  const [swaps, setSwaps] = useState({});
  const [tab, setTab] = useState(() => (offers.mine.length > 0 ? 'mine' : 'free'));
  const [pickId, setPickId] = useState(() => offers.free[0]?.card.id ?? offers.rivals.find(item => !item.locked)?.card.id ?? null);
  const squad = squadCards(state, allCards);
  const [swapOutId, setSwapOutId] = useState(() => squad.reduce((low, card) => (card.rating < low.rating ? card : low), squad[0])?.id ?? null);
  const totals = windowTotals(state, offers, { own, buy, drop });
  const max = squadMax(state);
  const all = [...offers.rivals, ...offers.free];
  const target = all.find(item => item.card.id === pickId) ?? all[0];
  const expiringIds = useMemo(() => new Set(offers.mine.map(item => item.card.id)), [offers.mine]);
  const activeSquad = squad.filter(card => !drop.includes(card.id) && !(expiringIds.has(card.id) && own[card.id] === 'go'));
  const activeSwapOut = activeSquad.find(card => card.id === swapOutId)
    ?? activeSquad.reduce((low, card) => (!low || card.rating < low.rating ? card : low), null);

  const toggleOwn = (id, choice) => {
    playUiSound(choice === 'keep' ? 'sign' : 'drop');
    setOwn(current => ({ ...current, [id]: current[id] === choice ? undefined : choice }));
  };
  const toggleDrop = (id) => {
    if (expiringIds.has(id)) {
      toggleOwn(id, own[id] === 'go' ? 'keep' : 'go');
      return;
    }
    playUiSound(drop.includes(id) ? 'sign' : 'drop');
    setDrop(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  };
  const toggleBuy = (id) => {
    if (buy.includes(id)) {
      playUiSound('drop');
      const restored = swaps[id];
      setBuy(current => current.filter(item => item !== id));
      if (restored) {
        if (expiringIds.has(restored)) setOwn(current => ({ ...current, [restored]: 'keep' }));
        else setDrop(current => current.filter(item => item !== restored));
        setSwaps(current => { const next = { ...current }; delete next[id]; return next; });
      }
      return;
    }
    playUiSound('sign');
    if (totals.squad >= max && activeSwapOut) {
      const outId = activeSwapOut.id;
      if (expiringIds.has(outId)) setOwn(current => ({ ...current, [outId]: 'go' }));
      else setDrop(current => (current.includes(outId) ? current : [...current, outId]));
      setSwaps(current => ({ ...current, [id]: outId }));
    }
    setBuy(current => [...current, id]);
  };
  const badgeFor = (item) => {
    if (buy.includes(item.card.id)) return { kind: 'signed', text: 'SIGNED' };
    if (item.locked) return { kind: 'locked', text: `REP ${item.card.rating}` };
    return null;
  };
  const priceText = (item) => {
    if (!item) return '-';
    if (buy.includes(item.card.id)) return 'Signed';
    if (item.locked) return `Rep ${item.card.rating}+`;
    if (!item.cost) return 'Free';
    return item.cost === 1 ? '1 pack' : `${item.cost} packs`;
  };
  const taken = target && buy.includes(target.card.id);
  const needsSwap = !taken && totals.squad >= max;
  const swapRefund = needsSwap && activeSwapOut && expiringIds.has(activeSwapOut.id)
    ? (offers.mine.find(item => item.card.id === activeSwapOut.id)?.fee ?? 0) + (own[activeSwapOut.id] === 'keep' ? (offers.mine.find(item => item.card.id === activeSwapOut.id)?.renew ?? 0) : 0)
    : 0;
  const canAfford = target ? target.cost <= totals.packs + swapRefund : false;
  const blocked = !target || target.locked || (!taken && (!canAfford || (needsSwap && !activeSwapOut)));
  let signLabel = 'Pick a player';
  if (target) {
    if (taken) signLabel = `Undo ${target.card.player}`;
    else if (target.locked) signLabel = `Needs rep ${target.card.rating}`;
    else if (!canAfford) signLabel = `Need ${target.cost} packs`;
    else if (needsSwap && activeSwapOut) signLabel = `Swap for ${activeSwapOut.player}`;
    else signLabel = `Sign ${target.card.player}`;
  }
  const cardScale = useMemo(() => {
    if (typeof window === 'undefined') return 0.44;
    if (phone) return 0.34;
    const h = window.innerHeight;
    return Math.max(0.38, Math.min(0.48, ((h - 260) / 2) / 580));
  }, [phone]);

  const squadScale = useMemo(() => {
    if (typeof window === 'undefined') return 0.38;
    if (phone) return 0.30;
    const h = window.innerHeight;
    // Every squad place fits across the stage beside the side panel (stage padding 80,
    // panel and its gap 316, row padding 16, 16 between cards).
    const fit = ((window.innerWidth - 80 - 316 - 16) / max - 16) / 400;
    return Math.min(fit, Math.max(0.34, Math.min(0.42, ((h - 280) / 2) / 580)));
  }, [phone, max]);

  const ghostIndex = taken ? -1 : activeSquad.length + buy.length;
  const signed = buy.map(id => all.find(item => item.card.id === id)?.card).filter(Boolean);
  const visibleOffers = tab === 'rivals' ? offers.rivals : tab === 'free' ? offers.free : [...offers.free, ...offers.rivals];
  const ovrDelta = target && activeSwapOut ? target.card.rating - activeSwapOut.rating : 0;
  const switchTab = (nextTab) => {
    playUiSound('select');
    setTab(nextTab);
    const list = nextTab === 'mine' ? offers.mine : nextTab === 'rivals' ? offers.rivals : nextTab === 'free' ? offers.free : all;
    if (list.length > 0 && !list.some(item => item.card.id === pickId)) {
      setPickId(list.find(item => !item.locked)?.card.id ?? list[0].card.id);
    }
  };

  return (
    <ManagementScreen
      state={state}
      title="Transfer window"
      packs={totals.packs}
      selected={tab}
      onTab={switchTab}
      tabs={[
        ...(offers.mine.length > 0 ? [['mine', `Expiring (${offers.mine.length})`]] : []),
        ['free', `Free agents (${offers.free.length})`],
        ['rivals', `Rivals (${offers.rivals.length})`],
        ['all', `All (${all.length})`],
      ]}
      stats={[['Cap', offers.limit], ['Squad', `${totals.squad}/${max}`]]}
      inspector={target && (
        <>
          <div className={styles.eafcSpotlight}>
            <span className={styles.eafcSpotlightTag}>{target.club ? target.club.name : target.trial ? 'Trialist' : 'Free agent'}</span>
            {!phone && <PlayerCard card={target.card} displayScale={SPOTLIGHT_SCALE} tilt={false} canDrag={false} />}
            <b className={styles.eafcSpotlightName}>{target.card.player}</b>
          </div>
          <div className={styles.eafcLedgerWrap}>
            <div className={styles.eafcLedger}>
              <LedgerRow label="Club">{target.club ? target.club.name : target.trial ? 'Trial' : 'Unsigned'}</LedgerRow>
              <div className={styles.eafcLedgerRow}><span>Price</span><b data-win={!target.cost || undefined}>{priceText(target)}</b></div>
              {needsSwap && activeSwapOut ? (
                <>
                  <div className={styles.eafcLedgerRow}><span>Replacing</span><b data-out="true">{activeSwapOut.player} ({activeSwapOut.rating})</b></div>
                  <div className={styles.eafcLedgerRow}>
                    <span>Rating change</span>
                    <b data-win={ovrDelta > 0 || undefined} data-out={ovrDelta < 0 || undefined}>{ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta} OVR</b>
                  </div>
                </>
              ) : <LedgerRow label="Contract"><YearPips years={CONTRACT_MAX} /></LedgerRow>}
            </div>
          </div>
        </>
      )}
      action={target && (
        <button type="button" className={styles.eafcSignBtn} disabled={blocked} onClick={() => toggleBuy(target.card.id)}>
          <span>{signLabel}</span>
          {!taken && !blocked && target.cost > 0 && <Packs n={target.cost} label={false} />}
        </button>
      )}
      bottom={(
        <section className={styles.eafcStageRow}>
          <h2 className={styles.eafcRowHead}>Your squad</h2>
          <div className={styles.eafcCardsRow}>
            {squad.map((card, index) => {
              const isDropped = drop.includes(card.id) || (expiringIds.has(card.id) && own[card.id] === 'go');
              const isSwapTarget = !isDropped && needsSwap && activeSwapOut?.id === card.id;
              let badge = null;
              if (isDropped) badge = { kind: 'out', text: 'OUT' };
              else if (isSwapTarget) badge = { kind: 'swap', text: 'SWAP' };
              else if (index === 0) badge = { kind: 'igl', text: 'IGL' };
              const years = state.contracts[card.id] ?? 1;
              return (
                <div
                  key={card.id}
                  className={styles.windowSlot}
                  data-dropped={isDropped || undefined}
                  data-swap={isSwapTarget || undefined}
                >
                  <div className={styles.slotCard}>
                    {badge && <span className={styles.cardBadge} data-kind={badge.kind}>{badge.text}</span>}
                    <PlayerCard
                      card={card}
                      displayScale={squadScale}
                      tilt={false}
                      canDrag={false}
                      pressScale={0.97}
                      onClick={() => {
                        if (isDropped) {
                          toggleDrop(card.id);
                        } else if (needsSwap) {
                          playUiSound('select');
                          setSwapOutId(card.id);
                        } else {
                          toggleDrop(card.id);
                        }
                      }}
                    />
                    {isSwapTarget && <span className={styles.brackets} data-swap="true" aria-hidden="true"><i /><i /><i /><i /></span>}
                  </div>
                  <span className={styles.years} role="img" aria-label={`${years} contract ${years === 1 ? 'year' : 'years'} left`}>
                    {Array.from({ length: CONTRACT_MAX }, (_, y) => (
                      <i key={y} data-on={y < years || undefined} data-last={years === 1 || undefined} />
                    ))}
                  </span>
                </div>
              );
            })}
            {signed.map(card => (
              <div key={card.id} className={styles.windowSlot} data-new="true">
                <div className={styles.slotCard}>
                  <span className={styles.cardBadge} data-kind="signed">SIGNED</span>
                  <PlayerCard card={card} displayScale={squadScale} tilt={false} canDrag={false} pressScale={0.97} onClick={() => toggleBuy(card.id)} />
                  <span className={styles.brackets} aria-hidden="true"><i /><i /><i /><i /></span>
                </div>
                <span className={styles.years}>
                  {Array.from({ length: CONTRACT_MAX }, (_, y) => <i key={y} data-on="true" />)}
                </span>
              </div>
            ))}
            {Array.from({ length: Math.max(0, max - activeSquad.length - signed.length) }, (_, index) => {
              const isGhost = activeSquad.length + signed.length + index === ghostIndex && target && !target.locked;
              return (
                <div key={`e${index}`} className={styles.windowSlot} data-ghost={isGhost || undefined}>
                  {isGhost ? (
                    <div className={styles.slotCard}>
                      <span className={styles.cardBadge} data-kind="signed">NEXT</span>
                      <PlayerCard card={target.card} displayScale={squadScale} tilt={false} canDrag={false} />
                    </div>
                  ) : (
                    <BenchOpen scale={squadScale} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      footer={(
        <footer className={styles.act}>
          <div className={styles.notes} role="status">
            {totals.undecided > 0 && <span data-block="true">{totals.undecided} expiring to decide</span>}
            {drop.length > 0 && <span>{drop.length} released</span>}
            {totals.trialists > 0 && <span>{totals.trialists} trialist{totals.trialists > 1 ? 's' : ''} will join</span>}
          </div>
          <div className={styles.actPair}>
            <button type="button" className={styles.ghost} disabled={!totals.canClose} onClick={() => { playUiSound('lock_in'); onClose({ own, buy, drop }); }}>Start year {state.year + 1}</button>
          </div>
        </footer>
      )}
    >
      {tab === 'mine' && offers.mine.length > 0 ? (
        <section className={styles.eafcStageRow}>
          <div className={styles.expiring}>
            {offers.mine.map(item => (
              <div className={styles.expiringRow} key={item.card.id}>
                <PlayerCard card={item.card} displayScale={cardScale} tilt={false} canDrag={false} />
                <div className={styles.decide}>
                  {item.suitor && <span className={styles.suitor}><Crest club={clubById(state, item.suitor.id)} size={22} /><span>wants them</span></span>}
                  <button type="button" className={styles.small} data-on={own[item.card.id] === 'keep' || undefined} disabled={own[item.card.id] !== 'keep' && item.renew > totals.packs} aria-pressed={own[item.card.id] === 'keep'} onClick={() => toggleOwn(item.card.id, 'keep')}>
                    <span>Renew</span><Packs n={item.renew} label={false} />
                  </button>
                  <button type="button" className={styles.small} data-on={own[item.card.id] === 'go' || undefined} aria-pressed={own[item.card.id] === 'go'} onClick={() => toggleOwn(item.card.id, 'go')}>
                    <span>Let go</span><Packs n={`+${item.fee}`} label={false} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles.eafcStageRow}>
          <div className={styles.eafcCardsRow}>
            {visibleOffers.map(item => (
              <MarketCard key={item.card.id} item={item} scale={cardScale} taken={buy.includes(item.card.id)} picked={target?.card.id === item.card.id} badge={badgeFor(item)} onPick={() => setPickId(item.card.id)} />
            ))}
          </div>
        </section>
      )}
    </ManagementScreen>
  );
}

// ── game over ───────────────────────────────────────────────────────────────

const yearResult = year => PLAYOFF_LABEL[year.placement] ?? `${ordinal(year.leaguePos)} in league`;

function Over({ state, onAgain }) {
  return (
    <div className={styles.stage}>
      <Hud title={state.name} tags={[[tierName(state.tier), true]]} chips={[[state.titles, 'Titles'], [state.year, 'Years'], [state.seriesWon, 'Series won']]} />
      <Ground className={styles.resultGround}>
        <div className={styles.moment} data-won="false">Sacked</div>
        <div className={styles.finalScore}><b>{clubScore(state).toLocaleString('en-US')}</b><span>Score</span></div>
        <ol className={styles.history} aria-label="Your years">
          {(state.history ?? []).map(year => (
            <li key={year.year}><b>Year {year.year}</b><span>{tierName(year.tier)}</span><em>{yearResult(year)}</em></li>
          ))}
        </ol>
      </Ground>
      <footer className={`${styles.act} ${styles.actEnd}`}>
        <button type="button" className={styles.primary} autoFocus onClick={onAgain}>New club</button>
      </footer>
    </div>
  );
}

function Damaged({ onReset }) {
  const [armed, setArmed] = useState(false);
  return (
    <div className={styles.stage}>
      <Hud title="Saved club" tags={[["Can't be read"]]} />
      <Ground className={styles.resultGround}>
        <div className={styles.moment} data-won="false">Save damaged</div>
        <p className={styles.sub}>This club can't be loaded, usually because player data has changed since it was saved.</p>
      </Ground>
      <footer className={`${styles.act} ${styles.actEnd}`}>
        <button type="button" className={styles.primary} onClick={() => (armed ? onReset() : setArmed(true))}>{armed ? 'Delete and start over' : 'New club'}</button>
      </footer>
    </div>
  );
}

function signinNotice(result) {
  if (result === 'cancelled') return t('Sign-in cancelled.');
  if (result === 'failed') return t('Couldn’t sign in with Discord. Try again.');
  return '';
}

// An account's club is used only if this build can still play it.
function isCloudClub(state) {
  return state?.v === 2 && isValidClub(state, allCards);
}

function readSave() {
  const { state, damaged } = loadClub();
  if (damaged) return { state: null, damaged: true };
  if (state && !isValidClub(state, allCards)) return { state: null, damaged: true };
  return { state, damaged: false };
}

// ── the game ────────────────────────────────────────────────────────────────

export default function Club() {
  const size = useCardScale();
  const [boot] = useState(readSave);
  const [state, setState] = useState(boot.state);
  // Every visit opens on the landing: a new player learns what the mode is, a
  // returning one sees their club and Continue.
  const [screen, setScreen] = useState('landing');
  const [trainingItem, setTrainingItem] = useState(null);
  const [exhibition, setExhibition] = useState(null);
  const [exhibitionResult, setExhibitionResult] = useState(null);
  // With a chip pick waiting, the Inventory menu opens on the pick; its tab flips to the rest.
  const [chipView, setChipView] = useState('pick');
  // The menus' own tabs: a fresh visit, nothing carried over from the last one.
  const goTab = (next) => { setTrainingItem(null); setChipView('pick'); setScreen(next); };
  const [prefs, setPrefs] = useState(loadOnboarding);
  // Where the primer and settings hand back to, since both open from more than one place.
  const [primerNext, setPrimerNext] = useState('start');
  const [settingsBack, setSettingsBack] = useState('landing');
  const [damaged, setDamaged] = useState(boot.damaged);
  const [saveFailed, setSaveFailed] = useState(false);
  // Coming back from Discord, say once how sign-in went.
  const [notice, setNotice] = useState(() => signinNotice(new URLSearchParams(window.location.search).get('signin')));
  const reducedMotion = useReducedMotion();
  // Optional Discord account: the device save stays the source of truth and the
  // account gets a copy. A club is only valid if every player in it still exists.
  const sync = useClubSync({ state, setState, isValid: isCloudClub });
  // Then drop ?signin= so a reload doesn't repeat it.
  const [params, setParams] = useSearchParams();
  const signinResult = params.get('signin');
  useEffect(() => {
    if (signinResult) setParams({}, { replace: true });
  }, [signinResult, setParams]);
  const screenRef = useRef(screen);
  const show = next => setScreen(next);
  useEffect(() => { screenRef.current = screen; });
  // Match music is fetched and decoded while the player is in the menus, so the
  // first match intro can start it on time.
  useEffect(() => {
    const idle = setTimeout(preloadMusic, 1500);
    return () => clearTimeout(idle);
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    const saved = saveClub(state);
    const report = setTimeout(() => setSaveFailed(!saved));
    return () => clearTimeout(report);
  }, [state]);

  // Another tab moved this club on: follow it, unless a match is on screen.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== CLUB_SAVE_KEY || screenRef.current === 'match') return;
      const next = readSave();
      setState(next.state);
      setDamaged(next.damaged);
      setScreen(screenFor(next.state));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function updatePrefs(next) {
    setPrefs(next);
    saveOnboarding(next);
  }

  function openPrimer(next) {
    setPrimerNext(next);
    show('primer');
  }

  function openSettings(back) {
    setSettingsBack(back);
    show('settings');
  }

  function finishPrimer() {
    updatePrefs({ ...prefs, primerSeen: true });
    show(primerNext);
  }

  // Founding a club runs the primer first, unless it was seen or switched off.
  const found = () => (primerDue(prefs) ? openPrimer('start') : show('start'));

  // One first-week tip on the screen it explains, laid over that screen.
  // `place` says where the tip sits when one screen key covers two layouts (Inventory, chip pick).
  const withHint = (view, at, place) => {
    const hint = hintFor(prefs, state, at);
    if (!hint) return view;
    return (
      <>
        {view}
        <ClubHint
          key={hint}
          screen={hint}
          place={place}
          onDismiss={() => updatePrefs(markHintSeen(prefs, hint))}
          onHintsOff={() => updatePrefs({ ...prefs, hints: false })}
        />
      </>
    );
  };

  function start(seed, name, picks, crest, tone) {
    setState(newClub({ seed, name, picks, crest, tone, cards: allCards }));
    setScreen('season');
  }

  function finishMatch(outcome) {
    setState(current => {
      if (!current || current.year !== state.year || current.week !== state.week || current.phase !== state.phase
        || nextMatch(current)?.id !== nextMatch(state)?.id) return current;
      const next = finishSeries(current, outcome, allCards);
      syncClubScore(next, allCards);
      return next;
    });
    setScreen('result');
  }

  function startChallenge(club) {
    setExhibition(club);
    setScreen('exhibition');
  }

  function commitEvoPlayer(cardId, evoKey) {
    setTrainingItem(null);
    setState(current => commitEvolution(current, cardId, evoKey));
    setNotice(`${cardById.get(cardId)?.player ?? 'Player'} started ${EVO_CHIPS[evoKey]?.name ?? 'Evolution'}`);
    setScreen('home');
  }

  function openThePack(kind) {
    setState(current => openPack(current, kind, allCards));
    setScreen('open');
  }

  function pickFromPack(id, releaseId) {
    setState(current => choosePick(current, id, releaseId));
    setScreen('vault');
  }

  function takeChip(uid, drop) {
    setState(current => chooseChip(current, uid, drop));
    setScreen('home');
  }

  function tapePlayer(card, key) {
    setState(current => spendTape(current, card, key));
  }

  function closeTheWindow(decisions) {
    const next = closeWindow(state, decisions, allCards);
    setState(next);
    // A closed window opens a new year, and a new year opens with its intro.
    setScreen(next !== state && next.phase === 'league' && next.week === 0 ? 'season' : 'home');
  }

  function fresh() {
    clearClub();
    sync.forget();
    setState(null);
    setDamaged(false);
    setScreen('start');
  }

  const alerts = saveFailed && <p className={styles.alert} role="alert">Progress isn't saving on this device</p>;

  if (damaged) return <Damaged onReset={fresh} />;
  if (sync.conflict) return <ClubSyncChoice local={sync.conflict.local} cloud={sync.conflict.cloud} onKeepDevice={sync.keepDevice} onKeepAccount={sync.keepAccount} />;
  if (screen === 'landing') {
    const next = state && nextMatch(state);
    const map = next ? pickSeriesMaps(seriesSeed(state, next), next.bestOf)[0]?.image : undefined;
    const due = state ? pressing(state).length > 0 : false;
    return (
      <>
      <ClubLanding
        state={state}
        account={sync.account}
        map={map}
        due={due}
        onContinue={() => show(screenFor(state))}
        onFound={found}
        onPrimer={() => openPrimer('landing')}
        onSettings={() => openSettings('landing')}
      />
      {notice && <p className={styles.toast} role="status">{notice}</p>}
      </>
    );
  }
  if (screen === 'primer') {
    return <ClubPrimer onDone={finishPrimer} onSkip={finishPrimer} doneLabel={primerNext === 'start' ? undefined : t('Done')} />;
  }
  if (screen === 'settings') {
    return (
      <ClubSettings
        prefs={prefs}
        onChange={updatePrefs}
        onBack={() => show(settingsBack)}
        onPrimer={() => openPrimer('settings')}
        account={sync.account}
        onSignOut={sync.signOut}
        onDeleteAccount={sync.deleteAccount}
      />
    );
  }
  if (screen === 'start' || !state) return <Start onStart={start} onExit={() => show('landing')} exitLabel={t('Back')} scale={size.scale} />;
  if (screen === 'season') {
    // The ground is the first match's map, as it will be on the hub.
    const first = nextMatch(state);
    const map = first ? pickSeriesMaps(seriesSeed(state, first), first.bestOf)[0]?.image : undefined;
    return <SeasonIntro key={state.year} state={state} map={map} reducedMotion={reducedMotion} onDone={() => show('home')} />;
  }
  const match = nextMatch(state);
  if (screen === 'match' && match) {
    const club = clubById(state, match.id);
    const yours = squadCards(state, allCards).slice(0, STARTERS);
    const theirs = clubRoster(state, club, allCards);
    return (
      <BoardSeries
        key={`${state.year}:${state.week}:${match.stage}`}
        squad={yours}
        opponent={theirs}
        intro={{
          you: { club: { name: state.name, mark: { style: state.crest, tone: state.tone } }, cards: yours },
          them: { club: { name: club.name, logo: club.logo }, cards: theirs.slice(0, STARTERS) },
          stage: stageLabel(match),
        }}
        opponentName={club.name}
        bestOf={match.bestOf}
        seed={seriesSeed(state, match)}
        hand={state.hand}
        onDone={finishMatch}
        onLeave={() => show('home')}
        fixed="full"
        three
        settings={<MusicControls />}
      />
    );
  }
  if (screen === 'exhibition' && exhibition) {
    const yours = squadCards(state, allCards).slice(0, STARTERS);
    const theirs = exhibition.cards;
    return (
      <BoardSeries
        key={`exhibition:${exhibition.id}`}
        squad={yours}
        opponent={theirs}
        intro={{
          you: { club: { name: state.name, mark: { style: state.crest, tone: state.tone } }, cards: yours },
          them: { club: { name: exhibition.name, logo: null }, cards: theirs },
          stage: t('Exhibition'),
        }}
        opponentName={exhibition.name}
        bestOf={3}
        seed={(state.seed ^ 9973) >>> 0}
        hand={state.hand}
        onDone={(outcome) => {
          const wonRounds = outcome.results.filter(r => r.winA).length;
          const won = wonRounds > outcome.results.length / 2;
          setExhibitionResult({
            opponent: exhibition,
            won,
            rounds: outcome.results,
          });
          setExhibition(null);
          show('exhibitionResult');
        }}
        onLeave={() => { setExhibition(null); show('league'); }}
        fixed="full"
        three
        settings={<MusicControls />}
      />
    );
  }
  if (screen === 'exhibitionResult' && exhibitionResult) {
    const syntheticClub = {
      id: exhibitionResult.opponent.id,
      name: exhibitionResult.opponent.name,
      logo: null,
      crest: exhibitionResult.opponent.style,
      tone: exhibitionResult.opponent.tone,
    };
    const syntheticState = {
      ...state,
      clubs: [...(state.clubs || []), syntheticClub],
      last: {
        opponent: syntheticClub.id,
        won: exhibitionResult.won,
        rounds: exhibitionResult.rounds,
        stage: t('Exhibition'),
        packs: 0,
        tapes: [],
        growth: [],
        tactic: null,
        evoReward: null,
      },
    };
    return (
      <Result
        state={syntheticState}
        size={size}
        onContinue={() => {
          setExhibitionResult(null);
          show('league');
        }}
      />
    );
  }
  if (screen === 'result') return <Result state={state} size={size} onContinue={() => show(screenFor(state))} />;
  if (screen === 'over' || state.phase === 'over') return <Over state={state} onAgain={fresh} />;

  // ── Club Hub and Management views ──────────────────────────────────────────
  // Ambient muffled VCT broadcast video and audio plays continuously across all
  // hub menus without restarting between tab switches.
  const first = nextMatch(state);
  const activeMap = first ? pickSeriesMaps(seriesSeed(state, first), first.bestOf)[0]?.image : undefined;

  let hubView;
  if (screen === 'settings') {
    hubView = (
      <ClubSettings
        prefs={prefs}
        onChange={updatePrefs}
        onBack={() => show(settingsBack)}
        onPrimer={() => openPrimer('settings')}
        account={sync.account}
        onSignOut={sync.signOut}
        onDeleteAccount={sync.deleteAccount}
      />
    );
  } else if (screen === 'train') {
    hubView = withHint(<Train state={state} go={goTab} size={size} initialFocus={trainingItem?.kind === 'evo' ? 'evo' : trainingItem?.kind === 'tape' ? (trainingItem.key ? `tape:${trainingItem.key}` : 'tape') : null} initialEvoKey={trainingItem?.kind === 'evo' ? trainingItem.key : null} onBack={() => { setTrainingItem(null); show(trainingItem ? 'chips' : 'home'); }} onTape={tapePlayer} onEvo={commitEvoPlayer} />, 'train');
  } else if (screen === 'open' && state.opening) {
    hubView = <OpenPack key={state.opens} state={state} size={size} onChoose={pickFromPack} />;
  } else if (screen === 'vault') {
    hubView = withHint(<Vault state={state} go={goTab} onBack={() => show('home')} onOpenPack={openThePack} onWindow={state.phase === 'review' ? () => show('window') : null} />, 'vault');
  } else if (screen === 'chips') {
    if (!state.chipOffer || chipView === 'inventory') {
      hubView = withHint(<Inventory state={state} go={goTab} onPick={() => setChipView('pick')} size={size} onBack={() => show('home')} onTraining={(item) => { setTrainingItem(item); show('train'); }} onEquip={(uid, equipped) => { playUiSound('chip_lift'); setState(current => setTacticEquipped(current, uid, equipped)); }} />, 'chips');
    } else {
      hubView = withHint(<ChipPick key={state.chipOffer.attempt} state={state} go={goTab} onInventory={() => setChipView('inventory')} squad={squadCards(state, allCards).slice(0, STARTERS)} onBack={() => show('home')} onTake={takeChip} onPass={() => { setState(current => chooseChip(current, null)); setScreen('home'); }} onReroll={() => setState(current => rerollChips(current))} />, 'chips', 'chipPick');
    }
  } else if (screen === 'crest') {
    hubView = (
      <CrestEdit
        state={state}
        onDone={(style, tone) => {
          setState(current => setClubCrest(current, style, tone));
          setScreen('home');
        }}
      />
    );
  } else if (screen === 'rename') {
    hubView = (
      <ClubRename
        state={state}
        onBack={() => show('home')}
        onRename={(name) => {
          setState(current => renameClub(current, name));
          setNotice(t('Renamed to {name}', { name: cleanName(name) }));
          setScreen('home');
        }}
      />
    );
  } else if (screen === 'squad') {
    hubView = withHint(<Squad state={state} go={goTab} size={size} onVault={() => show('vault')} onBack={() => show('home')} onMove={(from, to) => setState(current => moveSquad(current, from, to))} />, 'squad');
  } else if (screen === 'league') {
    hubView = withHint(<League state={state} go={goTab} onBack={() => show('home')} onChallenge={startChallenge} size={size} />, 'league');
  } else if (screen === 'window') {
    hubView = <Window state={state} size={size} onClose={closeTheWindow} />;
  } else if (screen === 'review' || !match) {
    hubView = <Review state={state} size={size} onNext={() => { syncClubScore(state, allCards); show('window'); }} />;
  } else {
    hubView = withHint(
      <>
        <Home
          state={state}
          size={size}
          go={(next) => { setNotice(''); show(next); }}
          onAbandon={fresh}
          onSettings={() => openSettings('home')}
          onPrimer={() => openPrimer('home')}
        />
        {notice && <p className={styles.toast} role="status">{notice}</p>}
        {alerts}
      </>,
      'home',
    );
  }

  return (
    <>
      <AmbientBroadcast active={true} map={activeMap && assetPath(activeMap)} />
      {hubView}
    </>
  );
}
