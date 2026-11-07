import { clubById, newClub } from '../club/season.js';
import {
  applyStoryEffects, buildEraChronicle, initStoryState, isStoryClub, pickNextEra, recordRivalryMatch, recordTransfersInMemory,
} from './storyMemory.js';
import { ORIGIN_STORYLETS, buildBoardComms, buildMilestoneCutscene, pickMatchBanter } from './storylines/originCampaign.js';
export { buildBoardComms };
import { financialCrisisStoryline } from './storylines/crisisFinancial.js';
import { scandalCrisisStoryline } from './storylines/crisisScandal.js';
import { invitationalTourStoryline } from './storylines/tourInvitational.js';

export const STORY_PACKS = [
  financialCrisisStoryline,
  scandalCrisisStoryline,
  invitationalTourStoryline,
];

function findTriggeredStorylet(state, cards, trigger) {
  const seen = new Set(state.story?.seen ?? []);
  for (const item of ORIGIN_STORYLETS) {
    if (item.trigger !== trigger) continue;
    if (item.once && seen.has(item.id)) continue;
    if (!item.when(state, cards)) continue;
    const built = item.build(state, cards);
    if (built && !seen.has(built.id)) return built;
  }
  return null;
}

function findTriggeredPack(state, cards, packs = STORY_PACKS) {
  if (!isStoryClub(state)) return null;
  for (const pack of packs) {
    if (pack.canTrigger(state, state.story)) {
      return pack.buildScene(state, cards);
    }
  }
  return null;
}

/** Rebuilds an active pendingScene from current storylet/pack definitions so live saves stay fresh. */
export function refreshPendingScene(state, cards, packs = STORY_PACKS) {
  const pending = state?.story?.pendingScene;
  if (!pending) return null;
  if (pending.kind === 'cutscene') {
    return buildMilestoneCutscene(pending.id, state, cards) ?? pending;
  }
  const pack = packs.find(item => item.id === pending.packId || item.id === pending.id);
  if (pack) return pack.buildScene(state, cards);
  const storylet = ORIGIN_STORYLETS.find(item => pending.id === item.id || pending.id?.startsWith(`${item.id}_`));
  if (storylet) return storylet.build(state, cards);
  return pending;
}

/** Creates a brand-new Story Squad with Act I opening cutscene queued. */
export function newStoryClub({ seed, name, picks, cards, crest, tone }) {
  const base = newClub({ seed, name, picks, cards, crest, tone });
  const story = initStoryState(picks);
  const opening = buildMilestoneCutscene('cutscene_opening', { ...base, story }, cards);
  return {
    ...base,
    story: {
      ...story,
      seen: opening ? [opening.id] : [],
      pendingScene: opening,
    },
  };
}

/** True when a story save has a queued scene, chronicle, or eligible live story pack. */
export function hasUnseenStoryPack(state, packs = STORY_PACKS) {
  if (!isStoryClub(state)) return false;
  if (state.story.pendingScene || state.story.chronicle) return true;
  return packs.some(pack => pack.canTrigger(state, state.story));
}

/** Checks for newly shipped live story packs or pre-match beats when opening a story save. */
export function syncStoryOnLoad(state, cards, packs = STORY_PACKS) {
  if (!isStoryClub(state)) return state;
  if (state.story.pendingScene) {
    const refreshed = refreshPendingScene(state, cards, packs);
    if (refreshed && refreshed !== state.story.pendingScene) {
      return {
        ...state,
        story: {
          ...state.story,
          pendingScene: refreshed,
        },
      };
    }
    return state;
  }
  if (state.story.chronicle) return state;

  const packScene = findTriggeredPack(state, cards, packs);
  if (packScene) {
    return {
      ...state,
      story: {
        ...state.story,
        pendingScene: packScene,
      },
    };
  }

  if (state.phase === 'league' || state.phase === 'playoffs') {
    const pre = findTriggeredStorylet(state, cards, 'pre_match');
    if (pre) {
      return {
        ...state,
        story: {
          ...state.story,
          seen: [...state.story.seen, pre.id],
          pendingScene: pre,
        },
      };
    }
  }
  return state;
}

/** Updates story state, rivalries, banter, and scenes after a match series finishes. */
export function onSeriesFinishedStory(prevState, nextState, outcome, cards, packs = STORY_PACKS) {
  if (!isStoryClub(prevState)) return nextState;
  const opponentId = nextState.last?.opponent;
  const opponent = opponentId ? clubById(nextState, opponentId) : null;
  let story = recordRivalryMatch(prevState.story, opponentId, opponent?.name, Boolean(outcome?.won));
  const withStory = { ...nextState, story };
  const banter = pickMatchBanter(withStory, cards);
  story = { ...story, banter };

  const seen = new Set(story.seen ?? []);
  let pendingScene = story.pendingScene;
  let chronicle = story.chronicle;

  if (nextState.phase === 'review') {
    const completedChronicleYears = new Set((story.chronicles ?? []).map(c => c.year));
    const wonChampions = nextState.review?.placement === 1 && nextState.tier >= 2;
    if ((nextState.year === 3 || (wonChampions && nextState.year <= 3)) && !completedChronicleYears.has(nextState.year)) {
      chronicle = buildEraChronicle({ ...nextState, story });
    }

    if (nextState.review?.placement === 1 && !seen.has('cutscene_champion')) {
      pendingScene = buildMilestoneCutscene('cutscene_champion', { ...nextState, story }, cards);
      seen.add('cutscene_champion');
    } else if (nextState.review?.movement === 'relegate' && !seen.has('cutscene_relegation')) {
      pendingScene = buildMilestoneCutscene('cutscene_relegation', { ...nextState, story }, cards);
      seen.add('cutscene_relegation');
    } else {
      const reviewBeat = findTriggeredStorylet({ ...nextState, story: { ...story, seen: [...seen] } }, cards, 'review')
        ?? findTriggeredStorylet({ ...nextState, story: { ...story, seen: [...seen] } }, cards, 'post_match');
      if (reviewBeat) {
        pendingScene = reviewBeat;
        seen.add(reviewBeat.id);
      }
    }
  } else {
    const postBeat = findTriggeredStorylet({ ...nextState, story: { ...story, seen: [...seen] } }, cards, 'post_match');
    if (postBeat) {
      pendingScene = postBeat;
      seen.add(postBeat.id);
    } else {
      const packScene = findTriggeredPack({ ...nextState, story: { ...story, seen: [...seen] } }, cards, packs);
      if (packScene) {
        pendingScene = packScene;
      }
    }
  }

  return {
    ...nextState,
    story: {
      ...story,
      seen: [...seen],
      pendingScene,
      chronicle,
    },
  };
}

/** Transitions acts, eras, and transfer memory when the transfer window closes. */
export function onWindowClosedStory(prevState, nextState, decisions, cards) {
  if (!isStoryClub(prevState)) return nextState;
  const recorded = recordTransfersInMemory(prevState, nextState, decisions, cards);
  const story = { ...recorded.story };
  const seen = new Set(story.seen ?? []);
  let pendingScene = null;

  if (recorded.year === 2) {
    story.act = 2;
    story.era = 'origin';
    if (!seen.has('cutscene_act2')) {
      pendingScene = buildMilestoneCutscene('cutscene_act2', { ...recorded, story }, cards);
      seen.add('cutscene_act2');
    }
  } else if (recorded.year === 3) {
    story.act = 3;
    story.era = 'origin';
    if (!seen.has('cutscene_act3')) {
      pendingScene = buildMilestoneCutscene('cutscene_act3', { ...recorded, story }, cards);
      seen.add('cutscene_act3');
    }
  } else if (recorded.year >= 4) {
    story.act = 4;
    story.era = pickNextEra(prevState);
    if (!seen.has('cutscene_dynasty')) {
      pendingScene = buildMilestoneCutscene('cutscene_dynasty', { ...recorded, story }, cards);
      seen.add('cutscene_dynasty');
    }
  }

  if (!pendingScene) {
    const pre = findTriggeredStorylet({ ...recorded, story: { ...story, seen: [...seen] } }, cards, 'pre_match');
    if (pre) {
      pendingScene = pre;
      seen.add(pre.id);
    }
  }

  return {
    ...recorded,
    story: {
      ...story,
      seen: [...seen],
      pendingScene,
      banter: null,
    },
  };
}

/** Resolves the currently active story cutscene or dialogue choice. */
export function resolveStoryScene(state, choiceIndex = 0, cards = []) {
  if (!isStoryClub(state) || !state.story.pendingScene) return state;
  const scene = refreshPendingScene(state, cards) ?? state.story.pendingScene;
  const seen = new Set(state.story.seen ?? []);
  seen.add(scene.id);

  const completedPacks = new Set(state.story.completedPacks ?? []);
  if (scene.packId) completedPacks.add(scene.packId);

  let next = {
    ...state,
    story: {
      ...state.story,
      seen: [...seen],
      completedPacks: [...completedPacks],
      pendingScene: null,
    },
  };

  if (scene.kind === 'dialogue' && Array.isArray(scene.choices) && scene.choices.length > 0) {
    const chosen = scene.choices[choiceIndex] ?? scene.choices[0];
    if (chosen?.effects) {
      next = applyStoryEffects(next, chosen.effects, cards);
    }
  }

  // After an opening/transition cutscene, check if a week-start or review dialogue beat is ready.
  if (scene.kind === 'cutscene') {
    const trigger = next.phase === 'review' ? 'review' : 'pre_match';
    const followUp = findTriggeredStorylet(next, cards, trigger);
    if (followUp) {
      next = {
        ...next,
        story: {
          ...next.story,
          seen: [...next.story.seen, followUp.id],
          pendingScene: followUp,
        },
      };
    }
  }

  return next;
}

/** Archives the active Era Chronicle so the save continues into the next era. */
export function dismissChronicle(state) {
  if (!isStoryClub(state) || !state.story.chronicle) return state;
  return {
    ...state,
    story: {
      ...state.story,
      chronicles: [...(state.story.chronicles ?? []), state.story.chronicle],
      chronicle: null,
    },
  };
}
