import { packValue } from '../../club/economy.js';
import { t } from '../../../lib/i18n.js';
import { castSquadRoles } from '../storyMemory.js';

export const financialCrisisStoryline = {
  id: 'crisis_financial_2026',
  version: 1,
  canTrigger: (club, memory) => Boolean(
    club && memory
    && !memory.completedPacks?.includes('crisis_financial_2026')
    && club.year >= 2
    && club.phase === 'league'
    && club.week >= 1,
  ),
  cast: (club, cards) => {
    const { talisman, topRival } = castSquadRoles(club, cards);
    const debt = Math.max(3, Math.round(packValue(club) * 0.5), club.tier + 2);
    return { talisman, rival: topRival, debt };
  },
  buildScene: (club, cards) => {
    const { talisman, rival, debt } = financialCrisisStoryline.cast(club, cards);
    const rivalName = rival?.name ?? club.name;
    const packsReward = Math.max(3, debt);
    const text = t('Our primary title sponsor went bankrupt overnight. The board needs liquid capital before the split ends, and {rival} just tabled an emergency buyout for {player}.', {
      rival: rivalName,
      player: talisman.player,
    });
    return {
      id: 'crisis_financial_2026',
      packId: 'crisis_financial_2026',
      kind: 'dialogue',
      venue: 'office',
      pose: 'command',
      kicker: t('Crisis directive'),
      title: t('Title sponsor collapse'),
      speaker: talisman.player,
      cardId: talisman.id,
      rivalId: rival?.id,
      text,
      // Illustrated reel: rendered scenes in public/assets/story, cast by role, captions carry the names.
      reel: [
        { art: 'arena', cam: 'push', speaker: t('02:14'), line: t('The sign over the arena went dark at 2 a.m. The title sponsor filed before sunrise.') },
        { art: 'board', cam: 'pan', speaker: t('Board'), line: t('Three weeks of capital left. Something on this roster gets sold, or the doors close.') },
        { art: 'corridor', cam: 'rise', speaker: rivalName, line: t('"Starting role for {player}, double the salary. Your manager already knows we are here."', { player: talisman.player }) },
      ],
      lines: [
        { side: 'them', speaker: talisman.player, text },
        { side: 'you', speaker: t('You'), text: t('We are not letting a sponsor default tear this club apart.') },
      ],
      choices: [
        {
          label: t('Accept buyout from {rival}', { rival: rivalName }),
          art: 'sell',
          detail: t('{rival} pays now. The doors stay open, and {player} wears their colours the next time you meet.', { rival: rivalName, player: talisman.player }),
          reply: t('Take the buyout from {rival}. That capital keeps the doors open for the rest of the squad.', { rival: rivalName }),
          outcome: t('+{n} silver packs', { n: packsReward }),
          cost: t('{player} leaves for {org}', { player: talisman.player, org: rivalName }),
          effects: {
            transferOut: {
              cardId: talisman.id,
              rivalId: rival?.id,
              packsGained: packsReward,
            },
            trust: -10,
            pressure: 10,
          },
        },
        {
          label: t('Cut facility and analyst overhead'),
          art: 'cut',
          detail: t('Nobody leaves the roster. The squad grinds the split with no staff behind them.'),
          reply: t('Nobody leaves the roster. Cut the facility budget and we grind through the split ourselves.'),
          outcome: t('+10 trust'),
          cost: t('+15 fatigue to starters'),
          effects: {
            fatigueDelta: 15,
            pressure: 10,
            trust: 10,
          },
        },
        {
          label: t('Rally fanbase for indie sponsor'),
          art: 'crowd',
          detail: t('Take it to the fans and sign an independent jersey partner before roster lock.'),
          reply: t('Take it to our supporters and sign an independent jersey partner before lock.'),
          outcome: t('+15 trust'),
          cost: club.reputation >= 40 ? t('-40 reputation') : t('+20 pressure'),
          effects: club.reputation >= 40
            ? { reputation: -40, trust: 15 }
            : { pressure: 20, trust: 15 },
        },
      ],
    };
  },
};
