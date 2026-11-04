// What each chip says to a player: the one-line effect, when it is good and
// what it risks. Written against what the board actually pays (see
// docs/chip-strategy-notes.md), and passed through t() as literals so the i18n
// test sees every string.

import { t } from '../lib/i18n.js';

const COPY = {
  pocket: () => ({
    effect: t('×1.5 on any lane. No condition.'),
    when: t('A safe pick when nothing else fits a lane.'),
    risk: t('Never pays more than ×1.5.'),
  }),
  hit: () => ({
    effect: t('Pays more for each Duelist on its lane.'),
    when: t('Stack two or three Duelists on one lane.'),
    risk: t('One Duelist alone only gets ×1.5.'),
  }),
  layers: () => ({
    effect: t('×2.5 when a Controller and an Initiator share its lane.'),
    when: t('An easy ×2.5: most squads have both roles.'),
    risk: t('Rotate either one away and it drops to ×1.5.'),
  }),
  retake: () => ({
    effect: t('×2.5 when a Sentinel and a Controller share its lane.'),
    when: t('An easy ×2.5 if you start a Sentinel.'),
    risk: t('Rotate either one away and it drops to ×1.5.'),
  }),
  contact: () => ({
    effect: t('Pays for Flick players on its lane, more with an Initiator.'),
    when: t('Once two of your players have learned Flick.'),
    risk: t('Without a Flick player it only pays ×1.5.'),
  }),
  flood: () => ({
    effect: t('Pays for each Flex player on its lane.'),
    when: t('Flex players also move free in the rotate.'),
    risk: t('Without a Flex player it only pays ×1.5.'),
  }),
  defaults: () => ({
    effect: t('Wants all four roles on one lane, but a lane holds three.'),
    when: t('Keep it as a ×1.5 spare.'),
    risk: t('Always ×1.5 on the board.'),
  }),
  calling: () => ({
    effect: t('×2.5 for a Mastermind on its lane, ×3 for two.'),
    when: t('Train Mastermind first; then it is the strongest chip.'),
    risk: t('Without a Mastermind it only pays ×1.5.'),
  }),
  noRespect: () => ({
    effect: t('×2 for a Flick player on its lane, ×3 for two.'),
    when: t('A Flick player alone scores their best stat, then ×2.'),
    risk: t('Without a Flick player it only pays ×1.5.'),
  }),
  lockout: () => ({
    effect: t('Multiplies the map bonus, which the board does not use.'),
    when: t('Keep it as a ×1.5 spare.'),
    risk: t('Always ×1.5 on the board.'),
  }),
};

export function chipCopy(key) {
  return (COPY[key] ?? COPY.pocket)();
}

// The rules every chip shares, for the "How chips work" sheet.
export function chipRules() {
  return [
    { title: t('One per map'), text: t('Drop one chip on one lane before you lock in. It stays there through the rotate.') },
    { title: t('It multiplies'), text: t('Your lane total, after combos, times the chip. Every chip pays at least ×1.5, up to ×3.') },
    { title: t('Who is on the lane'), text: t('The chip reads only the players on its lane. Rotate them away and the bonus goes too.') },
    { title: t('Win it back'), text: t('Win the map and the chip comes back. Lose it and the chip is gone. Your IGL tops you up to two.') },
  ];
}

export function chipTips() {
  return [
    t('Play it on the lane you could win or lose, not the one you win anyway.'),
    t('Build the lane for the chip: pair chips want both roles together.'),
    t('Skill chips need trained skills. Train Flick, Flex or Mastermind to unlock them.'),
    t('A bench player with the missing role can be worth a whole chip.'),
  ];
}

/** The plan line for a real squad: what the chip pays and who has to share its lane. */
export function planLine(plan) {
  if (!plan.fits) return t('Only ×1.5 for your five right now.');
  const names = plan.cards.map(card => card.player).join(' + ');
  return plan.cards.length === 1
    ? t('Up to ×{mult} for you: {names} on its lane.', { mult: plan.mult, names })
    : t('Up to ×{mult} for you: {names} on one lane.', { mult: plan.mult, names });
}
