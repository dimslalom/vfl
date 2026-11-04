import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import allCards from '../../shared/src/data/cards.json';
import { STAT_LABELS } from '../../shared/src/data/statFields';
import PlayerCard from '../../shared/src/components/PlayerCard';
import { playUiSound } from '../../shared/src/lib/gameAudio';
import { assetPath } from '../../shared/src/lib/utils';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import BoardSeries from '../components/BoardSeries';
import PackTear from '../pack3d/Pack3DTear';
import {
  GOLD_PITY, PACK_KEYS, PACK_VALUE, REROLL_PRICE, SESSION_PRICE, TAPE_MAX, TITLES_PER_ICON, TRAIN_SLOTS_MAX, clubFatigueExtra, packValue,
  squadMax, stock,
} from '../engine/club/economy';
import {
  buySession, canBuySession, canReroll, chooseChip, choosePick, goldDue, openBlocker, openPack, rerollChips, useTape as spendTape,
} from '../engine/club/rewards';
import { ROLES, chipInfo } from '../chip3d/chipData';
import { ChipIcon } from '../chip3d/ChipPayout';
import { TACTIC_HAND_MAX } from '../engine/endless/seriesCards';
import { fatiguePenalty } from '../../shared/src/engine/endless/career';
import { BOARD_SKILLS } from '../engine/board/board';
import {
  CONTRACT_MAX, DRAFT_PACKS, SKILL_SESSIONS, STARTERS, STAT_CAP, STAT_STEP, WEEKS, XP_PER_POINT, clubById, clubCard, clubRoster,
  clubScore, closeWindow, draftPack, finishSeries, isValidClub, moveSquad, newClub, nextMatch, squadCards, standings,
  train, trainingOffer, windowOffers, windowTotals,
} from '../engine/club/season';
import { TIER_META } from '../engine/endless/ladder';
import { pickSeriesMaps } from '../prototype/boardSetup';
import ClubLogo from '../components/ClubLogo';
import { LOGO_STYLES, defaultLogoStyle, logoSvg } from '../engine/club/logo';
import { CLUB_SAVE_KEY, clearClub, loadClub, saveClub } from '../lib/clubSave';
import styles from './Club.module.css';

const cardById = new Map(allCards.map(card => [card.id, card]));
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;
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
    if (typeof window === 'undefined') return { scale: 0.4, slot: 0.27, squadSlot: 0.27, phone: false };
    const { innerWidth: w, innerHeight: h } = window;
    const phone = w < 760;
    const scale = phone ? Math.min(0.22, (h - 240) / 2200) : h < 560 ? 0.24 : h < 760 ? 0.32 : 0.4;
    // The squad is the hero, sized to the width it has.
    // Desktop: five starters and two bench cards at 0.6 share the width, nothing beside them.
    const room = phone ? w - 24 - 4 * 4 : Math.min(w, 1600) - 80 - 48 - 6 * 14 - 64;
    const slotWidth = Math.min(200, room / (phone ? 5 : 6.2)) - (phone ? 2 : 4);
    const maxSlotH = phone ? (h - 330) / 960 : (h - 280) / 1100;
    const slot = Math.max(0.12, Math.min(0.5, slotWidth / 400, maxSlotH));
    // On the Squad screen on phones, starters wrap 3 on top + 2 below so each card is ~30% larger.
    // Subtract stage padding (24), ground padding (16), and 2 column gaps (16) = 56px.
    const squadWidth = phone ? (w - 56) / 3 : slotWidth;
    const maxSquadH = phone ? (h - 340) / 1500 : maxSlotH;
    const squadSlot = phone ? Math.max(0.14, Math.min(0.3, squadWidth / 400, maxSquadH)) : slot;
    return { scale: Math.max(0.14, scale), slot, squadSlot, phone };
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
  return <ClubLogo name={state.name} style={state.crest} size={size} />;
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
function Ground({ map, className = '', children }) {
  return (
    <main className={`${styles.ground} ${className}`} style={map ? { '--map': `url(${map})` } : undefined}>
      {children}
    </main>
  );
}

// A card in its place, with nothing behind it to compete: the role (or IGL) as a
// label above, and the contract's years left as bars below.
function Slot({ card, scale, tab, lit, years, note, noteLit, held, onClick, label, vt }) {
  return (
    <div className={styles.slot} data-held={held || undefined}>
      <span className={styles.slotTop}>
        {tab && <b data-lit={lit || undefined}>{tab}</b>}
        {note && <em data-lit={noteLit || undefined}>{note}</em>}
      </span>
      <div className={styles.slotCard} style={vt ? { viewTransitionName: vt } : undefined}>
        <PlayerCard card={card} displayScale={scale} tilt={false} canDrag={false} onClick={onClick} pressScale={onClick ? 0.97 : 1} />
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

function CrestPicker({ name, value, onPick, onClose }) {
  return (
    <div className={styles.crestSheet} role="dialog" aria-modal="true" aria-label="Choose club crest" onClick={onClose}>
      <div className={styles.crestGrid} onClick={event => event.stopPropagation()}>
        <h2>Pick a crest</h2>
        {LOGO_STYLES.map(option => (
          <button key={option.id} type="button" className={styles.crestOption} aria-pressed={option.id === value} onClick={() => onPick(option.id)} autoFocus={option.id === value}>
            <span dangerouslySetInnerHTML={{ __html: logoSvg(name, option.id) }} />
            <b>{option.label}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function Start({ onStart, onExit, scale }) {
  const [seed] = useState(() => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  const [name, setName] = useState('');
  const [picks, setPicks] = useState([]);
  const [crest, setCrest] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const shownName = name.trim() || 'Your club';
  const style = crest ?? defaultLogoStyle(shownName);
  useEscape(() => setChoosing(false));
  // Each draft pack is torn open before its cards can be picked.
  const [torn, setTorn] = useState(false);
  const done = picks.length >= DRAFT_PACKS;
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
          <button type="button" className={styles.crestButton} aria-label="Choose club crest" aria-haspopup="dialog" onClick={() => setChoosing(true)}>
            <ClubLogo name={shownName} style={style} size={44} />
          </button>
          <label className={styles.nameField}>
            <span>Club name</span>
            <input value={name} maxLength={18} placeholder="Your club" onChange={event => setName(event.target.value)} />
          </label>
        </div>
        <div className={styles.chips}>
          <BackButton onClick={onExit} label="Other modes" />
          <div className={styles.chip}><b>{Math.min(picks.length + 1, DRAFT_PACKS)} / {DRAFT_PACKS}</b><span>Pack</span></div>
        </div>
      </header>
      <main className={`${styles.play} ${styles.centered}`}>
        {done && <div className={styles.moment}>Squad ready</div>}
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
        <button type="button" className={styles.primary} disabled={!done} onClick={() => { playUiSound('lock_in'); onStart(seed, shownName, picks.map(card => card.id), style); }}>Enter league</button>
      </footer>
      {choosing && <CrestPicker name={shownName} value={style} onPick={id => { setCrest(id); setChoosing(false); }} onClose={() => setChoosing(false)} />}
    </div>
  );
}

// ── hub ─────────────────────────────────────────────────────────────────────

function ClubMenu({ onExit, onAbandon }) {
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
          <button type="button" onClick={onExit}>Other modes</button>
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
function PackCounter({ state, onOpen, bump, flyTarget }) {
  const value = packValue(state);
  const tapes = state.tapes ?? 0;
  const label = `${value} pack value, ${tapes} skill ${tapes === 1 ? 'tape' : 'tapes'}`;
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

// A skill tape: a still of the 3D cassette (tools/tape3d), stood upright at card
// proportions so it sits beside packs and players as one more thing the club owns.
function TapeCard({ scale = 0.3 }) {
  return (
    <img className={styles.tapeCard} src={assetPath('/assets/tape3d/tape-icon.webp')} alt="" aria-hidden="true" draggable={false} style={{ width: 400 * scale, height: 580 * scale }} />
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

function Home({ state, go, onExit, onAbandon, size }) {
  const squad = squadCards(state, allCards);
  const match = nextMatch(state);
  const opponent = clubById(state, match.id);
  const firstMap = pickSeriesMaps(seriesSeed(state, match), match.bestOf)[0];
  const pos = standings(state, allCards).find(row => row.you).pos;
  const started = state.results.length > 0;
  const max = squadMax(state);
  const hand = state.hand ?? [];
  return (
    <div className={styles.stage}>
      <Hud title={state.name} tags={[[tierName(state.tier), true], [`Year ${state.year}`], ...(started ? [[`${ordinal(pos)} in table`]] : [])]} mark={<OwnMark state={state} size={50} />}>
        <PackCounter state={state} onOpen={() => go('vault')} />
        <ClubMenu onExit={onExit} onAbandon={onAbandon} />
      </Hud>
      <Ground map={firstMap?.image && assetPath(firstMap.image)} className={styles.home}>
        <Road state={state} />
        <section className={styles.homeSquad} aria-label="Your squad">
          <div className={styles.homeGroup}>
            <span className={styles.groupLabel}>Starting five</span>
            <div className={styles.homeRow}>
              {squad.slice(0, STARTERS).map((card, index) => (
                <Slot key={card.id} vt={`card-${card.id}`} card={card} scale={size.slot} tab={index === 0 ? 'IGL' : card.role?.slice(0, 3).toUpperCase()} lit={index === 0} years={state.contracts[card.id]} note={state.contracts[card.id] === 1 ? 'Last year' : ''} noteLit onClick={() => go('squad')} />
              ))}
            </div>
          </div>
          <div className={styles.homeGroup}>
            <span className={styles.groupLabel}>Bench {Math.max(0, squad.length - STARTERS)} / {max - STARTERS}</span>
            <div className={styles.homeRow}>
              {squad.slice(STARTERS).map(card => (
                <Slot key={card.id} vt={`card-${card.id}`} card={card} scale={size.slot * 0.6} tab="" years={state.contracts[card.id]} onClick={() => go('squad')} />
              ))}
              {Array.from({ length: Math.max(0, max - squad.length) }, (_, index) => <BenchOpen key={index} scale={size.slot * 0.6} onClick={() => go('vault')} />)}
            </div>
          </div>
        </section>
        <div className={styles.homeFoot}>
          {/* The week's business, as tiles: each shows the number that matters. */}
          <div className={styles.tileRow}>
            <button type="button" className={styles.tile} style={{ viewTransitionName: 'train-panel' }} onClick={() => go('train')}>
              <span className={styles.tileLabel}>Train</span>
              <span className={styles.sessions} role="img" aria-label={`${state.trainSlot} of ${TRAIN_SLOTS_MAX} sessions`}>
                {Array.from({ length: TRAIN_SLOTS_MAX }, (_, index) => <i key={index} data-on={index < state.trainSlot || undefined} />)}
              </span>
            </button>
            <button type="button" className={styles.tile} style={{ viewTransitionName: 'vault-panel' }} onClick={() => go('vault')}>
              <span className={styles.tileLabel}>Vault</span>
              <span className={styles.tileValue}><PackArt kind="silver" size="s" /><b>{packValue(state)}</b></span>
            </button>
            <button type="button" className={styles.tile} style={{ viewTransitionName: 'chips-panel' }} onClick={() => go('chips')}>
              <span className={styles.tileLabel}>Chips</span>
              <span className={styles.tileValue}><b>{hand.length}</b><small>/ {TACTIC_HAND_MAX}</small>{state.chipOffer && <em className={styles.newBadge}>Pick 1</em>}</span>
            </button>
            <button type="button" className={styles.tile} style={{ viewTransitionName: 'squad-panel' }} onClick={() => go('squad')}>
              <span className={styles.tileLabel}>Squad</span>
              <span className={styles.tileValue}><b>{squad.length}</b><small>/ {max}</small></span>
            </button>
            <button type="button" className={styles.tile} style={{ viewTransitionName: 'league-panel' }} onClick={() => go('league')}>
              <span className={styles.tileLabel}>League</span>
              <span className={styles.tileValue}><b>{started ? ordinal(pos) : '6'}</b><small>{started ? 'of 6' : 'clubs'}</small></span>
            </button>
          </div>
          <div className={styles.homePlay}>
            <div className={styles.homeRival}>
              <span className={styles.homeRivalText}>
                <span className={styles.meta}><span>{match.stage}</span><span>Best of {match.bestOf}</span></span>
                <b>{opponent.name}</b>
              </span>
              <span className={styles.homeCrest} style={{ viewTransitionName: 'rival-crest' }}>
                {opponent.logo ? <img src={assetPath(opponent.logo)} alt="" /> : initials(opponent.name)}
              </span>
            </div>
            <button type="button" className={`${styles.primary} ${styles.playBig}`} style={{ viewTransitionName: 'primary-action' }} autoFocus onClick={() => go('match')} aria-label={`Play ${opponent.name}, best of ${match.bestOf}`}>Play</button>
          </div>
        </div>
      </Ground>
    </div>
  );
}

// ── squad ───────────────────────────────────────────────────────────────────

// Who starts is decided here, before kickoff: tap two to swap. Fatigue costs a
// starter rating; the bench learns at a share of the rate. Roles matter to chips.
function Squad({ state, onMove, onBack, size }) {
  const [held, setHeld] = useState(null);
  useEscape(() => (held === null ? onBack() : setHeld(null)));
  const squad = squadCards(state, allCards);
  const max = squadMax(state);
  const tap = (index) => {
    if (held === null) { playUiSound('lift'); setHeld(index); return; }
    if (held !== index) {
      playUiSound(index === 0 || held === 0 ? 'igl' : 'drop');
      onMove(held, index);
    } else {
      playUiSound('drop');
    }
    setHeld(null);
  };
  const roles = new Set(squad.slice(0, STARTERS).map(card => card.role));
  const fatigueOf = id => state.dev?.[id]?.f ?? 0;
  const costOf = id => fatiguePenalty(state.dev?.[id]) + clubFatigueExtra(state.dev?.[id]);
  const s = size.squadSlot ?? size.slot;
  const slot = (card, index) => {
    const bench = index >= STARTERS;
    const years = state.contracts[card.id];
    const fatigue = fatigueOf(card.id);
    const cost = costOf(card.id);
    const xp = state.xp?.[card.id] ?? 0;
    return (
      <div key={card.id} className={styles.squadSlot}>
        <Slot vt={`card-${card.id}`} card={card} scale={bench ? s * 0.8 : s} tab={index === 0 ? 'IGL' : bench ? '' : card.role?.slice(0, 3).toUpperCase()} lit={index === 0} years={years} note={years === 1 ? 'Last year' : ''} noteLit held={held === index} onClick={() => tap(index)} />
        {bench ? (
          <span className={styles.meterRow} aria-label={`Growth ${Math.round((xp / XP_PER_POINT) * 100)} percent`}>
            <span className={styles.meterLabel}>XP</span>
            <span className={styles.meter}><i style={{ width: `${(xp / XP_PER_POINT) * 100}%` }} /></span>
            <b>{Math.round((xp / XP_PER_POINT) * 100)}%</b>
          </span>
        ) : (
          <span className={styles.meterRow} aria-label={`Fatigue ${fatigue}, costs ${cost.toFixed(1)} rating`}>
            <span className={styles.meterLabel}>Fatigue</span>
            <span className={styles.meter} data-bad={cost > 0 || undefined}><i style={{ width: `${Math.min(100, fatigue)}%` }} /></span>
            <b data-bad={cost > 0 || undefined}>{cost > 0 ? `−${cost.toFixed(1)}` : '0'}</b>
          </span>
        )}
      </div>
    );
  };
  return (
    <div className={styles.stage}>
      <Hud title="Squad" back={<BackButton onClick={onBack} />} tags={[[`${squad.length} / ${max}`]]}>
        <span className={styles.roleBar} role="img" aria-label={`Roles on the board: ${[...roles].join(', ')}`}>
          {ROLES.map(role => <i key={role} data-on={roles.has(role) || undefined}>{role[0]}</i>)}
        </span>
      </Hud>
      <Ground className={styles.squadGround}>
        <div className={styles.squadPanel} style={{ viewTransitionName: 'squad-panel' }}>
          <div className={styles.homeGroup}>
            <span className={styles.groupLabel}>Starting five</span>
            <div className={styles.homeRow}>{squad.slice(0, STARTERS).map(slot)}</div>
          </div>
          <div className={styles.homeGroup}>
            <span className={styles.groupLabel}>Bench {Math.max(0, squad.length - STARTERS)} / {max - STARTERS}</span>
            <div className={styles.homeRow}>
              {squad.slice(STARTERS).map((card, index) => slot(card, STARTERS + index))}
              {Array.from({ length: Math.max(0, max - squad.length) }, (_, index) => <BenchOpen key={index} scale={s * 0.8} />)}
            </div>
          </div>
        </div>
        <p className={styles.swapHint} role="status">{held === null ? 'Tap two players to swap them. The lineup locks at kickoff.' : `Now tap who swaps with ${squad[held].player}`}</p>
      </Ground>
    </div>
  );
}

// ── vault ───────────────────────────────────────────────────────────────────

function Vault({ state, onOpenPack, onBack, onWindow }) {
  useEscape(onBack);
  const dry = state.pity?.gold ?? 0;
  const titles = state.titles ?? 0;
  const toIcon = TITLES_PER_ICON - (titles % TITLES_PER_ICON);
  const blockLabel = { empty: 'None left', full: 'Squad full', open: 'Pack open', over: 'Closed' };
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
          {kind === 'gold' && <small>Gold players only</small>}
          {kind === 'icons' && (
            <>
              <span className={styles.sessions} role="img" aria-label={`${titles % TITLES_PER_ICON} of ${TITLES_PER_ICON} titles towards an icon pack`}>
                {Array.from({ length: TITLES_PER_ICON }, (_, index) => <i key={index} data-on={index < titles % TITLES_PER_ICON || undefined} />)}
              </span>
              <small>Next in {toIcon} {toIcon === 1 ? 'title' : 'titles'}</small>
            </>
          )}
        </div>
        <button type="button" className={styles.ghost} disabled={Boolean(blocker)} onClick={() => onOpenPack(kind)}>{blocker ? blockLabel[blocker] : 'Open'}</button>
      </section>
    );
  };
  return (
    <div className={styles.stage}>
      <Hud title="Vault" back={<BackButton onClick={onBack} />}>
        <PackCounter state={state} />
      </Hud>
      <Ground className={styles.vaultGround}>
        <div className={styles.vaultRow} style={{ viewTransitionName: 'vault-panel' }}>
          {PACK_KEYS.map(column)}
          {/* Tapes sit with the packs: card-sized, used from Training. */}
          <section className={styles.vaultKind} data-empty={!(state.tapes > 0) || undefined}>
            <div className={styles.vaultStack}><TapeCard scale={0.29} /></div>
            <div className={styles.vaultCount}><b>{state.tapes ?? 0}</b><span><strong>Skill tapes</strong><small>Max {TAPE_MAX}</small></span></div>
            <div className={styles.vaultNote}><small>Pass on a pack to earn one</small></div>
            <span className={styles.vaultUse}>Use in Training</span>
          </section>
        </div>
      </Ground>
      <footer className={styles.act}>
        <span className={styles.plain}>Open a pack to pick 1 of 3, or spend its value at the transfer window.</span>
        {onWindow && <button type="button" className={styles.ghost} onClick={onWindow}>Transfer window</button>}
      </footer>
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
  useEffect(() => {
    if (!torn) return undefined;
    if (cards.some(card => card.rating > 80 || card.league === 'icon')) playUiSound('jackpot');
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
                <span className={styles.guarantee}>{opening.guaranteed && card.rating > 80 ? 'Guaranteed gold' : ''}</span>
                <div className={styles.slotCard}>
                  <PlayerCard card={card} displayScale={size.scale * 1.15} tilt={false} canDrag={false} onClick={() => !passing && setPicked(card.id)} />
                  {picked === card.id && <span className={styles.brackets} aria-hidden="true"><i /><i /><i /><i /></span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Ground>
      {torn && (
        <footer className={styles.act}>
          <span className={styles.passFor}>
            {passing ? (
              <FlyHome delay={0} onLand={() => { playUiSound('vault_bump'); setTapeLanded(true); setTimeout(() => onChoose(null), 220); }}>
                <TapeCard scale={0.09} />
              </FlyHome>
            ) : (
              <TapeCard scale={0.09} />
            )}
            <span className={styles.plain}>{full ? 'Squad full: pass for a skill tape' : 'Pass on all three for a skill tape'}</span>
          </span>
          <div className={styles.actPair}>
            <button type="button" className={`${styles.ghost} ${styles.even}`} disabled={passing} onClick={passPack}>Pass</button>
            <button type="button" className={`${styles.primary} ${styles.even}`} disabled={!picked || full || passing} onClick={() => { playUiSound('sign'); onChoose(picked); }}>Sign</button>
          </div>
        </footer>
      )}
    </div>
  );
}

// ── chip pick ───────────────────────────────────────────────────────────────

function ChipDisc({ chipKey, size = 'm' }) {
  const info = chipInfo(chipKey);
  return (
    <span className={styles.chipDisc} data-size={size} data-tier={info.tier} aria-hidden="true">
      {info.icons.slice(0, size === 's' ? 2 : 4).map((name, index) => <ChipIcon key={name + index} name={name} size={size === 's' ? 14 : 20} />)}
    </span>
  );
}

function ChipPick({ state, onTake, onPass, onReroll, onBack }) {
  useEscape(onBack);
  const offer = state.chipOffer;
  const hand = state.hand ?? [];
  const [picked, setPicked] = useState(null);
  const [drop, setDrop] = useState(null);
  const full = hand.length >= TACTIC_HAND_MAX;
  const ready = picked && (!full || drop);
  return (
    <div className={styles.stage}>
      <Hud title={offer ? 'Pick a chip' : 'Chips'} back={<BackButton onClick={onBack} />} tags={offer ? [[offer.stage]] : []}>
        <PackCounter state={state} />
      </Hud>
      <Ground className={styles.chipGround}>
        {offer ? (
          <div className={styles.chipOffer} style={{ viewTransitionName: 'chips-panel' }}>
            {offer.options.map((option, index) => {
              const info = chipInfo(option.key);
              return (
                <button key={option.uid} type="button" className={styles.chipOption} style={{ '--deal': index }} data-on={picked === option.uid || undefined} aria-pressed={picked === option.uid} onClick={() => { playUiSound('chip_lift'); setPicked(option.uid); }}>
                  <ChipDisc chipKey={option.key} size="l" />
                  <span className={styles.chipTier}>{info.tier}</span>
                  <b>{info.name}</b>
                  <span className={styles.ladder}>{info.ladder.map((step, stepIndex) => <span key={stepIndex}>×{step.mult}</span>)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className={styles.plain}>Win a series to pick a new chip.</p>
        )}
        <section className={styles.chipHand} aria-label={`Hand, ${hand.length} of ${TACTIC_HAND_MAX}`}>
          <span className={styles.groupLabel}>Hand {hand.length} / {TACTIC_HAND_MAX}{offer && full ? ': tap one to drop' : ''}</span>
          <div className={styles.handSlots}>
            {Array.from({ length: TACTIC_HAND_MAX }, (_, index) => {
              const chip = hand[index];
              if (!chip) return <span key={index} className={styles.handSlot} />;
              const droppable = offer && full;
              return (
                <button key={chip.uid} type="button" className={styles.handSlot} data-drop={drop === chip.uid || undefined} disabled={!droppable} aria-label={`${chipInfo(chip.key).name}${droppable ? ', drop' : ''}`} onClick={() => { playUiSound('chip_lift'); setDrop(drop === chip.uid ? null : chip.uid); }}>
                  <ChipDisc chipKey={chip.key} size="s" />
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
            <button type="button" className={`${styles.primary} ${styles.even}`} disabled={!ready} onClick={() => { playUiSound('chip_drop'); onTake(picked, drop); }}>Take</button>
          </div>
        </footer>
      )}
    </div>
  );
}

// ── train ───────────────────────────────────────────────────────────────────

const Tick = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" aria-hidden="true"><path d="M5 12.5l5 5L19 7" /></svg>;

// What a player can still take this week, so the strip and the chips can show it as
// form: finished choices stay on the table, ticked, instead of vanishing.
function trainStatus(state, card) {
  const offer = trainingOffer(state, card);
  const entry = state.training[card.id] ?? {};
  return {
    offer,
    entry,
    statDone: offer.statCapped,
    skillDone: !offer.skill,
    restDone: offer.fatigue <= 0,
    done: offer.statCapped && !offer.skill && offer.fatigue <= 0,
  };
}

function Train({ state, onTrain, onTape, onBuy, canBuy, onBack, size }) {
  const { scale } = size;
  const squad = squadCards(state, allCards);
  const [who, setWho] = useState(0);
  const [picked, setPicked] = useState('stat');
  // Pressing Train plays the session out on the cards before the club moves on.
  const [drilling, setDrilling] = useState(false);
  const drillTimer = useRef(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => () => clearTimeout(drillTimer.current), []);
  useEscape(() => { if (!drilling) onBack(); });
  const card = squad[who];
  const { offer, entry, statDone, skillDone, restDone } = trainStatus(state, card);
  const skill = offer.skill && BOARD_SKILLS[offer.skill];
  const learned = entry.skills?.[0] && BOARD_SKILLS[entry.skills[0]];
  const statSteps = STAT_CAP / STAT_STEP;
  const skillMeter = { on: skillDone ? SKILL_SESSIONS : offer.sessions, of: SKILL_SESSIONS };
  // Every choice stays on the table. A finished one is ticked and dim, so the reason it
  // can't be taken is its own shape: a full meter, a tick, nothing left.
  const focuses = [
    { id: 'stat', title: STAT_LABELS[offer.stat], done: statDone, mark: `+${STAT_STEP}`, meter: { on: Math.round((entry.stats?.[offer.stat] ?? 0) / STAT_STEP), of: statSteps } },
    { id: 'skill', title: skill?.label ?? learned?.label ?? 'Skill', done: skillDone, mark: `${offer.sessions + 1}/${SKILL_SESSIONS}`, meter: skillMeter },
    { id: 'rest', title: 'Rest', done: restDone, mark: offer.fatigue, meter: { on: Math.ceil(offer.fatigue / 25), of: 4 } },
    // A skill tape moves the skill on without spending the week's session.
    state.tapes > 0 && { id: 'tape', title: 'Tape', done: skillDone, mark: `×${state.tapes}`, meter: skillMeter },
  ].filter(Boolean);
  const open = focuses.filter(item => !item.done);
  const chosen = open.find(item => item.id === picked) ?? open[0];
  const focus = chosen?.id;
  const after = chosen ? clubCard(train(state, card, focus === 'tape' ? 'skill' : focus), cardById.get(card.id)) : card;
  const usesSession = focus !== 'tape';
  const before = card.stats?.[offer.stat] ?? card[offer.stat];
  const afterValue = after.stats?.[offer.stat] ?? after[offer.stat];
  const arrow = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
  const finish = () => {
    const unlocksSkill = (focus === 'skill' || focus === 'tape') && offer.skill && offer.sessions + 1 >= SKILL_SESSIONS;
    if (unlocksSkill) playUiSound(`skill_${offer.skill}`);
    else playUiSound('train_done');
    return focus === 'tape' ? onTape(card) : onTrain(card, focus);
  };
  const trainNow = () => {
    if (reducedMotion) { finish(); return; }
    playUiSound(focus === 'tape' ? 'tape' : 'train_start');
    setDrilling(true);
    drillTimer.current = setTimeout(finish, 1150);
  };
  return (
    <div className={styles.stage}>
      <Hud title="Training" back={<BackButton onClick={onBack} />} tags={[[`Week ${Math.min(state.week + 1, WEEKS)}`]]}>
        <span className={styles.sessions} data-empty={state.trainSlot === 0 || undefined} role="img" aria-label={`${state.trainSlot} of ${TRAIN_SLOTS_MAX} sessions`}>
          {Array.from({ length: TRAIN_SLOTS_MAX }, (_, index) => <i key={index} data-on={index < state.trainSlot || undefined} />)}
        </span>
        {canBuy && (
          <button type="button" className={styles.ghost} data-need={state.trainSlot === 0 || undefined} onClick={() => { playUiSound('sign'); onBuy(); }} disabled={drilling}>
            +1 session<span className={styles.cost}><PackArt kind="silver" size="s" />{SESSION_PRICE}</span>
          </button>
        )}
      </Hud>
      <Ground className={styles.trainGround}>
        <section className={styles.pedestal}>
          <div className={styles.trainStage} data-drill={drilling || undefined}>
            <div className={styles.beforeCard}><Card card={card} scale={scale * 1.2} dim highlight={focus === 'stat' ? offer.stat : null} /></div>
            <svg className={styles.arrow} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
            <div className={styles.raised}><Card card={after} scale={scale * 1.2} highlight={focus === 'stat' ? offer.stat : null} /></div>
          </div>
          {/* One readout, the same shape for every focus: what changes, then from and to. */}
          {chosen && (
            <div className={styles.gain} data-drill={drilling || undefined}>
              <span className={styles.gainLabel}>{chosen.id === 'stat' ? STAT_LABELS[offer.stat] : chosen.id === 'rest' ? 'Fatigue' : chosen.id === 'tape' ? 'Skill tape' : 'Skill'}</span>
              {chosen.id === 'stat' && (
                <span className={styles.gainRow}><span className={styles.was}>{before}</span>{arrow}<b className={styles.now}>{afterValue}</b><em className={styles.plus}>+{STAT_STEP}</em></span>
              )}
              {(chosen.id === 'skill' || chosen.id === 'tape') && (
                <span className={styles.gainRow}>
                  <b className={styles.now}>{skill.label}</b>
                  <span className={styles.sessions} role="img" aria-label={`Session ${offer.sessions + 1} of ${SKILL_SESSIONS}`}>
                    {Array.from({ length: SKILL_SESSIONS }, (_, index) => <i key={index} data-on={index < offer.sessions || undefined} data-next={index === offer.sessions || undefined} />)}
                  </span>
                </span>
              )}
              {chosen.id === 'rest' && (
                <span className={styles.gainRow}><span className={styles.was}>{offer.fatigue}</span>{arrow}<b className={styles.now}>0</b></span>
              )}
              <span className={styles.gainNote}>{chosen.id === 'skill' || chosen.id === 'tape' ? skill.text : ''}</span>
            </div>
          )}
          {!chosen && <span className={styles.allDone} role="img" aria-label="Nothing left to train"><Tick /></span>}
        </section>
        <div className={styles.chipRow} role="group" aria-label="Focus">
          {focuses.map(item => (
            <button key={item.id} type="button" className={styles.clay} data-on={focus === item.id || undefined} data-done={item.done || undefined} aria-pressed={focus === item.id} disabled={drilling || item.done} onClick={() => { playUiSound('select'); setPicked(item.id); }}>
              <span aria-hidden="true">
                {item.done ? <Tick /> : <strong className={styles.clayMark}>{item.mark}</strong>}
                {item.meter && (
                  <span className={styles.clayMeter}>
                    {Array.from({ length: item.meter.of }, (_, index) => <i key={index} data-on={index < item.meter.on || undefined} data-next={(!item.done && index === item.meter.on && item.id !== 'stat') || undefined} />)}
                  </span>
                )}
              </span>
              {item.title}
            </button>
          ))}
        </div>
      </Ground>
      <div className={styles.hand}>
        {squad.map((item, index) => {
          const status = trainStatus(state, item);
          const learning = status.entry.learning?.sessions ?? 0;
          return (
            <div key={item.id} className={styles.handCard} data-on={who === index || undefined} data-done={status.done || undefined} style={{ viewTransitionName: `card-${item.id}` }}>
              <PlayerCard card={item} displayScale={scale * 0.55} tilt={false} canDrag={false} selected={who === index} onClick={drilling ? undefined : () => setWho(index)} pressScale={0.97} />
              {/* Done reads like the role labels above cards: a bare green tick over the dimmed card. */}
              {status.done && <span className={styles.tick} role="img" aria-label="Nothing left to train"><Tick /></span>}
              {learning > 0 && !status.skillDone && (
                <span className={styles.sessions} role="img" aria-label={`Skill session ${learning} of ${SKILL_SESSIONS}`}>
                  {Array.from({ length: SKILL_SESSIONS }, (_, pip) => <i key={pip} data-on={pip < learning || undefined} />)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <footer className={`${styles.act} ${styles.actEnd}`}>
        <button type="button" className={styles.primary} disabled={!chosen || (usesSession && !state.trainSlot) || drilling} onClick={trainNow}>
          {/* The cost, as a pip: solid while a session is open, hollow when there is none. A tape costs nothing, so it shows none. */}
          {usesSession && chosen && !drilling && <i className={styles.sessionCost} data-on={state.trainSlot > 0 || undefined} aria-hidden="true" />}
          {drilling ? 'Training' : `Train ${card.player}`}
        </button>
      </footer>
    </div>
  );
}

// ── series result ───────────────────────────────────────────────────────────

function Result({ state, onContinue, size }) {
  const { scale } = size;
  const { last } = state;
  const opponent = clubById(state, last.opponent);
  const squad = squadCards(state, allCards).slice(0, STARTERS);
  const pos = standings(state, allCards).find(row => row.you).pos;
  const growth = new Map(last.growth.map(row => [row.id, row]));
  const won = last.rounds.filter(round => round.winA).length;
  const reducedMotion = useReducedMotion();
  const [landed, setLanded] = useState(false);
  const [grown, setGrown] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) return undefined;
    const timer = setTimeout(() => {
      setGrown(true);
      const anyLeveled = last.growth.some(row => (row?.gain ?? 0) > (row?.pct ?? 0));
      playUiSound(anyLeveled ? 'train_done' : 'score', 2);
    }, 280);
    return () => clearTimeout(timer);
  }, [reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const sweep = last.won && last.rounds.length >= 2 && last.rounds.every(round => round.winA);
  return (
    <div className={styles.stage}>
      <Hud title={opponent.name} logo={opponent.logo ?? null} tags={[[last.stage], ...(last.rounds.length > 3 ? [['Bo5', true]] : [['Bo3', true]])]}>
        <PackCounter state={state} bump={landed} flyTarget />
      </Hud>
      <Ground className={styles.resultGround}>
        <div className={styles.verdict}>
          <div className={styles.moment} data-won={last.won}>{last.won ? 'Series won' : 'Series lost'}</div>
          <span className={styles.verdictRow}>
            <b className={styles.score}>{won}–{last.rounds.length - won}</b>
            {last.packs > 0 && (
              <FlyHome onLand={() => { playUiSound('vault_bump'); setLanded(true); }}>
                <span className={styles.gain1}><PackArt kind="silver" size="s" /><b>+{last.packs}</b></span>
              </FlyHome>
            )}
            {sweep && <span className={styles.gain1}><span className={styles.sessions}><i data-on /><i data-on /></span><b>2 sessions next week</b></span>}
            <span className={styles.plain}>{`${ordinal(pos)} in table`}</span>
          </span>
        </div>
        {/* Each map as a quiet row: where, the lanes score, and the verdict in colour. */}
        <ol className={styles.mapRows}>
          {last.rounds.map((round, index) => (
            <li key={index} data-won={round.winA} style={{ '--deal': index }}>
              <img src={mapArt(round.map)} alt="" />
              <b>{round.map}</b>
              <span className={styles.mapScore}>{round.a}–{round.b}</span>
              <em>{round.winA ? 'Won' : 'Lost'}</em>
            </li>
          ))}
        </ol>
      </Ground>
      <div className={styles.hand}>
        {squad.map((card, index) => {
          const row = growth.get(card.id);
          const pct = row?.pct ?? 0;
          const gain = row?.gain ?? 0;
          const leveled = gain > pct;
          const fromPct = leveled ? 0 : Math.max(0, pct - gain);
          return (
            <div key={card.id} className={styles.handCard} data-on={row?.mvp || undefined} data-leveled={leveled || undefined} style={{ '--deal': index, viewTransitionName: `card-${card.id}` }}>
              {row?.mvp && <em className={styles.mvp}>MVP</em>}
              {leveled && <em className={styles.levelUp}>+1 OVR</em>}
              <PlayerCard card={card} displayScale={row?.mvp ? scale * 0.86 : scale * 0.72} tilt={false} canDrag={false} />
              <span className={styles.bar} role="img" aria-label={`Growth: ${pct} percent to the next rating point`}><i style={{ width: `${grown ? pct : fromPct}%` }} /></span>
              <b className={styles.pct}>{pct}%</b>
            </div>
          );
        })}
      </div>
      <footer className={styles.act}>
        <span className={styles.label}>Growth to the next rating point</span>
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
    <li data-you={id === 'you' || undefined} data-out={winner && winner !== id ? true : undefined} data-won={winner === id || undefined}>
      <span className={styles.seed}>{seed}</span>
      {id === 'you' ? <OwnMark state={state} size={24} /> : <Crest club={clubById(state, id)} size={24} />}
      <b>{id === 'you' ? state.name : clubById(state, id).name}</b>
    </li>
  );
  const semi = (index, a, b) => {
    const match = playoffs?.semis[index];
    return (
      <div className={styles.match}>
        <span className={styles.matchHead}>Semifinal {index + 1}<small>Bo3</small></span>
        <ol>{team(match?.ids[0] ?? seeds[a], a + 1, match?.winner)}{team(match?.ids[1] ?? seeds[b], b + 1, match?.winner)}</ol>
      </div>
    );
  };
  const final = playoffs?.final;
  return (
    <section className={styles.bracket} aria-label="Playoffs">
      <div className={styles.bracketHead}>
        <h2 className={styles.sectionHead}>Playoffs</h2>
        <span className={styles.plain}>{playoffs ? 'Top four' : `Top four after week ${WEEKS}. If it ended today:`}</span>
      </div>
      <div className={styles.bracketGrid} data-projected={!playoffs || undefined}>
        <div className={styles.semis}>{semi(0, 0, 3)}{semi(1, 1, 2)}</div>
        <span className={styles.joiner} aria-hidden="true" />
        <div className={styles.match} data-final="true">
          <span className={styles.matchHead}>Final<small>Bo5</small></span>
          {final ? <ol>{team(final.ids[0], null, final.winner)}{team(final.ids[1], null, final.winner)}</ol> : <p className={styles.plain}>Semifinal winners</p>}
        </div>
      </div>
    </section>
  );
}

function League({ state, onBack }) {
  useEscape(onBack);
  const table = standings(state, allCards);
  return (
    <div className={styles.stage}>
      <Hud title={tierName(state.tier)} back={<BackButton onClick={onBack} />}>
        <span className={styles.tierBars} role="img" aria-label={`Tier ${state.tier + 1} of 3`}>
          {[0, 1, 2].map(index => <i key={index} data-on={index === state.tier || undefined} />)}
        </span>
        <Tag>{`Week ${Math.min(state.week + 1, WEEKS)} / ${WEEKS}`}</Tag>
      </Hud>
      <Ground className={styles.leagueGround}>
        <Road state={state} />
        <ol className={styles.table}>
          {table.map(row => (
            <li key={row.id} data-you={row.you || undefined} data-cut={row.pos === 4 ? 'Playoff line' : row.pos === 5 ? 'Drop zone' : undefined}>
              <b className={styles.pos}>{row.pos}</b>
              {row.you ? <OwnMark state={state} size={32} /> : <Crest club={clubById(state, row.id)} />}
              <b className={styles.clubName}>{row.name}</b>
              <b className={styles.record}>{row.w}–{row.l}</b>
            </li>
          ))}
        </ol>
        <Bracket state={state} table={table} />
      </Ground>
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
            <div key={card.id} className={styles.handCard} style={{ viewTransitionName: `card-${card.id}` }}>
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
    return item.cost === 1 ? '1 Pack' : `${item.cost} Packs`;
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
    return Math.max(0.34, Math.min(0.42, ((h - 280) / 2) / 580));
  }, [phone]);

  const spotlightScale = phone ? 0.32 : 0.38;
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
    <div className={styles.stage}>
      <header className={styles.eafcTopNav}>
        <div className={styles.eafcNavLeft}>
          <span className={styles.eafcCrumb}>Year {state.year}</span>
          <b className={styles.eafcTitle}>Transfer Market</b>
          <span className={styles.eafcDivider} aria-hidden="true" />
          <nav className={styles.eafcTabs} aria-label="Market filter">
            {[
              ...(offers.mine.length > 0 ? [['mine', `Expiring (${offers.mine.length})`]] : []),
              ['free', `Free Agents (${offers.free.length})`],
              ['rivals', `Rivals (${offers.rivals.length})`],
              ['all', `All (${all.length})`],
            ].map(([id, label]) => (
              <button key={id} type="button" data-on={tab === id || undefined} aria-pressed={tab === id} onClick={() => switchTab(id)}>{label}</button>
            ))}
          </nav>
        </div>
        <div className={styles.chips}>
          <div className={styles.chip}><b>{offers.limit}</b><span>Cap</span></div>
          <div className={styles.chip}><b>{totals.squad}/{max}</b><span>Squad</span></div>
        </div>
      </header>
      <Ground className={styles.eafcGround}>
        <aside className={styles.eafcInspector}>
          <div className={styles.eafcInspectorTop}>
            <div className={styles.eafcCoinsRow}>
              <span>My Packs</span>
              <Packs n={totals.packs} label={false} />
            </div>
            {target && !phone && (
              <div className={styles.eafcSpotlight}>
                <span className={styles.eafcSpotlightTag}>{target.club ? target.club.name : target.trial ? 'Trialist' : 'Free Agent'}</span>
                <PlayerCard card={target.card} displayScale={spotlightScale} tilt={false} canDrag={false} />
                <b className={styles.eafcSpotlightName}>{target.card.player}</b>
              </div>
            )}
          </div>
          {target && (
            <div className={styles.eafcLedgerWrap}>
              <div className={styles.eafcLedger}>
                <div className={styles.eafcLedgerRow}>
                  <span>Club</span>
                  <b>{target.club ? target.club.name : target.trial ? 'Trial' : 'Unsigned'}</b>
                </div>
                <div className={styles.eafcLedgerRow}>
                  <span>Buy Now Price</span>
                  <b data-win={!target.cost || undefined}>{priceText(target)}</b>
                </div>
                {needsSwap && activeSwapOut ? (
                  <>
                    <div className={styles.eafcLedgerRow}>
                      <span>Replacing</span>
                      <b data-out="true">{activeSwapOut.player} ({activeSwapOut.rating})</b>
                    </div>
                    <div className={styles.eafcLedgerRow}>
                      <span>Rating Change</span>
                      <b data-win={ovrDelta > 0 || undefined} data-out={ovrDelta < 0 || undefined}>
                        {ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta} OVR
                      </b>
                    </div>
                  </>
                ) : (
                  <div className={styles.eafcLedgerRow}>
                    <span>Contract</span>
                    <b>{CONTRACT_MAX} Years</b>
                  </div>
                )}
              </div>
              <button type="button" className={styles.eafcSignBtn} disabled={blocked} onClick={() => toggleBuy(target.card.id)}>
                <span>{signLabel}</span>
                {!taken && !blocked && target.cost > 0 && <Packs n={target.cost} label={false} />}
              </button>
            </div>
          )}
        </aside>
        <div className={styles.eafcStage}>
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
          <section className={styles.eafcStageRow}>
            <span className={styles.eafcRowHead}>Your Squad</span>
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
                    <div className={styles.slotCard} style={{ viewTransitionName: `card-${card.id}` }}>
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
                  <div className={styles.slotCard} style={{ viewTransitionName: `card-${card.id}` }}>
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
        </div>
      </Ground>
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
    </div>
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

function readSave() {
  const { state, damaged } = loadClub();
  if (damaged) return { state: null, damaged: true };
  if (state && !isValidClub(state, allCards)) return { state: null, damaged: true };
  return { state, damaged: false };
}

// ── the game ────────────────────────────────────────────────────────────────

export default function Club() {
  const navigate = useNavigate();
  const size = useCardScale();
  const [boot] = useState(readSave);
  const [state, setState] = useState(boot.state);
  const [screen, setScreen] = useState(screenFor(boot.state));
  const [damaged, setDamaged] = useState(boot.damaged);
  const [saveFailed, setSaveFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const reducedMotion = useReducedMotion();
  const screenRef = useRef(screen);
  // Screen changes morph: elements named the same on both screens (a player's
  // card, the title, the packs, the action) travel to their new place.
  const morph = (change) => {
    if (reducedMotion || typeof document === 'undefined' || !document.startViewTransition) { change(); return; }
    document.startViewTransition(() => flushSync(change));
  };
  const show = next => morph(() => setScreen(next));
  useEffect(() => { screenRef.current = screen; });

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

  function start(seed, name, picks, crest) {
    morph(() => {
      setState(newClub({ seed, name, picks, crest, cards: allCards }));
      setScreen('home');
    });
  }

  function finishMatch(outcome) {
    // finishSeries and closeWindow ignore a repeat, so a double click is harmless.
    morph(() => {
      setState(current => finishSeries(current, outcome, allCards));
      setScreen('result');
    });
  }

  function trainPlayer(card, focus) {
    morph(() => {
      setState(train(state, card, focus));
      setNotice(`${card.player} trained`);
      setScreen('home');
    });
  }

  function openThePack(kind) {
    morph(() => {
      setState(current => openPack(current, kind, allCards));
      setScreen('open');
    });
  }

  function pickFromPack(id) {
    morph(() => {
      setState(current => choosePick(current, id));
      setScreen('vault');
    });
  }

  function takeChip(uid, drop) {
    morph(() => {
      setState(current => chooseChip(current, uid, drop));
      setScreen('home');
    });
  }

  function tapePlayer(card) {
    morph(() => {
      setState(spendTape(state, card));
      setNotice(`${card.player} learned from a tape`);
      setScreen('home');
    });
  }

  function closeTheWindow(decisions) {
    morph(() => {
      setState(current => closeWindow(current, decisions, allCards));
      setScreen('home');
    });
  }

  function fresh() {
    clearClub();
    setState(null);
    setDamaged(false);
    setScreen('start');
  }

  const alerts = saveFailed && <p className={styles.alert} role="alert">Progress isn't saving on this device</p>;

  if (damaged) return <Damaged onReset={fresh} />;
  if (screen === 'start' || !state) return <Start onStart={start} onExit={() => navigate('/run')} scale={size.scale} />;
  if (screen === 'train') {
    return <Train state={state} size={size} onBack={() => show('home')} onTrain={trainPlayer} onTape={tapePlayer} onBuy={() => setState(buySession(state))} canBuy={canBuySession(state)} />;
  }
  if (screen === 'open' && state.opening) return <OpenPack key={state.opens} state={state} size={size} onChoose={pickFromPack} />;
  if (screen === 'vault') return <Vault state={state} onBack={() => show('home')} onOpenPack={openThePack} onWindow={state.phase === 'review' ? () => show('window') : null} />;
  if (screen === 'chips') {
    return <ChipPick key={state.chipOffer?.attempt ?? 'hand'} state={state} onBack={() => show('home')} onTake={takeChip} onPass={() => morph(() => { setState(current => chooseChip(current, null)); setScreen('home'); })} onReroll={() => setState(current => rerollChips(current))} />;
  }
  if (screen === 'squad') return <Squad state={state} size={size} onBack={() => show('home')} onMove={(from, to) => morph(() => setState(current => moveSquad(current, from, to)))} />;
  const match = nextMatch(state);
  if (screen === 'match' && match) {
    const club = clubById(state, match.id);
    return (
      <BoardSeries
        key={`${state.year}:${state.week}:${match.stage}`}
        squad={squadCards(state, allCards).slice(0, STARTERS)}
        opponent={clubRoster(state, club, allCards)}
        opponentName={club.name}
        bestOf={match.bestOf}
        seed={seriesSeed(state, match)}
        hand={state.hand}
        onDone={finishMatch}
        onLeave={() => show('home')}
        fixed="full"
        three
      />
    );
  }
  // After a win the chip pick is the one decision left, so Continue leads into it.
  if (screen === 'result') return <Result state={state} size={size} onContinue={() => show(state.chipOffer && state.last?.won ? 'chips' : screenFor(state))} />;
  if (screen === 'league') return <League state={state} onBack={() => show('home')} />;
  if (screen === 'over' || state.phase === 'over') return <Over state={state} onAgain={fresh} />;
  if (screen === 'window') return <Window state={state} size={size} onClose={closeTheWindow} />;
  if (screen === 'review' || !match) return <Review state={state} size={size} onNext={() => show('window')} />;
  return (
    <>
      <Home
        state={state}
        size={size}
        go={(next) => { setNotice(''); show(next); }}
        onExit={() => navigate('/run')}
        onAbandon={fresh}
      />
      {notice && <p className={styles.toast} role="status">{notice}</p>}
      {alerts}
    </>
  );
}
