// The run's news feed.
//
// Items are stored STRUCTURED - a kind plus ids - and formatted at render
// time. Storing sentences would bloat the save and would freeze the copy: a
// wording change would need a save migration to avoid a run showing a mix of
// old and new phrasing.
//
// This is the surface for the "legible after it happens" rule: development,
// bonds, transfers and ladder movement are all invisible while they happen,
// and every one of them lands here afterwards, named and attributable.

import { t } from '../../lib/i18n.js';

export const FEED_CAP = 40;

/** Append items, newest first, bounded so a long run cannot grow the save. */
export function pushNews(feed, items, { year, event }) {
  const stamped = items.map(item => ({ ...item, y: year, t: event }));
  return [...stamped, ...(feed ?? [])].slice(0, FEED_CAP);
}

/**
 * Turn a stored item into display text. Kept here rather than in the
 * component so the vocabulary has one home and stays consistent.
 */
export function describeNews(item) {
  const { player, player2, orgName: org, tierLabel, n } = item;
  switch (item.kind) {
    case 'signing':
      return { title: t('{org} sign {player}', { org, player }), note: t('Off the market') };
    case 'poach':
      return { title: t('{org} want {player}', { org, player }), note: t('Approach made') };
    case 'departure':
      return { title: t('{player} leaves for {org}', { player, org }), note: t('Transfer complete') };
    case 'held':
      return { title: t('{player} stays', { player }), note: t('{org} turned away', { org }) };
    case 'signed':
      return { title: t('{player} signs for you', { player }), note: t('Transfer complete') };
    case 'prospect':
      return { title: t('{player} joins from the academy', { player }), note: t('Youth signing') };
    case 'promote':
      return { title: t('Promoted to {tier}', { tier: t(tierLabel) }), note: t('Circuit') };
    case 'relegate':
      return { title: t('Relegated to {tier}', { tier: t(tierLabel) }), note: t('Circuit') };
    case 'legend':
      return { title: t('{player} is a club legend', { player }), note: t('No longer declines') };
    case 'bond':
      return { title: t('{player} and {other} are clicking', { player, other: player2 }), note: t('Chemistry') };
    case 'growth':
      return { title: t('{player} is improving', { player }), note: `+${n}` };
    case 'decline':
      return { title: t('{player} is slipping', { player }), note: `${n}` };
    default:
      return { title: item.title ?? t('Update'), note: '' };
  }
}

/** A transfer is the only kind that should render a portrait in a new kit. */
export function newsKit(item) {
  return item.kind === 'signing' || item.kind === 'departure' ? item.orgId : null;
}
