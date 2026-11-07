import { t } from '../../../lib/i18n.js';
import { castSquadRoles } from '../storyMemory.js';

export const invitationalTourStoryline = {
  id: 'tour_invitational_2026',
  version: 1,
  canTrigger: (club, memory) => Boolean(
    club && memory
    && !memory.completedPacks?.includes('tour_invitational_2026')
    && club.seriesWon >= 2
    && club.phase === 'league'
    && club.week >= 2,
  ),
  cast: (club, cards) => {
    const { talisman, rookie } = castSquadRoles(club, cards);
    return { talisman, rookie };
  },
  buildScene: (club, cards) => {
    const { talisman, rookie } = invitationalTourStoryline.cast(club, cards);
    const text = t('Tournament organizers invited {club} to headline a prime-time charity showmatch before the next league week.', {
      club: club.name,
    });
    return {
      id: 'tour_invitational_2026',
      packId: 'tour_invitational_2026',
      kind: 'dialogue',
      venue: 'press',
      pose: 'calm',
      kicker: t('Broadcast invite'),
      title: t('Mid-season showmatch'),
      speaker: talisman.player,
      cardId: talisman.id,
      text,
      lines: [
        { side: 'them', speaker: talisman.player, text },
        { side: 'you', speaker: t('You'), text: t('Prime-time cameras mean extra eyes on the badge.') },
      ],
      choices: [
        {
          label: t('Send the starting five for the prize purse'),
          reply: t('Full starting five on stage. We play to win the purse.'),
          outcome: t('+2 silver packs'),
          cost: t('+15 fatigue to starters'),
          effects: {
            packs: 2,
            fatigueDelta: 15,
          },
        },
        {
          label: t('Feature {player} in the spotlight', { player: rookie.player }),
          reply: t('Put {player} in the lead role under the arena lights.', { player: rookie.player }),
          outcome: t('+150 XP to {player}', { player: rookie.player }),
          cost: t('+15 pressure'),
          effects: {
            cardXp: { [rookie.id]: 150 },
            reputation: 20,
            pressure: 15,
          },
        },
        {
          label: t('Decline to rest for league play'),
          reply: t('Pass on the invite. Our focus stays on the league table.'),
          outcome: t('-15 fatigue'),
          cost: t('-20 reputation'),
          effects: {
            fatigueDelta: -15,
            trust: 10,
            reputation: -20,
          },
        },
      ],
    };
  },
};
