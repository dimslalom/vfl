// What each chip says to a player: the one-line effect, when it is good and
// what it risks. Written against what the board actually pays (see
// docs/chip-strategy-notes.md), and passed through t() as literals so the i18n
// test sees every string.

import { t } from '../lib/i18n.js';

const COPY = {
  pocket: () => ({
    effect: t('×2 on the lane your IGL plays, ×1.5 anywhere else.'),
    when: t('Send your IGL to the lane you most need.'),
    risk: t('Rotate the IGL away and it drops to ×1.5.'),
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
    effect: t('×2.5 when three different roles share its lane.'),
    when: t('A full lane of three, one of each role.'),
    risk: t('Two of the same role and it drops to ×1.5.'),
  }),
  calling: () => ({
    effect: t('×2 on its lane, and chains ×1.5 to the lane on its left.'),
    when: t('Two close lanes side by side. A Mastermind on its lane adds ×0.5 to both.'),
    risk: t('From the left lane it chains to the middle instead.'),
  }),
  noRespect: () => ({
    effect: t('The enemy\'s best player on its lane scores 0.'),
    when: t('Against a lane carried by one star. A Flick player on its lane also adds ×1.5.'),
    risk: t('Without a Flick player your own lane gets no boost.'),
  }),
  lockout: () => ({
    effect: t('The enemy\'s chip pays nothing, wherever they play it.'),
    when: t('When their chip would decide a lane. Play it on any lane.'),
    risk: t('No boost of its own, and wasted if they play no chip.'),
  }),
};

export function chipCopy(key) {
  return (COPY[key] ?? COPY.pocket)();
}

// The rules every chip shares, for the "How chips work" sheet.
export function chipRules() {
  return [
    { title: t('One per map'), text: t('Drop one chip on one lane before you lock in. It stays there through the rotate.') },
    { title: t('It multiplies'), text: t('Your lane total, after combos, times the chip: ×1.5 to ×3. Rare chips do something extra instead.') },
    { title: t('Who is on the lane'), text: t('The chip reads only the players on its lane. Rotate them away and the bonus goes too.') },
    { title: t('Win it back'), text: t('Win the map and the chip comes back. Lose it and the chip is gone. Your IGL tops you up to two.') },
  ];
}

export function chipTips() {
  return [
    t('Play it on the lane you could win or lose, not the one you win anyway.'),
    t('Build the lane for the chip: pair chips want both roles together.'),
    t('Skill chips need trained skills. Train Flick, Flex or Mastermind to unlock them.'),
    t('Lock the Map answers their chip; No Respect answers their star.'),
    t('A bench player with the missing role can be worth a whole chip.'),
  ];
}

/** The plan line for a real squad: what the chip pays and who has to share its lane. */
export function planLine(plan) {
  if (plan.kind === 'disrespect') {
    return plan.flick
      ? t('Their best there scores 0, and ×1.5 with {names} on its lane.', { names: plan.cards[0].player })
      : t('Their best player on its lane scores 0.');
  }
  if (plan.kind === 'cancel') return t('Cancels their chip from any lane.');
  if (plan.anyLane) return plan.special === 'chain' ? t('×{mult} on any lane, plus the chain.', { mult: plan.mult }) : t('×{mult} on any lane.', { mult: plan.mult });
  if (!plan.fits) return t('Only ×1.5 for your five right now.');
  const names = plan.cards.map(card => card.player).join(' + ');
  return plan.cards.length === 1
    ? t('Up to ×{mult} for you: {names} on its lane.', { mult: plan.mult, names })
    : t('Up to ×{mult} for you: {names} on one lane.', { mult: plan.mult, names });
}
