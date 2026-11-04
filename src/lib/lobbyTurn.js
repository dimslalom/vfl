// Whose move it is, phase by phase, from a public snapshot. One answer for the
// banner in every phase, so "your turn" can never read differently per screen.
const names = (snapshot, ids) => ids
  .map(id => snapshot.competitors.find(player => player.id === id)?.squadName)
  .filter(Boolean);

export function lobbyTurn(snapshot, myId) {
  const isHost = snapshot.hostId === myId;
  const isCompetitor = snapshot.competitors.some(player => player.id === myId);
  switch (snapshot.phase) {
    case 'lobby':
      return { mine: isHost, kind: isHost ? 'start' : 'host', waitingOn: names(snapshot, [snapshot.hostId]), deadlineAt: null };
    case 'draft': {
      const active = snapshot.draft?.activeCompetitorId;
      return { mine: active === myId, kind: 'draft', waitingOn: names(snapshot, [active]), deadlineAt: snapshot.draft?.deadlineAt ?? null };
    }
    case 'consolation': {
      const active = snapshot.consolation?.activeCompetitorId;
      return { mine: active === myId, kind: 'consolation', waitingOn: names(snapshot, [active]), deadlineAt: snapshot.consolation?.deadlineAt ?? null };
    }
    case 'igl_select': {
      const pending = snapshot.competitors.filter(player => !snapshot.draft?.iglSelections?.[player.id]).map(player => player.id);
      return { mine: pending.includes(myId), kind: 'igl', waitingOn: names(snapshot, pending), deadlineAt: snapshot.draft?.deadlineAt ?? null };
    }
    case 'series_prep': {
      const sides = snapshot.seriesPrep?.sides ?? {};
      const pending = Object.keys(sides).filter(id => !sides[id].ready);
      return { mine: pending.includes(myId), kind: 'series', waitingOn: names(snapshot, pending), deadlineAt: snapshot.seriesPrep?.deadlineAt ?? null };
    }
    case 'match_ready':
    case 'match_transition':
      return {
        mine: isHost, kind: snapshot.phase === 'match_ready' ? 'match' : 'next',
        waitingOn: names(snapshot, [snapshot.hostId]), deadlineAt: snapshot.pendingTransition?.deadlineAt ?? null,
      };
    case 'season_over':
      return { mine: isHost, kind: 'over', waitingOn: names(snapshot, [snapshot.hostId]), deadlineAt: null };
    default:
      return { mine: false, kind: 'wait', waitingOn: [], deadlineAt: null, spectating: !isCompetitor };
  }
}
