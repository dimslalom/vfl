import { t } from './i18n';

// The card engine lives in cards-val and writes its chemistry lines in English.
// They are read back here by shape, so translation stays out of the engine.
const PATTERNS = [
  [/^Full role coverage$/, () => t('Full role coverage')],
  [/^Missing: (.+)$/, ([roles]) => t('Missing: {roles}', { roles })],
  [/^Flex covers (.+)$/, ([roles]) => t('Flex covers {roles}', { roles })],
  [/^(\d+)x (.+) stack$/, ([n, role]) => t('{n}x {role} stack', { n, role })],
  [/^(.+) one-tricks solo$/, ([player]) => t('{player} one-tricks solo', { player })],
  [/^(\d+) countryman pairs?$/, ([n]) => t('Countrymen pairs: {n}', { n })],
  [/^(\d+) real teammate pairs?$/, ([n]) => t('Real teammate pairs: {n}', { n })],
  [/^(\d+) pairs? played together before$/, ([n]) => t('Pairs who played together: {n}', { n })],
  [/^IGL (.+) \((.+)\)$/, ([player, role]) => t('IGL {player} ({role})', { player, role })],
  [/^(.+) is a real IGL$/, ([player]) => t('{player} is a real IGL', { player })],
  [/^(.+) & (.+) click$/, ([player, other]) => t('{player} and {other} are clicking', { player, other })],
];

export function chemLabel(label) {
  const text = String(label);
  for (const [pattern, format] of PATTERNS) {
    const match = text.match(pattern);
    if (match) return format(match.slice(1));
  }
  return text;
}
