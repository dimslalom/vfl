import { t } from '../../../lib/i18n.js';
import { castSquadRoles } from '../storyMemory.js';

// Rendered art for each milestone frame (public/assets/story/<art>.webp), in frame order.
const MILESTONE_ART = {
  cutscene_opening: [['cafe', 'push'], ['locker', 'rise'], ['walk', 'push']],
  cutscene_act2: [['stage', 'pan'], ['press', 'push'], ['board', 'rise']],
  cutscene_act3: [['walk', 'push'], ['crowd', 'pan'], ['trophy', 'rise']],
  cutscene_champion: [['lift', 'rise'], ['press', 'push']],
  cutscene_relegation: [['empty', 'push'], ['locker', 'pan']],
  cutscene_dynasty: [['board', 'pan'], ['stage', 'push']],
};

/** Milestone cutscene as an illustrated reel: each frame's title is the label, its body the subtitle. */
export function buildMilestoneCutscene(id, state, cards) {
  const scene = buildMilestoneFrames(id, state, cards);
  const art = MILESTONE_ART[id];
  if (!scene || !art) return scene;
  return {
    ...scene,
    title: scene.frames[0]?.kicker,
    reel: scene.frames.map((frame, i) => ({ art: art[i]?.[0] ?? art[0][0], cam: art[i]?.[1] ?? 'push', speaker: frame.title, line: frame.body })),
  };
}

function buildMilestoneFrames(id, state, cards) {
  const roles = castSquadRoles(state, cards);
  const player = roles.talisman?.player ?? roles.igl?.player ?? state.name;
  const igl = roles.igl?.player ?? player;
  const rival = roles.nextRival?.name ?? roles.topRival?.name ?? state.name;
  const club = state.name;

  switch (id) {
    case 'cutscene_opening':
      return {
        id,
        kind: 'cutscene',
        venue: 'cafe',
        frames: [
          {
            venue: 'cafe',
            pose: 'focus',
            side: 'you',
            speaker: t('You'),
            kicker: t('Act I'),
            title: t('The Net Cafe'),
            body: t('Five folding chairs under a flickering neon sign. Nobody in Challengers knows your club name yet.'),
          },
          {
            venue: 'locker',
            pose: 'command',
            side: 'them',
            speaker: igl,
            cardId: roles.igl?.id,
            kicker: t('The Roster'),
            title: t('Unproven Five'),
            body: t('{player} leads the comms check. Five contracts signed on borrowed time.', { player }),
          },
          {
            venue: 'tunnel',
            pose: 'command',
            side: 'both',
            speaker: t('You'),
            kicker: t('First Blood'),
            title: t('Prove Belonging'),
            body: t('{rival} waits in Week 1. Win the room, survive the split, and climb.', { rival }),
          },
        ],
      };
    case 'cutscene_act2':
      return {
        id,
        kind: 'cutscene',
        venue: 'stage',
        frames: [
          {
            venue: 'stage',
            pose: 'focus',
            side: 'you',
            speaker: t('You'),
            kicker: t('Act II'),
            title: t('The Meat Grinder'),
            body: t('Studio lights replace the basement monitor glow. Broadcast cameras track every timeout.'),
          },
          {
            venue: 'press',
            pose: 'calm',
            side: 'them',
            speaker: player,
            cardId: roles.talisman?.id,
            kicker: t('The Vultures'),
            title: t('Scouts in the Stands'),
            body: t('Top-flight directors are watching {player}. Success brings buyers.', { player }),
          },
          {
            venue: 'office',
            pose: 'command',
            side: 'both',
            speaker: t('You'),
            kicker: t('New Stakes'),
            title: t('Hold the Line'),
            body: t('Protect your core or cash in to rebuild stronger.'),
          },
        ],
      };
    case 'cutscene_act3':
      return {
        id,
        kind: 'cutscene',
        venue: 'tunnel',
        frames: [
          {
            venue: 'tunnel',
            pose: 'focus',
            side: 'you',
            speaker: t('You'),
            kicker: t('Act III'),
            title: t('The World Stage'),
            body: t('Ten thousand voices shake the arena floor. The tunnel opens onto the main stage.'),
          },
          {
            venue: 'stage',
            pose: 'command',
            side: 'them',
            speaker: igl,
            cardId: roles.igl?.id,
            kicker: t('Old Ghosts'),
            title: t('Familiar Faces'),
            body: t('Every trade, every loss, and every rival lead to this bracket.'),
          },
          {
            venue: 'trophy',
            pose: 'celebrate',
            side: 'both',
            speaker: t('You'),
            kicker: t('Final Act'),
            title: t('One Trophy'),
            body: t('Finish the climb.'),
          },
        ],
      };
    case 'cutscene_champion':
      return {
        id,
        kind: 'cutscene',
        venue: 'trophy',
        frames: [
          {
            venue: 'trophy',
            pose: 'celebrate',
            side: 'both',
            speaker: player,
            cardId: roles.talisman?.id,
            kicker: t('Champions'),
            title: t('Silverware'),
            body: t('{player} lifts the trophy as gold confetti rains across the stage.', { player }),
          },
          {
            venue: 'press',
            pose: 'celebrate',
            side: 'you',
            speaker: t('You'),
            kicker: t('Legacy'),
            title: t('Written in Ink'),
            body: t('{club} stands at the top of the table.', { club }),
          },
        ],
      };
    case 'cutscene_relegation':
      return {
        id,
        kind: 'cutscene',
        venue: 'locker',
        frames: [
          {
            venue: 'stage',
            pose: 'calm',
            side: 'them',
            speaker: player,
            cardId: roles.talisman?.id,
            kicker: t('Relegated'),
            title: t('Long Walk Back'),
            body: t('Monitors power down across an empty stage. {player} packs their keyboard in silence.', { player }),
          },
          {
            venue: 'locker',
            pose: 'command',
            side: 'you',
            speaker: t('You'),
            kicker: t('Redemption'),
            title: t('Not Finished'),
            body: t('The drop hurts, but the doors stay open. Next year starts the climb back.'),
          },
        ],
      };
    case 'cutscene_dynasty':
      return {
        id,
        kind: 'cutscene',
        venue: 'stage',
        frames: [
          {
            venue: 'office',
            pose: 'focus',
            side: 'you',
            speaker: t('You'),
            kicker: t('New Era'),
            title: t('The Living Dynasty'),
            body: t('Founding chapters close, but the league never sleeps. New rookies and old rivals line up.'),
          },
          {
            venue: 'stage',
            pose: 'command',
            side: 'both',
            speaker: igl,
            cardId: roles.igl?.id,
            kicker: t('Unending'),
            title: t('Defend the Crest'),
            body: t('{club} enters a new era.', { club }),
          },
        ],
      };
    default:
      return null;
  }
}

/** Declarative storylet deck for Acts I to III and the unending Dynasty Eras. */
export const ORIGIN_STORYLETS = [
  // Act I opening locker room briefing
  {
    id: 'act1_week1_briefing',
    trigger: 'pre_match',
    once: true,
    when: (state) => state.year === 1 && state.week === 0 && state.phase === 'league',
    build: (state, cards) => {
      const { igl, nextRival } = castSquadRoles(state, cards);
      const rival = nextRival?.name ?? state.name;
      const text = t('{rival} thinks we are a free win in Week 1. How do you want us playing this series?', { rival });
      return {
        id: 'act1_week1_briefing',
        kind: 'dialogue',
        venue: 'locker',
        pose: 'command',
        kicker: t('Locker room'),
        title: t('Opening week'),
        speaker: igl.player,
        cardId: igl.id,
        rivalId: nextRival?.id,
        text,
        lines: [
          { side: 'you', speaker: t('You'), text: t('Settle in. First series of the split starts in ten minutes.') },
          { side: 'them', speaker: igl.player, text },
        ],
        choices: [
          {
            label: t('Play disciplined defaults'),
            reply: t('Stick to our defaults. Trade every lane and force them into late rounds.'),
            outcome: t('+10 trust'),
            cost: t('-15 reputation'),
            effects: { trust: 10, allXp: 50, reputation: -15 },
          },
          {
            label: t('Take every opening duel'),
            reply: t('Take the first fight on every site. Show them we are not backing down.'),
            outcome: t('+100 XP to {player}', { player: igl.player }),
            cost: t('+12 fatigue to starters'),
            effects: { pressure: 10, fatigueDelta: 12, cardXp: { [igl.id]: 100 } },
          },
          {
            label: t('Call them out on broadcast'),
            reply: t('Tell the desk we are taking their spot in the standings today.'),
            outcome: t('+25 reputation'),
            cost: t('+15 pressure'),
            effects: { reputation: 25, pressure: 15, trust: -5 },
          },
        ],
      };
    },
  },

  // Ex-player grudge match in the walkout tunnel
  {
    id: 'ex_player_grudge',
    trigger: 'pre_match',
    once: false,
    when: (state, cards) => {
      const { nextNemesis } = castSquadRoles(state, cards);
      return Boolean(nextNemesis);
    },
    build: (state, cards) => {
      const { nextNemesis, nextRival, talisman } = castSquadRoles(state, cards);
      const targetNemesis = nextNemesis ?? talisman;
      const rival = nextRival?.name ?? targetNemesis.orgName ?? state.name;
      const text = t('You let me go to {rival}, coach. Watch what happens on the server today.', { rival });
      return {
        id: `ex_player_grudge_${state.year}_${state.week}_${targetNemesis.id}`,
        kind: 'dialogue',
        venue: 'tunnel',
        pose: 'focus',
        kicker: t('Walkout tunnel'),
        title: t('Old teammate'),
        speaker: targetNemesis.player,
        cardId: targetNemesis.id,
        rivalId: nextRival?.id,
        text,
        lines: [
          { side: 'them', speaker: targetNemesis.player, text },
          { side: 'you', speaker: t('You'), text: t('We know every tendency in your playbook.') },
        ],
        choices: [
          {
            label: t('Lock down their lane'),
            reply: t('{player} is matching your lane every round. Good luck finding space.', { player: talisman.player }),
            outcome: t('+100 XP to {player}', { player: talisman.player }),
            cost: t('+12 fatigue to starters'),
            effects: { cardXp: { [talisman.id]: 100 }, fatigueDelta: 12, pressure: 10 },
          },
          {
            label: t('Keep it business'),
            reply: t('Nothing personal. It is just another series on the schedule.'),
            outcome: t('+10 trust'),
            cost: t('-15 reputation'),
            effects: { trust: 10, reputation: -15 },
          },
          {
            label: t('Remind them who built them'),
            reply: t('You learned those setups in our practice room. Do not forget it.'),
            outcome: t('+30 reputation'),
            cost: t('+15 pressure'),
            effects: { reputation: 30, pressure: 15, trust: -5 },
          },
        ],
      };
    },
  },

  // Bogey team pre-match tension
  {
    id: 'bogey_team_briefing',
    trigger: 'pre_match',
    once: false,
    when: (state, cards) => {
      const { nextRival } = castSquadRoles(state, cards);
      if (!nextRival) return false;
      const rec = state.story?.rivalries?.[nextRival.id];
      return Boolean(rec && rec.streak <= -2);
    },
    build: (state, cards) => {
      const { talisman, nextRival } = castSquadRoles(state, cards);
      const text = t('{rival} has our number. The squad is second-guessing every call before we even load in.', { rival: nextRival.name });
      return {
        id: `bogey_team_${state.year}_${state.week}_${nextRival.id}`,
        kind: 'dialogue',
        venue: 'locker',
        pose: 'focus',
        kicker: t('Tactical room'),
        title: t('Rivalry block'),
        speaker: talisman.player,
        cardId: talisman.id,
        rivalId: nextRival.id,
        text,
        lines: [
          { side: 'them', speaker: talisman.player, text },
          { side: 'you', speaker: t('You'), text: t('The streak ends today if we change how we prepare.') },
        ],
        choices: [
          {
            label: t('Run a fresh training session'),
            reply: t('We are running new lane drills right now. Give them a look they have never seen.'),
            outcome: t('+1 training tape'),
            cost: t('+15 fatigue to starters'),
            effects: { tape: 'aim', fatigueDelta: 15, pressure: 5 },
          },
          {
            label: t('Clear the schedule to rest'),
            reply: t('Shut the monitors off early. Come in tomorrow with clear heads.'),
            outcome: t('-15 fatigue'),
            cost: t('-20 reputation'),
            effects: { fatigueDelta: -15, trust: 10, reputation: -20 },
          },
        ],
      };
    },
  },

  // Benched player ultimatum
  {
    id: 'benched_veteran_ultimatum',
    trigger: 'pre_match',
    once: true,
    when: (state, cards) => {
      const { benched } = castSquadRoles(state, cards);
      if (!benched) return false;
      const idle = state.dev?.[benched.id]?.idle ?? 0;
      return idle >= 2 || (state.week >= 2 && benched.rating >= 75);
    },
    build: (state, cards) => {
      const { benched, starters, topRival } = castSquadRoles(state, cards);
      const target = benched ?? starters[starters.length - 1] ?? starters[0];
      const displaced = starters[starters.length - 1] ?? starters[0];
      const rival = topRival?.name ?? state.name;
      const text = t('I did not sign with {club} to watch from the booth. Put me in the starting five or let me move on.', { club: state.name });
      return {
        id: 'benched_veteran_ultimatum',
        kind: 'dialogue',
        venue: 'office',
        pose: 'calm',
        kicker: t('Coach office'),
        title: t('Bench friction'),
        speaker: target.player,
        cardId: target.id,
        rivalId: topRival?.id,
        text,
        lines: [
          { side: 'them', speaker: target.player, text },
          { side: 'you', speaker: t('You'), text: t('Every spot on this stage is earned in practice.') },
        ],
        choices: [
          {
            label: t('Promote to starting five'),
            reply: t('You are in the starting lineup this week. Prove you belong there.'),
            outcome: t('Swaps into starting five'),
            cost: t('-15 trust, +10 fatigue to starters'),
            effects: { promoteCardId: target.id, trust: -15, pressure: 10, fatigueDelta: 10, statBoost: displaced ? { id: displaced.id, stat: 'mentality', amount: -1 } : null },
          },
          {
            label: t('Ask for patience'),
            reply: t('Stay sharp in scrims. Your number will be called when the matchup fits.'),
            outcome: t('+80 XP to starters'),
            cost: t('-1 mentality to {player}, -10 trust', { player: target.player }),
            effects: { allXp: 80, trust: -10, statBoost: { id: target.id, stat: 'mentality', amount: -1 } },
          },
          {
            label: t('Accept buyout from {rival}', { rival }),
            reply: t('If you do not want to fight for the spot, we will take {rival} up on their buyout.', { rival }),
            outcome: t('+{n} silver packs', { n: 2 }),
            cost: t('{player} leaves for {org}', { player: target.player, org: rival }),
            effects: {
              transferOut: {
                cardId: target.id,
                rivalId: topRival?.id,
                packsGained: 2,
              },
              pressure: 10,
            },
          },
        ],
      };
    },
  },

  // Act II scouts inquiry
  {
    id: 'act2_scouts_inquiry',
    trigger: 'pre_match',
    once: true,
    when: (state) => state.story?.act === 2 && state.week >= 2 && state.phase === 'league',
    build: (state, cards) => {
      const { talisman } = castSquadRoles(state, cards);
      const text = t('Orgs from the top flight asked my agent about my buyout. Are we really building a contender here?');
      return {
        id: 'act2_scouts_inquiry',
        kind: 'dialogue',
        venue: 'office',
        pose: 'focus',
        kicker: t('Agent call'),
        title: t('Buyout rumors'),
        speaker: talisman.player,
        cardId: talisman.id,
        text,
        lines: [
          { side: 'them', speaker: talisman.player, text },
          { side: 'you', speaker: t('You'), text: t('You are the centerpiece of everything we are building.') },
        ],
        choices: [
          {
            label: t('Promise a championship push'),
            reply: t('We are going all the way to Champions together. Nobody is buying you out.'),
            outcome: t('+15 trust'),
            cost: t('+20 pressure'),
            effects: { trust: 15, pressure: 20 },
          },
          {
            label: t('Focus on this week'),
            reply: t('Let your agent talk. Win this split first and the whole league will answer to us.'),
            outcome: t('+100 XP to {player}', { player: talisman.player }),
            cost: t('-15 trust'),
            effects: { cardXp: { [talisman.id]: 100 }, trust: -15 },
          },
        ],
      };
    },
  },

  // Act III final stage focus
  {
    id: 'act3_stage_nerves',
    trigger: 'pre_match',
    once: true,
    when: (state) => state.story?.act === 3 && state.week >= 1 && state.phase === 'league',
    build: (state, cards) => {
      const { rookie, igl } = castSquadRoles(state, cards);
      const target = rookie ?? igl;
      const text = t('The crowd noise comes right through the headsets. Every mistake feels ten times bigger up here.');
      return {
        id: 'act3_stage_nerves',
        kind: 'dialogue',
        venue: 'stage',
        pose: 'calm',
        kicker: t('Main stage'),
        title: t('Bright lights'),
        speaker: target.player,
        cardId: target.id,
        text,
        lines: [
          { side: 'them', speaker: target.player, text },
          { side: 'you', speaker: t('You'), text: t('Look at our booth, not the stands.') },
        ],
        choices: [
          {
            label: t('Trust your preparation'),
            reply: t('Breathe and play your game. It is the same map we run every day.'),
            outcome: t('-15 fatigue'),
            cost: t('-15 reputation'),
            effects: { trust: 10, fatigueDelta: -15, reputation: -15 },
          },
          {
            label: t('Turn the pressure into fuel'),
            reply: t('Let them roar. Make the arena remember your name.'),
            outcome: t('+120 XP to {player}', { player: target.player }),
            cost: t('+15 fatigue to starters'),
            effects: { cardXp: { [target.id]: 120 }, fatigueDelta: 15, pressure: 10 },
          },
        ],
      };
    },
  },

  // Dynasty Era opening beat (Year 4+)
  {
    id: 'era_dynasty_target',
    trigger: 'pre_match',
    once: false,
    when: (state) => state.year >= 4 && state.week === 0 && state.story?.era === 'dynasty',
    build: (state, cards) => {
      const { talisman } = castSquadRoles(state, cards);
      const text = t('Every team in the league spent the off-season studying our demos. Nobody gives us an inch anymore.');
      return {
        id: `era_dynasty_target_${state.year}`,
        kind: 'dialogue',
        venue: 'press',
        pose: 'command',
        kicker: t('Dynasty era'),
        title: t('Target on your back'),
        speaker: talisman.player,
        cardId: talisman.id,
        text,
        lines: [
          { side: 'them', speaker: talisman.player, text },
          { side: 'you', speaker: t('You'), text: t('Defending the crown is harder than winning it.') },
        ],
        choices: [
          {
            label: t('Innovate the playbook'),
            reply: t('Then we rewrite the meta before Week 1 starts.'),
            outcome: t('+1 training tape'),
            cost: t('+15 fatigue to starters'),
            effects: { tape: 'ability', fatigueDelta: 15, pressure: 10 },
          },
          {
            label: t('Lean on championship poise'),
            reply: t('They can study our setups, but they cannot match our composure in round three.'),
            outcome: t('+15 trust'),
            cost: t('-20 reputation'),
            effects: { trust: 15, reputation: -20 },
          },
        ],
      };
    },
  },

  // Rebuild Era opening beat (Year 4+)
  {
    id: 'era_rebuild_torch',
    trigger: 'pre_match',
    once: false,
    when: (state) => state.year >= 4 && state.week === 0 && state.story?.era === 'rebuild',
    build: (state, cards) => {
      const { veteran, rookie } = castSquadRoles(state, cards);
      const text = t('The legs are heavier this year, coach. Let me mentor {player} so the standard stays high.', { player: rookie.player });
      return {
        id: `era_rebuild_torch_${state.year}`,
        kind: 'dialogue',
        venue: 'locker',
        pose: 'calm',
        kicker: t('Rebuild era'),
        title: t('Passing the torch'),
        speaker: veteran.player,
        cardId: veteran.id,
        text,
        lines: [
          { side: 'them', speaker: veteran.player, text },
          { side: 'you', speaker: t('You'), text: t('A dynasty survives when the next generation steps up.') },
        ],
        choices: [
          {
            label: t('Pair them in scrims'),
            reply: t('Run every two-man drill with {player}. Pass on everything you know.', { player: rookie.player }),
            outcome: t('+150 XP to {player}', { player: rookie.player }),
            cost: t('-15 reputation'),
            effects: { cardXp: { [rookie.id]: 150 }, trust: 10, reputation: -15 },
          },
          {
            label: t('Push the veterans one more split'),
            reply: t('We still need your fire on stage. Lead from the front one more season.'),
            outcome: t('+80 XP to starters'),
            cost: t('+15 fatigue to starters'),
            effects: { allXp: 80, fatigueDelta: 15, pressure: 10 },
          },
        ],
      };
    },
  },

  // Nemesis Era opening beat (Year 4+)
  {
    id: 'era_nemesis_clash',
    trigger: 'pre_match',
    once: false,
    when: (state) => state.year >= 4 && state.week === 0 && state.story?.era === 'nemesis',
    build: (state, cards) => {
      const { igl, nemesis, topRival } = castSquadRoles(state, cards);
      const rival = nemesis?.orgName ?? topRival?.name ?? state.name;
      const text = t('Seeing our old teammate in {rival} colours lit a fire in practice. This split is about settling the score.', { rival });
      return {
        id: `era_nemesis_clash_${state.year}`,
        kind: 'dialogue',
        venue: 'tunnel',
        pose: 'command',
        kicker: t('Nemesis era'),
        title: t('Unfinished business'),
        speaker: igl.player,
        cardId: igl.id,
        text,
        lines: [
          { side: 'them', speaker: igl.player, text },
          { side: 'you', speaker: t('You'), text: t('Circle their fixture on the calendar.') },
        ],
        choices: [
          {
            label: t('Channel the anger into prep'),
            reply: t('Double the anti-strat prep. We take every lane when we meet them.'),
            outcome: t('+80 XP to starters'),
            cost: t('+15 fatigue to starters'),
            effects: { allXp: 80, fatigueDelta: 15, pressure: 10 },
          },
          {
            label: t('Stay ice cold'),
            reply: t('Do not play emotional. Beat them with clean discipline.'),
            outcome: t('-15 fatigue'),
            cost: t('-15 reputation'),
            effects: { trust: 10, fatigueDelta: -15, reputation: -15 },
          },
        ],
      };
    },
  },

  // Redemption Era opening beat (Year 4+)
  {
    id: 'era_redemption_vow',
    trigger: 'pre_match',
    once: false,
    when: (state) => state.year >= 4 && state.week === 0 && state.story?.era === 'redemption',
    build: (state, cards) => {
      const { igl } = castSquadRoles(state, cards);
      const text = t('Critics wrote {club} off after last year. Promotion back up is the only answer.', { club: state.name });
      return {
        id: `era_redemption_vow_${state.year}`,
        kind: 'dialogue',
        venue: 'locker',
        pose: 'command',
        kicker: t('Redemption era'),
        title: t('Climb back'),
        speaker: igl.player,
        cardId: igl.id,
        text,
        lines: [
          { side: 'them', speaker: igl.player, text },
          { side: 'you', speaker: t('You'), text: t('Let them talk. Our climb starts in Week 1.') },
        ],
        choices: [
          {
            label: t('Promise the fans a bounce-back'),
            reply: t('Tell our supporters we will be back in the top flight by year end.'),
            outcome: t('+30 reputation'),
            cost: t('+20 pressure'),
            effects: { reputation: 30, pressure: 20, trust: -5 },
          },
          {
            label: t('Close the doors and grind'),
            reply: t('Block out the noise. Only the work in this room matters.'),
            outcome: t('+80 XP to starters'),
            cost: t('+15 fatigue to starters'),
            effects: { allXp: 80, fatigueDelta: 15, reputation: -10 },
          },
        ],
      };
    },
  },

  // Post-match: Evo breakthrough
  {
    id: 'post_evo_breakthrough',
    trigger: 'post_match',
    once: true,
    when: (state) => Boolean(state.last?.evoProgress?.completed),
    build: (state, cards) => {
      const { squad, talisman } = castSquadRoles(state, cards);
      const evolved = squad.find(c => c.id === state.last?.evoProgress?.cardId) ?? talisman;
      const text = t('Everything clicked on stage today. All those hours on the practice server paid off.');
      return {
        id: 'post_evo_breakthrough',
        kind: 'dialogue',
        venue: 'press',
        pose: 'celebrate',
        kicker: t('Broadcast desk'),
        title: t('Breakthrough'),
        speaker: evolved.player,
        cardId: evolved.id,
        text,
        lines: [
          { side: 'them', speaker: evolved.player, text },
          { side: 'you', speaker: t('You'), text: t('You earned that evolution under stage lights.') },
        ],
        choices: [
          {
            label: t('Build the playbook around them'),
            reply: t('From here on out, our key rounds run through your lane.'),
            outcome: t('+35 reputation'),
            cost: t('-15 trust'),
            effects: { reputation: 35, trust: -15, pressure: 10 },
          },
          {
            label: t('Keep them hungry'),
            reply: t('Enjoy the win tonight. Tomorrow we push your ceiling even higher.'),
            outcome: t('+100 XP to {player}', { player: evolved.player }),
            cost: t('+12 fatigue to starters'),
            effects: { cardXp: { [evolved.id]: 100 }, fatigueDelta: 12 },
          },
        ],
      };
    },
  },

  // Post-match: Beat ex-player nemesis
  {
    id: 'post_nemesis_win',
    trigger: 'post_match',
    once: false,
    when: (state, cards) => {
      if (!state.last?.won) return false;
      const { lastNemesis } = castSquadRoles(state, cards);
      return Boolean(lastNemesis);
    },
    build: (state, cards) => {
      const { talisman, lastNemesis, lastRival } = castSquadRoles(state, cards);
      const targetNemesis = lastNemesis ?? talisman;
      const rival = lastRival?.name ?? targetNemesis.orgName ?? state.name;
      const text = t('We sent {player} and {rival} home quiet. That one felt personal.', { player: targetNemesis.player, rival });
      return {
        id: `post_nemesis_win_${state.year}_${state.week}_${targetNemesis.id}`,
        kind: 'dialogue',
        venue: 'stage',
        pose: 'celebrate',
        kicker: t('Post-match stage'),
        title: t('Score settled'),
        speaker: talisman.player,
        cardId: talisman.id,
        rivalId: lastRival?.id,
        text,
        lines: [
          { side: 'them', speaker: talisman.player, text },
          { side: 'you', speaker: t('You'), text: t('The scoreboard said everything we needed to say.') },
        ],
        choices: [
          {
            label: t('Shake hands and walk off'),
            reply: t('Keep your heads high at the handshake line. Class above everything.'),
            outcome: t('+40 reputation'),
            cost: t('+15 pressure'),
            effects: { reputation: 40, pressure: 15 },
          },
          {
            label: t('Reward the squad'),
            reply: t('Bonus packs for the whole starting five. You owned that stage.'),
            outcome: t('+1 silver pack'),
            cost: t('-20 reputation'),
            effects: { packs: 1, trust: 10, reputation: -20 },
          },
        ],
      };
    },
  },

  // Post-match: Clean sweep win
  {
    id: 'post_sweep_win',
    trigger: 'post_match',
    once: true,
    when: (state) => {
      const rounds = state.last?.rounds ?? [];
      return Boolean(state.last?.won && rounds.length >= 2 && rounds.every(r => r.winA));
    },
    build: (state, cards) => {
      const { talisman, lastRival } = castSquadRoles(state, cards);
      const rival = lastRival?.name ?? state.name;
      const text = t('Clean sweep over {rival}. The broadcast desk is calling us the team to beat this split.', { rival });
      return {
        id: 'post_sweep_win',
        kind: 'dialogue',
        venue: 'press',
        pose: 'celebrate',
        kicker: t('Press conference'),
        title: t('Statement sweep'),
        speaker: talisman.player,
        cardId: talisman.id,
        rivalId: lastRival?.id,
        text,
        lines: [
          { side: 'them', speaker: talisman.player, text },
          { side: 'you', speaker: t('You'), text: t('The mics are live. Here is how we frame the win.') },
        ],
        choices: [
          {
            label: t('Credit the whole unit'),
            reply: t('Every lane did its job today. Five players moving on one string.'),
            outcome: t('+10 trust'),
            cost: t('-15 reputation'),
            effects: { trust: 10, allXp: 40, reputation: -15 },
          },
          {
            label: t('Feed the hype'),
            reply: t('Tell the rest of the division to watch the tape. We are just getting started.'),
            outcome: t('+30 reputation'),
            cost: t('+15 pressure'),
            effects: { reputation: 30, pressure: 15, trust: -5 },
          },
        ],
      };
    },
  },

  // Post-match: Heartbreaker close loss
  {
    id: 'post_close_loss',
    trigger: 'post_match',
    once: true,
    when: (state) => {
      const rounds = state.last?.rounds ?? [];
      const wonCount = rounds.filter(r => r.winA).length;
      return Boolean(state.last && !state.last.won && wonCount >= 1);
    },
    build: (state, cards) => {
      const { igl, lastRival } = castSquadRoles(state, cards);
      const rival = lastRival?.name ?? state.name;
      const text = t('One map away against {rival}. Everyone is staring at the floor. What is the call, coach?', { rival });
      return {
        id: 'post_close_loss',
        kind: 'dialogue',
        venue: 'locker',
        pose: 'focus',
        kicker: t('Locker room'),
        title: t('Hard defeat'),
        speaker: igl.player,
        cardId: igl.id,
        rivalId: lastRival?.id,
        text,
        lines: [
          { side: 'them', speaker: igl.player, text },
          { side: 'you', speaker: t('You'), text: t('Heads up. One narrow decider does not define our season.') },
        ],
        choices: [
          {
            label: t('Break down the VODs tonight'),
            reply: t('Pull up the decider tape while it is fresh. We fix the rotation gaps tonight.'),
            outcome: t('+80 XP to starters'),
            cost: t('+15 fatigue to starters'),
            effects: { allXp: 80, fatigueDelta: 15, pressure: 10 },
          },
          {
            label: t('Back the players publicly'),
            reply: t('I will take the heat at the press desk. Rest up for next week.'),
            outcome: t('-15 fatigue'),
            cost: t('-20 reputation'),
            effects: { trust: 15, fatigueDelta: -15, reputation: -20 },
          },
        ],
      };
    },
  },

  // Review / Transfer window: Poach ultimatum
  {
    id: 'poach_ultimatum',
    trigger: 'review',
    once: false,
    when: (state, cards) => {
      const { expiring, suitor } = castSquadRoles(state, cards);
      return Boolean(state.phase === 'review' && expiring && suitor);
    },
    build: (state, cards) => {
      const { expiring, talisman, suitor, topRival } = castSquadRoles(state, cards);
      const target = expiring ?? talisman;
      const rivalClub = suitor ?? topRival;
      const rivalName = rivalClub?.name ?? state.name;
      const text = t('{rival} reached out with a starting spot for next year. What is our plan before the window opens?', { rival: rivalName });
      return {
        id: `poach_ultimatum_${state.year}_${target.id}`,
        kind: 'dialogue',
        venue: 'office',
        pose: 'focus',
        kicker: t('Contract inquiry'),
        title: t('Poach approach'),
        speaker: target.player,
        cardId: target.id,
        rivalId: rivalClub?.id,
        text,
        lines: [
          { side: 'them', speaker: target.player, text },
          { side: 'you', speaker: t('You'), text: t('Transfer window decisions shape the next three years.') },
        ],
        choices: [
          {
            label: t('Commit to keeping them'),
            reply: t('Your jersey stays right here. We are prioritizing your extension first.'),
            outcome: t('+1 mentality to {player}', { player: target.player }),
            cost: t('-20 reputation'),
            effects: { statBoost: { id: target.id, stat: 'mentality', amount: 1 }, reputation: -20, trust: 15 },
          },
          {
            label: t('Keep every option on the table'),
            reply: t('We will evaluate every offer when the market opens.'),
            outcome: t('+1 silver pack'),
            cost: t('-1 mentality to {player}, -10 trust', { player: target.player }),
            effects: { packs: 1, trust: -10, statBoost: { id: target.id, stat: 'mentality', amount: -1 } },
          },
        ],
      };
    },
  },

  // Fail-forward board ultimatum when finishing bottom twice in tier 0
  {
    id: 'sacked_reprieve',
    trigger: 'review',
    once: false,
    when: (state) => state.phase === 'review' && state.lastPlaces >= 2,
    build: (state, cards) => {
      const { igl } = castSquadRoles(state, cards);
      const text = t('The board called an emergency review after back-to-back bottom finishes. I told them the locker room still backs you.');
      return {
        id: `sacked_reprieve_${state.year}`,
        kind: 'dialogue',
        venue: 'office',
        pose: 'command',
        kicker: t('Board ultimatum'),
        title: t('Emergency hearing'),
        speaker: igl.player,
        cardId: igl.id,
        text,
        lines: [
          { side: 'them', speaker: igl.player, text },
          { side: 'you', speaker: t('You'), text: t('We have one more split to prove the board right.') },
        ],
        choices: [
          {
            label: t('Restructure with emergency funds'),
            reply: t('Open the emergency reserve. We bring in fresh talent this window.'),
            outcome: t('+2 silver packs'),
            cost: t('+25 pressure, -20 reputation'),
            effects: { packs: 2, pressure: 25, reputation: -20 },
          },
          {
            label: t('Double down on training'),
            reply: t('We fix this on the practice server with the five we have.'),
            outcome: t('+2 training tapes'),
            cost: t('+20 fatigue to starters'),
            effects: { tapesCount: 2, fatigueDelta: 20, trust: 10 },
          },
        ],
      };
    },
  },
];

/** Builds live in-board dialogue lines for each phase and round of a Story Mode match. */
export function buildBoardComms(state, rivalClub, cards) {
  if (!state?.story) return null;
  const { igl, talisman, nextNemesis } = castSquadRoles(state, cards);
  const rivalName = rivalClub?.name ?? state.name;
  const nemesis = nextNemesis && (!rivalClub || nextNemesis.orgId === rivalClub.id) ? nextNemesis : null;
  const record = rivalClub ? state.story.rivalries?.[rivalClub.id] : null;
  const bogey = record && record.streak <= -3 ? -record.streak : 0;
  const by = (card, role) => ({ speaker: card.player, role, cardId: card.id });
  const rules = [
    // Story memory first: these only exist when the save has history with this opponent.
    nemesis && { id: 'nemesis_open', score: 5, ...by(nemesis, t('Nemesis')), when: f => f.event === 'round_start' && f.round === 0,
      text: t('I know every setup you run. I helped build them.') },
    nemesis && { id: 'nemesis_taunt', score: 4, ...by(nemesis, t('Nemesis')), when: f => f.event === 'round_lost',
      text: t('You should have kept me, coach.') },
    nemesis && { id: 'nemesis_answer', score: 4, ...by(talisman, t('Star')), when: f => f.event === 'round_won',
      text: t('Tell {player} the server remembers.', { player: nemesis.player }) },
    bogey > 0 && { id: 'bogey_open', score: 4, ...by(igl, 'IGL'), when: f => f.event === 'round_start' && f.round === 0,
      text: t('{rival} have beaten us {n} straight. Not tonight.', { rival: rivalName, n: bogey }) },
    // Series shape: only the moments that matter get a line.
    { id: 'decider', score: 3, ...by(igl, 'IGL'), when: f => f.event === 'round_start' && f.decider,
      text: t('Decider. Everything we drilled comes down to one map.') },
    { id: 'facing_out', score: 3, ...by(igl, 'IGL'), when: f => f.event === 'round_start' && f.facingOut,
      text: t('Lose this one and we go home. Play our map.') },
    { id: 'levelled', score: 3, ...by(talisman, t('Star')), when: f => f.levelled && !f.champion,
      text: t('Level. Watch their heads drop.') },
    { id: 'sweep', score: 3, ...by(talisman, t('Star')), when: f => f.sweep,
      text: t('Clean sweep. Nobody laid a finger on us.') },
    { id: 'match_point', score: 2, ...by(igl, 'IGL'), when: f => f.event === 'round_won' && f.matchPoint,
      text: t('One map from closing out {rival}.', { rival: rivalName }) },
    { id: 'series_lost', score: 2, ...by(igl, 'IGL'), when: f => f.champion === 'them',
      text: t('That one is on us. Practice room tomorrow.') },
  ];
  return { rules: rules.filter(Boolean) };
}

/** Generates a one-line stage banter callout after a match series. */
export function pickMatchBanter(state, cards) {
  if (!state?.story || !state.last) return null;
  const { talisman, igl, lastNemesis, lastRival, squad } = castSquadRoles(state, cards);

  if (state.last.evoProgress?.completed) {
    const evolved = squad.find(c => c.id === state.last.evoProgress.cardId) ?? talisman;
    return {
      speaker: evolved.player,
      text: t('I told you I was ready for the stage.'),
    };
  }
  if (lastNemesis) {
    if (state.last.won) {
      return {
        speaker: talisman.player,
        text: t('Tell {player} the server remembers.', { player: lastNemesis.player }),
      };
    }
    return {
      speaker: lastNemesis.player,
      text: t('You should have kept me on the roster, coach.'),
    };
  }
  // A broken losing streak is the only other line worth saying; ordinary results stay silent.
  const record = lastRival ? state.story.rivalries?.[lastRival.id] : null;
  if (state.last.won && record?.streak === 1 && record.l >= 3) {
    return {
      speaker: igl.player,
      text: t('{rival} finally blinked. Remember this one.', { rival: lastRival.name }),
    };
  }
  return null;
}
