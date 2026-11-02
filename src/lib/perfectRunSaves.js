export const PERFECT_RUN_STORAGE_KEY = 'vfl-perfectrun';
export const PERFECT_RUN_SAVE_VERSION = 4;
export const HALL_CAP = 20;

// This blob is read on every render, so it holds records only - never a run.
// The endless run itself lives under its own key (see lib/endlessRunSave.js),
// because parsing tens of kilobytes per frame during a live map is not free.

const emptyEndlessV2 = () => ({ bestScore: 0, bestYears: 0 });
const emptyEndlessV3 = () => ({
  bestScore: 0,      // best total including prestige banking
  bestYears: 0,
  bestTier: 0,       // highest circuit tier reached
  bestPrestige: 0,
  titlesByTier: [0, 0, 0],
});

export function migratePerfectRunSaves(data) {
  if (!data || typeof data !== 'object') {
    return {
      saveVersion: PERFECT_RUN_SAVE_VERSION,
      endlessV2: emptyEndlessV2(),
      endlessV3: emptyEndlessV3(),
      hall: [],
    };
  }
  if ((data.saveVersion ?? 1) >= PERFECT_RUN_SAVE_VERSION) {
    return { endlessV2: emptyEndlessV2(), endlessV3: emptyEndlessV3(), hall: [], ...data };
  }
  const migrated = { ...data, saveVersion: PERFECT_RUN_SAVE_VERSION };

  // v1 -> v2: the original endless record moves to an archive slot.
  if (!migrated.legacyEndlessV1 && (data.bestEndless != null || data.bestCycle != null)) {
    migrated.legacyEndlessV1 = {
      bestScore: data.bestEndless ?? 0,
      bestCycle: data.bestCycle ?? 0,
    };
  }
  delete migrated.bestEndless;
  delete migrated.bestCycle;
  migrated.endlessV2 ??= emptyEndlessV2();

  // v2 -> v3: a rules change, not a shape change. The V2 score was set under
  // a flat, unscaled world with no ladder, so it is not comparable to a V3
  // score and starts fresh - but it is kept intact and readable as an archive
  // rather than deleted, exactly like legacyEndlessV1.
  migrated.endlessV3 ??= emptyEndlessV3();

  // v3 -> v4: finished runs start being kept. Older runs were never recorded,
  // so the Hall begins empty rather than inventing entries from best scores.
  migrated.hall ??= [];

  return migrated;
}

// Best runs first, then newest, so a capped list drops the weakest old run.
export function addHallEntry(hall, entry) {
  return [...(hall ?? []), entry]
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, HALL_CAP);
}

export function loadPerfectRunSaves(storage = localStorage) {
  try {
    return migratePerfectRunSaves(JSON.parse(storage.getItem(PERFECT_RUN_STORAGE_KEY)) ?? {});
  } catch {
    return migratePerfectRunSaves({});
  }
}

export function savePerfectRunSaves(data, storage = localStorage) {
  storage.setItem(PERFECT_RUN_STORAGE_KEY, JSON.stringify({ ...data, saveVersion: PERFECT_RUN_SAVE_VERSION }));
}
