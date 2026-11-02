import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import PlayerCard from '../../shared/src/components/PlayerCard';
import PlayerPortrait from '../../shared/src/components/PlayerPortrait';
import Split from '../../shared/src/components/Split';
import { hasRealPortrait } from '../../shared/src/lib/portrait';
import { assetPath } from '../../shared/src/lib/utils';
import { PROMOTE_AT, RELEGATE_AT, TIER_META, reputationRankProgress } from '../engine/endless/ladder';
import { signingCost } from '../engine/endless/market';
import { describeNews, newsKit } from '../engine/endless/news';
import { chemLabel } from '../lib/chemLabels';
import { t } from '../lib/i18n';
import useScrollLean from '../lib/useScrollLean';
import { signed } from '../lib/format';
import Impact from './Impact';
import TacticalButton from './TacticalButton';
import styles from '../pages/PerfectRun.module.css';

// The panels of the manage screen, moved out of PerfectRun as they stood. They
// share its stylesheet because they grew up with it; only the props are new.

// Power and the reasons for it. Reading material rather than something you
// manipulate - the squad itself lives in the dock, where you can move it.
export function ChemPanel({ power }) {
  const chemSign = power.chem > 0 ? 'up' : power.chem < 0 ? 'down' : 'flat';
  return (
    <div className={styles.chem}>
      <div className={styles.chemHead}>
        <b className={styles.chemTotal}>{power.power.toFixed(1)}</b>
        <span className={styles.chemLabel}>
          {t('Team power')}
          <i>{t('avg {n}', { n: power.base.toFixed(1) })}</i>
        </span>
        {/* Chemistry as a badge with its own arrow, not a number folded into
            a sentence - the direction is the thing to notice at a glance. */}
        <span className={styles.chemBadge} data-sign={chemSign}>
          <span className={styles.chemBadgeArrow} aria-hidden="true">
            {chemSign === 'up' ? '▲' : chemSign === 'down' ? '▼' : '–'}
          </span>
          {Math.abs(power.chem)}
        </span>
      </div>
      {power.lines?.length > 0 && (
        <ul className={styles.chemList}>
          {power.lines.map(line => (
            <li key={line.label}>
              <span>{chemLabel(line.label)}</span>
              <b data-sign={String(line.value).startsWith('-') ? 'down' : 'up'}>{line.value}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SeasonStrip({ results, season, tourIndex, endless }) {
  const [openIndex, setOpenIndex] = useState(null);
  const yearIndex = endless ? Math.floor(tourIndex / 3) : 0;
  const thisYear = results.slice(yearIndex * 3, yearIndex * 3 + 3);
  const events = (endless ? season.slice(yearIndex * 3, yearIndex * 3 + 3) : season).slice(0, 3);
  if (!events.length) return null;

  return (
    <div className={styles.season}>
      <span className={styles.seasonLabel}>{endless ? t('Year {n}', { n: yearIndex + 1 }) : t('Season')}</span>
      <ol className={styles.seasonList}>
        {events.map((event, i) => {
          const played = thisYear[i];
          const state = played ? (played.champion ? 'won' : 'played') : i === tourIndex % 3 ? 'next' : 'upcoming';
          const Tag = played ? 'button' : 'div';
          return (
            <li key={event.label}>
              <Tag
                type={played ? 'button' : undefined}
                className={styles.seasonSlot}
                data-state={state}
                data-open={openIndex === i ? 'true' : undefined}
                onClick={played ? () => setOpenIndex(openIndex === i ? null : i) : undefined}
              >
                <span className={styles.seasonCity}>{event.city || event.label}</span>
                <span className={styles.seasonResult}>
                  {played ? (played.champion ? t('Champion') : t(played.finishRound)) : state === 'next' ? t('Next') : '-'}
                </span>
              </Tag>
            </li>
          );
        })}
      </ol>
      {/* Detail stays one tap away rather than stacked on the page. */}
      {openIndex != null && thisYear[openIndex] && (
        <TournamentReport result={thisYear[openIndex]} />
      )}
    </div>
  );
}

export function PoachOffer({ offer, card, signals, reputation, refuseRows, releaseRows, onResolve, onInspect }) {
  if (!offer || !card) return null;
  const canHold = reputation >= offer.holdCost;
  const short = offer.holdCost - reputation;
  return (
    <div className={styles.poach} data-poach-offer="true" tabIndex={-1}>
      <button
        type="button"
        className={styles.poachCard}
        onClick={() => onInspect(card)}
        aria-label={t('Inspect {player}', { player: card.player })}
      >
        <PlayerCard card={card} displayScale={0.32} tilt={false} signals={signals} />
      </button>
      <span className={styles.poachBody}>
        <b className={styles.poachName}>{t('{org} want {player}', { org: offer.orgName, player: offer.player })}</b>
        {/* Cost as badges, not a sentence — a rep tag and a pack-icon tag,
            same idiom the market's own sign price and chemistry badge use. */}
        <span className={styles.poachTerms}>
          <span className={styles.poachTerm} data-ok={canHold ? 'true' : 'false'}>
            <b>{offer.holdCost}</b>
            <small>{t('reputation to refuse')}</small>
          </span>
          <span className={styles.poachTerm}>
            <img className={styles.poachTermIcon} src={assetPath('/assets/brand/gauntlet-icon.webp')} alt="" aria-hidden="true" />
            <b>+{offer.releaseFee}</b>
            <small>{t('packs to release')}</small>
          </span>
        </span>
        <span className={styles.poachImpact}>
          <span>
            <small>{t('If you refuse')}</small>
            <Impact rows={refuseRows} label={t('If you refuse')} />
          </span>
          <span>
            <small>{t('If you let them go')}</small>
            <Impact rows={releaseRows} label={t('If you let them go')} />
          </span>
        </span>
      </span>
      <span className={styles.poachActions}>
        <span className={styles.poachRefuse}>
          <TacticalButton className={styles.secondary} disabled={!canHold} onClick={() => onResolve(false)}>
            {t('Refuse')}
          </TacticalButton>
          {/* The button alone doesn't say WHY it's greyed out — this does,
              instead of making the player go do the subtraction themselves
              against the badge above. */}
          {!canHold && <span className={styles.poachShort}>{t('Need {n} more reputation', { n: short })}</span>}
        </span>
        <TacticalButton className={styles.primary} onClick={() => onResolve(true)}>
          {t('Let them go')}
        </TacticalButton>
      </span>
    </div>
  );
}

// Bleeds an element out to the frame's actual edges - the mode rail on the
// left, the safe-area inset on the right - regardless of how it's nested.
// `.desk`'s content column is independently width-capped AND centered
// inside `.page`'s own padding, so which one ends up narrower (and by how
// much) depends on viewport width; duplicating that math in CSS would mean
// two competing centering formulas fighting for the right answer. Measuring
// the live gap instead sidesteps that entirely. Purely visual - an inline
// width/margin layered on top of the flow position the element already has
// - so it still reserves its own height normally; nothing downstream in
// `.desk` has to account for it stepping out of flow.
function useFrameBleed(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    function measure() {
      // Reset first: last run's own margin/width would otherwise be baked
      // into this run's measured rect.
      el.style.marginLeft = '0px';
      el.style.width = '';
      const rect = el.getBoundingClientRect();
      const root = getComputedStyle(document.documentElement);
      const railSize = parseFloat(root.getPropertyValue('--rail-size')) || 0;
      const safeL = parseFloat(root.getPropertyValue('--safe-l')) || 0;
      const safeR = parseFloat(root.getPropertyValue('--safe-r')) || 0;
      // Mirrors PerfectRun.module.css's own `.frame` breakpoint: the rail
      // becomes a top bar under 680px, so it stops reserving left space.
      const mobile = window.matchMedia('(max-width: 680px)').matches;
      const frameLeft = mobile ? safeL : railSize + safeL;
      const frameWidth = window.innerWidth - frameLeft - safeR;
      el.style.marginLeft = `${frameLeft - rect.left}px`;
      el.style.width = `${frameWidth}px`;
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref]);
}

// Spend packs on a NAMED player instead of a gamble. Reputation decides who
// will even take the call, which is what stops it being a shop.
export function TransferMarket({ targets, packs, ceiling, onSign, onInspect, signalsFor }) {
  const marketRef = useRef(null);
  useFrameBleed(marketRef);

  // A plain vertical wheel gesture (a mouse, not a trackpad) does nothing on
  // an overflow-x shelf - there's no vertical room to scroll. Redirect that
  // delta into horizontal motion so the shelf reacts to scrolling either way.
  const listRef = useRef(null);
  useScrollLean(listRef);
  const onWheel = useCallback((event) => {
    const el = listRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    el.scrollLeft += event.deltaY;
    event.preventDefault();
  }, []);

  return (
    <div className={styles.market} ref={marketRef}>
      <div className={styles.marketHeadRow}>
        <span className={styles.marketHead}>{t('Transfer market')}</span>
        <span className={styles.marketMeta}>
          <img className={styles.marketPackIcon} src={assetPath('/assets/brand/gauntlet-icon.webp')} alt="" aria-hidden="true" />
          <Split parts={[<b key="packs">{packs}</b>, t('up to {n} rated', { n: ceiling })]} />
        </span>
      </div>
      {targets.length === 0 ? (
        <p className={styles.marketEmpty}>{t('Nobody in reach is available. Win more to raise your reputation.')}</p>
      ) : (
        // The real card, not a summary of one. Rating, role, nationality, the
        // five stats, specialties and career stage are all already drawn on
        // it - restating any of them beside it would be telling. Everyone
        // your club could plausibly attract shows up here, not just who you
        // can afford this instant - a shop window, not a receipt: seeing a
        // name and knowing you're 2 packs short is the point, not a reason
        // to hide it.
        <ul className={styles.marketList} ref={listRef} onWheel={onWheel}>
          {targets.map(card => {
            const cost = signingCost(card);
            const affordable = packs >= cost;
            return (
              <li key={card.id} className={styles.marketPick}>
                <div className={styles.marketCard}>
                  <PlayerCard
                    card={card}
                    displayScale={0.34}
                    onClick={() => onInspect(card)}
                    signals={signalsFor(card)}
                  />
                </div>
                {/* Cost as a pack icon with the count on it, not the words
                    "N packs" - same idiom as the dock's own pack badge. A
                    target out of reach still opens its preview, so it stays
                    something to save toward; only Confirm is disabled. */}
                <TacticalButton
                  className={styles.secondary}
                  onClick={() => onSign(card)}
                  data-short={affordable ? undefined : 'true'}
                  aria-label={affordable
                    ? t('Sign {player} for {n} packs', { player: card.player, n: cost })
                    : t('Need {n} packs, have {have}', { n: cost, have: packs })}
                >
                  <span className={styles.marketCost} aria-hidden="true">
                    <img className={styles.marketCostIcon} src={assetPath('/assets/brand/gauntlet-icon.webp')} alt="" />
                    <b>{cost}</b>
                  </span>
                </TacticalButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Everything that happened while you were not looking. Transfers render the
// player in their NEW kit - the portrait compositor already supports it, and
// seeing your man in someone else's shirt is the whole emotional payload.
export function NewsFeed({ feed, cardsById }) {
  if (!feed?.length) return <p className={styles.marketEmpty}>{t('No news yet. Finish an event and the circuit will start moving.')}</p>;
  return (
    <div className={styles.news}>
      <span className={styles.newsHead}>{t('Around the circuit')}</span>
      <ul className={styles.newsList}>
        {feed.slice(0, 8).map((item, i) => {
          const { title, note } = describeNews(item);
          const card = item.cardId ? cardsById.get(item.cardId) : null;
          const kit = newsKit(item);
          return (
            <li key={`${item.y}-${item.t}-${i}`} className={styles.newsRow}>
              {card ? (
                <span className={styles.castPlayerFace} aria-hidden="true">
                  {hasRealPortrait(card)
                    ? <PlayerPortrait card={card} kit={kit ?? undefined} fluid loading="lazy" />
                    : <span className={styles.castPlayerInitial}>{card.player.slice(0, 2)}</span>}
                </span>
              ) : (
                <span className={styles.newsDot} aria-hidden="true" />
              )}
              <span className={styles.newsTitle}>{title}</span>
              <span className={styles.newsNote}>{note}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The market's one confirmation: who this replaces, what it does to the team,
// and what it costs, all before anything is spent. `previewFor` runs the same
// calculation the game does, so these numbers are the ones you will get.
export function SigningConfirm({ card, cost, packs, picks, openSlot, signals, previewFor, onConfirm }) {
  const [targetId, setTargetId] = useState(openSlot ? null : picks[0]?.id ?? null);
  const preview = previewFor(targetId);
  const outgoing = picks.find(player => player.id === targetId) ?? null;
  const short = cost - packs;
  const rows = [];
  if (preview.before && preview.after) {
    rows.push({
      label: t('Team power'),
      before: preview.before.power.toFixed(1),
      after: preview.after.power.toFixed(1),
      delta: signed(preview.power),
      good: preview.power > 0 ? 'true' : preview.power < 0 ? 'false' : undefined,
    });
    rows.push({
      label: t('Chemistry'),
      before: preview.before.chem,
      after: preview.after.chem,
      delta: signed(preview.chem, 0),
      good: preview.chem > 0 ? 'true' : preview.chem < 0 ? 'false' : undefined,
    });
  }
  rows.push({ label: t('Packs'), before: packs, after: Math.max(0, packs - cost), delta: `-${cost}` });

  return (
    <div className={styles.signConfirm}>
      <div className={styles.signFace}>
        <PlayerCard card={card} displayScale={0.42} tilt={false} canDrag={false} signals={signals} />
      </div>
      <div className={styles.signSide}>
        <span className={styles.signLabel}>{openSlot ? t('Joins your squad') : t('Who leaves')}</span>
        {openSlot ? (
          <p className={styles.signNote}>
            {preview.benchOnly ? t('Takes your open bench slot. Your five starters stay the same.') : t('Takes your open slot.')}
          </p>
        ) : (
          <div className={styles.signTargets} role="group" aria-label={t('Who leaves')}>
            {picks.map(player => (
              <button
                key={player.id}
                type="button"
                className={styles.signTarget}
                aria-pressed={player.id === targetId}
                onClick={() => setTargetId(player.id)}
              >
                {player.player}
              </button>
            ))}
          </div>
        )}
        <Impact rows={rows} />
        <TacticalButton
          className={styles.primary}
          disabled={short > 0}
          onClick={() => onConfirm(targetId)}
        >
          {short > 0
            ? t('Need {n} more packs', { n: short })
            : outgoing
              ? t('Swap {out} for {in}', { out: outgoing.player, in: card.player })
              : t('Sign {player}', { player: card.player })}
        </TacticalButton>
      </div>
    </div>
  );
}

export function ProspectOffer({ card, signals, onSign, onDecline, onInspect }) {
  if (!card) return null;
  return (
    <div className={styles.prospect}>
      {/* No copy about "years of growth ahead" - the card carries an age, a
          PROSPECT chip and a headroom bar, which is the same claim made in
          data the player can check. */}
      <button
        type="button"
        className={styles.prospectCard}
        onClick={() => onInspect(card)}
        aria-label={t('Inspect {player}', { player: card.player })}
      >
        <PlayerCard card={card} displayScale={0.38} tilt={false} signals={signals} />
      </button>
      <span className={styles.prospectSide}>
        <span className={styles.prospectHead}>{t('From the academy')}</span>
      </span>
      <span className={styles.prospectActions}>
        <TacticalButton className={styles.primary} onClick={onSign}>{t('Sign free')}</TacticalButton>
        <TacticalButton className={styles.secondary} onClick={onDecline}>{t('Pass')}</TacticalButton>
      </span>
    </div>
  );
}

export function SquadReport({ report, squad }) {
  if (!report?.changes?.length) return null;
  const byId = new Map(squad.map(card => [card.id, card]));
  const order = { club_icon: 0, legend: 0, growth: 1, decline: 2 };
  const changes = [...report.changes].sort(
    (a, b) => order[a.kind] - order[b.kind] || Math.abs(b.n) - Math.abs(a.n),
  );

  return (
    <div className={styles.squadReport}>
      <span className={styles.squadReportHead}><Split parts={[t('Year {n}', { n: report.year }), t('Squad development')]} /></span>

      <ul className={styles.squadReportList}>
        {changes.map(change => {
          const card = byId.get(change.id);
          return (
            <li key={`${change.id}-${change.kind}`} className={styles.squadReportRow} data-kind={change.kind}>
              <span className={styles.castPlayerFace} aria-hidden="true">
                {card && hasRealPortrait(card)
                  ? <PlayerPortrait card={card} fluid loading="lazy" />
                  : <span className={styles.castPlayerInitial}>{change.player.slice(0, 2)}</span>}
              </span>
              <span className={styles.squadReportName}>{change.player}</span>
              <span className={styles.squadReportNote}>
                {change.kind === 'club_icon' ? t('Club Icon')
                  : change.kind === 'legend' ? t('Legend')
                  : change.kind === 'growth' ? t('Improving') : t('Slipping')}
              </span>
              <span className={styles.squadReportDelta}>
                {change.kind === 'club_icon' ? '★⌁'
                  : change.kind === 'legend' ? '★'
                    : `${change.n > 0 ? '+' : ''}${change.n}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CircuitPanel({ tier, tierPoints, reputation, eventInYear, year, move }) {
  const { rank, next, pct: repPct } = reputationRankProgress(reputation);
  // Position on a track running from the relegation line to the promotion
  // line, so "how close am I to dropping" is a distance, not a number.
  const span = PROMOTE_AT - RELEGATE_AT;
  const pct = Math.max(0, Math.min(1, (tierPoints - RELEGATE_AT) / span)) * 100;

  return (
    <div className={styles.circuit}>
      <div className={styles.circuitHead}>
        <h3 className={styles.circuitTitle}>{t('Circuit standing')}</h3>
        <span className={styles.circuitWhen}><Split parts={[t('Year {n}', { n: year }), t('Event {n} of 3', { n: eventInYear })]} /></span>
      </div>

      {/* Reputation as a badge with its own meter, not a label glued to a
          number - the rank IS the read, and how close the next one is
          should be a bar you glance at, not arithmetic you do. */}
      <div className={styles.circuitRank}>
        <span className={styles.circuitRankBadge} data-rank={rank.key}>{t(rank.label)}</span>
        <div
          className={styles.circuitRankTrack}
          role="img"
          aria-label={next
            ? t('{n} reputation, {rank} at {min}', { n: reputation, rank: t(next.label), min: next.min })
            : t('{n} reputation, highest rank reached', { n: reputation })}
        >
          <span className={styles.circuitRankFill} style={{ width: `${repPct}%` }} />
        </div>
        <span className={styles.circuitRankValue}>{reputation}</span>
      </div>

      <ol className={styles.circuitTiers}>
        {TIER_META.map((meta, i) => (
          <li
            key={meta.key}
            className={styles.circuitTier}
            data-state={i === tier ? 'current' : i < tier ? 'below' : 'above'}
          >
            {t(meta.label)}
          </li>
        ))}
      </ol>

      {move && (
        <p className={styles.circuitMove} data-move={move.movement}>
          {move.movement === 'promote'
            ? t('Promoted to {tier} after year {n}.', { tier: t(TIER_META[move.tier].label), n: move.year })
            : t('Relegated to {tier} after year {n}.', { tier: t(TIER_META[move.tier].label), n: move.year })}
        </p>
      )}

      <div className={styles.circuitTrack} role="img"
        aria-label={t('{n} ladder points, promotion at {up}, relegation at {down}', { n: tierPoints, up: PROMOTE_AT, down: RELEGATE_AT })}>
        <span className={styles.circuitFill} style={{ width: `${pct}%` }} />
        <span className={styles.circuitPin} style={{ left: `${pct}%` }} />
      </div>
      <div className={styles.circuitScale}>
        <span data-edge="drop">{t('Relegation')}</span>
        <span data-edge="rise">{t('Promotion')}</span>
      </div>
    </div>
  );
}

function TournamentReport({ result }) {
  if (!result) return null;
  const topMvp = result.mvpBoard?.[0];
  const seriesLost = result.seriesPlayed - result.seriesWon;
  return (
    <div className={styles.tourReport}>
      <div className={styles.tourReportTotal}>
        <span>{result.label}</span>
        <b>{result.champion ? t('Champion') : t(result.finishRound)}</b>
      </div>
      <ul className={styles.tourReportLines}>
        <li><span>{t('Series')}</span><b>{result.seriesWon}–{seriesLost}</b></li>
        <li><span>{t('Maps')}</span><b>{result.mapsWonTotal}–{result.mapsLostTotal}</b></li>
        {topMvp && (
          <li><span>{t('Most MVPs')}</span><b><Split parts={[topMvp.card.player, topMvp.count]} /></b></li>
        )}
        {result.igl && (
          <li><span>{t('In-game leader')}</span><b>{result.igl.player}</b></li>
        )}
      </ul>
    </div>
  );
}
