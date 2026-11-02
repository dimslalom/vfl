// Every map's three lanes, drawn from how the real map is laid out. Haven and
// Lotus have three sites; Bind has no mid, so its teleporters take that lane.
// Each lane scores one card stat and rewards a pair of roles, so the same squad
// spreads differently per map and every stat on the card gets a reason to matter.
const lane = (name, stat, label, roles) => ({ name, stat, label, roles });

export const MAP_LANES = {
  Ascent: [
    lane('A', 'positioning', 'GENERATOR HOLD', ['Sentinel', 'Controller']),
    lane('Mid', 'ability', 'CATWALK', ['Controller', 'Initiator']),
    lane('B', 'aim', 'MARKET HIT', ['Duelist', 'Initiator']),
  ],
  Bind: [
    lane('A', 'aim', 'SHORT A', ['Duelist', 'Controller']),
    lane('Tele', 'ability', 'TELEPORTER', ['Initiator', 'Sentinel']),
    lane('B', 'mentality', 'HOOKAH', ['Duelist', 'Initiator']),
  ],
  Haven: [
    lane('A', 'aim', 'LONG A', ['Duelist', 'Initiator']),
    lane('B', 'positioning', 'GARAGE', ['Controller', 'Sentinel']),
    lane('C', 'ability', 'LONG C', ['Initiator', 'Controller']),
  ],
  Lotus: [
    lane('A', 'aim', 'A MAIN', ['Duelist', 'Controller']),
    lane('B', 'mentality', 'B DOOR', ['Initiator', 'Sentinel']),
    lane('C', 'synergy', 'C MOUND', ['Duelist', 'Initiator']),
  ],
  Split: [
    lane('A', 'positioning', 'A RAMPS', ['Controller', 'Sentinel']),
    lane('Mid', 'ability', 'VENTS', ['Duelist', 'Controller']),
    lane('B', 'aim', 'B HEAVEN', ['Initiator', 'Sentinel']),
  ],
  Sunset: [
    lane('A', 'positioning', 'A ALLEY', ['Sentinel', 'Controller']),
    lane('Mid', 'aim', 'MID TIPPY', ['Duelist', 'Initiator']),
    lane('B', 'synergy', 'B BOBA', ['Initiator', 'Duelist']),
  ],
  Icebox: [
    lane('A', 'aim', 'A BELT', ['Duelist', 'Sentinel']),
    lane('Mid', 'ability', 'MID TUBE', ['Controller', 'Sentinel']),
    lane('B', 'mentality', 'B YELLOW', ['Duelist', 'Initiator']),
  ],
};

export function winsNeeded(bestOf) {
  return Math.ceil(bestOf / 2);
}

/** Who has taken the series, or null while it is still live. */
export function seriesWinner(bestOf, youWins, themWins) {
  const needed = winsNeeded(bestOf);
  if (youWins >= needed) return 'you';
  if (themWins >= needed) return 'them';
  return null;
}
