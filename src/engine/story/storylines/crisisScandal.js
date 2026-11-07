import { t } from '../../../lib/i18n.js';
import { castSquadRoles } from '../storyMemory.js';

export const scandalCrisisStoryline = {
  id: 'crisis_scandal_2026',
  version: 1,
  canTrigger: (club, memory) => Boolean(
    club && memory
    && !memory.completedPacks?.includes('crisis_scandal_2026')
    && club.year >= 1
    && club.phase === 'league'
    && club.week >= 3,
  ),
  cast: (club, cards) => {
    const { igl, topRival } = castSquadRoles(club, cards);
    return { igl, rival: topRival };
  },
  buildScene: (club, cards) => {
    const { igl, rival } = scandalCrisisStoryline.cast(club, cards);
    const rivalName = rival?.name ?? club.name;
    const text = t('Our practice server recordings from this week surfaced online. {rival} has every pistol round set we drilled for the playoff push.', {
      rival: rivalName,
    });
    return {
      id: 'crisis_scandal_2026',
      packId: 'crisis_scandal_2026',
      kind: 'dialogue',
      venue: 'locker',
      pose: 'focus',
      kicker: t('Crisis directive'),
      title: t('Leaked scrimmage VODs'),
      speaker: igl.player,
      cardId: igl.id,
      rivalId: rival?.id,
      text,
      lines: [
        { side: 'them', speaker: igl.player, text },
        { side: 'you', speaker: t('You'), text: t('If they study yesterday, we beat them with tomorrow.') },
      ],
      choices: [
        {
          label: t('Scrap the playbook and drill new setups'),
          reply: t('Burn the old setups tonight. We walk onto stage with a brand-new pistol book.'),
          outcome: t('+1 training tape'),
          cost: t('+15 fatigue to starters'),
          effects: {
            tape: 'positioning',
            fatigueDelta: 15,
            pressure: 5,
          },
        },
        {
          label: t('Call out the leak publicly'),
          reply: t('Put the league on notice. Let everyone know {rival} needs leaked tapes to compete.', { rival: rivalName }),
          outcome: t('+30 reputation'),
          cost: t('+15 pressure'),
          effects: {
            reputation: 30,
            pressure: 15,
            trust: -5,
          },
        },
        {
          label: t('Tighten circle and trust the five'),
          reply: t('Lock the practice room doors. They can watch our setups, but they still cannot win our duels.'),
          outcome: t('+15 trust'),
          cost: t('-20 reputation'),
          effects: {
            trust: 15,
            allXp: 60,
            reputation: -20,
          },
        },
      ],
    };
  },
};
