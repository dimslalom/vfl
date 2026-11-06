// Chip names are stored in capitals for the match board's chip faces; everywhere a
// name is read as a name it is title case, like tape and evo names
// ("POCKET STRAT" -> "Pocket Strat", "HIT THE SITE" -> "Hit the Site").
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

export const titleCase = text => text.toLowerCase().split(' ')
  .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
  .join(' ');
