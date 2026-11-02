// Line items for a finished run or event. The rates mirror evaluateSeason in
// the card engine; `floor` absorbs its per-year clamp at zero, so the lines
// always add up to the score the player is actually given.
const RATE = { title: 150, series: 100, map: 20, grandSlam: 300, perfect: 500 };

export function scoreLines(result) {
  const years = result.years ?? [result];
  const grandSlams = years.filter(year => year.grandSlam).length;
  const perfectSeasons = years.filter(year => year.perfectSeason).length;
  const lines = [
    { key: 'titles', label: 'Titles', count: result.titles, value: result.titles * RATE.title },
    { key: 'series', label: 'Series won', count: result.seriesWon, value: result.seriesWon * RATE.series },
    { key: 'maps', label: 'Maps won', count: result.mapsWon, value: result.mapsWon * RATE.map },
    { key: 'rounds', label: 'Round difference', value: result.roundDiff },
  ];
  if (grandSlams) lines.push({ key: 'slams', label: 'Grand Slams', count: grandSlams, value: grandSlams * RATE.grandSlam });
  if (perfectSeasons) lines.push({ key: 'perfect', label: 'Perfect Seasons', count: perfectSeasons, value: perfectSeasons * RATE.perfect });
  if (result.prestigeBonus) {
    lines.push({ key: 'prestige', label: 'Prestige bonus', count: result.prestigeMultiplier, value: result.prestigeBonus });
  }
  const sum = lines.reduce((total, line) => total + line.value, 0);
  if (sum !== result.score) lines.push({ key: 'floor', label: 'Floor', value: result.score - sum });
  return lines;
}
