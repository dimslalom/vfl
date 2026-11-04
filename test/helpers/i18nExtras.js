import { t } from '../../src/lib/i18n.js';
import { SPECIALTIES } from '../../shared/src/data/specialties.js';

// The strings that reach t() through a variable, listed so the coverage test
// sees them: card-engine labels and filter chips.
export function specialtyTexts() {
  return Object.values(SPECIALTIES).map(spec => spec.desc);
}

export const DYNAMIC = () => [
  t('Round of 32'), t('Round of 16'), t('Round of 64'), t('Quarterfinals'), t('Semifinals'), t('Grand Final'),
  t('Preliminary Round'), t('Challengers'), t('Ascension'), t('International'),
  t('Unknown'), t('Local Name'), t('Respected'), t('Contender'), t('Elite'), t('Dynasty'),
  t('Challenger'), t('Underdog'),
  t('CHAMPION'), t('Won the tournament'), t('FLAWLESS'), t('No maps dropped'),
  t('GRAND SLAM'), t('Won all three tournaments'), t('PERFECT SEASON'), t('Three titles, zero maps dropped'),
  t('Titles'), t('Series won'), t('Maps won'), t('Round difference'), t('Rounds won'), t('Lane difference'), t('Grand Slams'), t('Perfect Seasons'), t('Prestige bonus'), t('Floor'),
  t('Bronze'), t('Silver'), t('Gold'), t('Icon'), t('bronze'), t('silver'), t('gold'), t('icon'),
  t('Prospect'), t('Prime'), t('Veteran'),
  t('Squad'), t('Market'), t('World'), t('Player Library'), t('Gauntlet'), t('Multiplayer'), t('Modes'),
  t('Base'), t('Map'), t('Call'), t('Counter'),
  t('All'), t('Duelist'), t('Initiator'), t('Controller'), t('Sentinel'),
  t('VCT'), t('Icons'),
  t('Cut'), t('Mirror'), t('Shield'), t('Hex'), t('Block'), t('Stack'), t('Roundel'), t('Sigil'), t('Slash'), t('Laurel'),
  t('Valor'), t('Cyan'), t('Teal'), t('Violet'), t('Bone'), t('Sunset'), t('Frost'),
];
