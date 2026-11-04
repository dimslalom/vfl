import { useState } from 'react';
import { edgePoints, mapActivation, seriesEdge, tacticActivation } from '../engine/endless/seriesCards';
import { t } from '../lib/i18n';
import { MapDealTable, TacticCard, TacticTable } from './SeriesCardTable';
import styles from './LobbySeriesPrep.module.css';

// A human's side of a lobby series: pick maps, then give each dealt map its own
// tactic, one step at a time. Nothing leaves the browser until the last tactic
// is placed, so backing out needs no server round trip. Keyed by match id by
// the caller, so a new series always starts from a clean slate.
export default function LobbySeriesPrep({ snapshot, myId, onSubmit }) {
  const prep = snapshot.seriesPrep;
  const side = prep.sides[myId];
  const [mapPicks, setMapPicks] = useState([]);
  const [tactics, setTactics] = useState({});
  const tournament = snapshot.tournament;
  const round = tournament.rounds[tournament.roundIdx];
  const match = round.matches.find(item => item.id === prep.matchId);
  const teamA = tournament.teams[match.a];
  const teamB = tournament.teams[match.b];

  if (!side?.hand || side.ready) {
    return <Matchup teamA={teamA} teamB={teamB} />;
  }

  const me = match.a === myId ? teamA : teamB;
  const opponent = match.a === myId ? teamB : teamA;
  const edgeFor = map => ({
    you: edgePoints(seriesEdge(mapActivation(me.roster, map, side.mastery?.[map.name] ?? 0))),
    them: edgePoints(seriesEdge(mapActivation(opponent.roster, map, side.rivalMastery?.[map.name] ?? 0))),
  });

  if (mapPicks.length < prep.perSide) {
    const taken = new Set(mapPicks);
    return (
      <MapDealTable
        maps={prep.dealt}
        playerPicks={prep.dealt.filter(map => taken.has(map.name)).map(map => map.id)}
        picksPerSide={prep.perSide}
        selectableIds={new Set(prep.dealt.filter(map => !taken.has(map.name)).map(map => map.id))}
        onPick={map => setMapPicks([...mapPicks, map.name])}
        mastery={side.mastery}
        opponent={opponent}
        edgeFor={edgeFor}
      />
    );
  }

  const placed = Object.keys(tactics).length;
  // Every tactic is placed and the submit is on its way to the server.
  if (placed >= prep.dealt.length) {
    return <Matchup teamA={teamA} teamB={teamB} />;
  }
  const map = prep.dealt[placed];
  const used = new Set(Object.values(tactics));
  const mastery = side.mastery?.[map.name] ?? 0;

  function place(card) {
    const next = { ...tactics, [map.name]: card.uid };
    setTactics(next);
    if (Object.keys(next).length === prep.dealt.length) onSubmit({ mapPicks, tactics: next });
  }

  return (
    <TacticTable
      map={map}
      hand={side.hand.filter(card => !used.has(card.uid))}
      opponent={opponent}
      onPlay={place}
      step={{ current: placed + 1, total: prep.dealt.length }}
      edge={edgeFor(map)}
      multFor={card => tacticActivation(card, me.roster, mapActivation(me.roster, map, mastery)).mult}
    />
  );
}

function Matchup({ teamA, teamB }) {
  return (
    <div className={styles.waiting}>
      <span>{teamA.name}</span>
      <span className={styles.versus}>{t('vs')}</span>
      <span>{teamB.name}</span>
    </div>
  );
}

// Once a series resolves, both sides' cards come up with each map's result.
export function SeriesReveal({ tournament, matchId }) {
  const round = tournament.rounds[tournament.roundIdx];
  const match = round.matches.find(item => item.id === matchId);
  if (!match?.maps?.[0]?.tacticA) return null;
  const teamA = tournament.teams[match.a];
  const teamB = tournament.teams[match.b];
  return (
    <section className={styles.reveal} aria-label={t('Series result')}>
      <div className={styles.revealHead}>
        <span>{teamA.name}</span>
        <b>{match.scoreA}–{match.scoreB}</b>
        <span>{teamB.name}</span>
      </div>
      <ol className={styles.revealMaps}>
        {match.maps.map(map => (
          <li key={map.map}>
            <TacticCard instance={map.tacticA} compact disabled />
            <span className={styles.revealScore}>
              <small>{map.map}</small>
              <b>{map.a}–{map.b}</b>
            </span>
            <TacticCard instance={map.tacticB} compact disabled />
          </li>
        ))}
      </ol>
    </section>
  );
}
