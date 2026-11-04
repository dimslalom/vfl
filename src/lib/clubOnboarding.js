// Club onboarding preferences: whether the primer runs before a new club, whether
// first-week hints show, and which hints and primers have been seen. Kept apart
// from the club save so deleting a club doesn't bring the hints back.
export const ONBOARDING_KEY = 'vfl-club-onboarding';

export const HINT_SCREENS = ['home', 'squad', 'train', 'vault', 'chips', 'league'];

const DEFAULTS = { primer: true, hints: true, primerSeen: false, seen: [] };

export function loadOnboarding(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ONBOARDING_KEY);
    if (!raw) return { ...DEFAULTS, seen: [] };
    const stored = JSON.parse(raw);
    return {
      primer: stored.primer !== false,
      hints: stored.hints !== false,
      primerSeen: stored.primerSeen === true,
      seen: Array.isArray(stored.seen) ? stored.seen.filter(key => HINT_SCREENS.includes(key)) : [],
    };
  } catch {
    return { ...DEFAULTS, seen: [] };
  }
}

export function saveOnboarding(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(ONBOARDING_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** The primer runs before founding a club only when it's on and hasn't been seen. */
export function primerDue(prefs) {
  return prefs.primer && !prefs.primerSeen;
}

/** First week: year 1, before the second series. A club past it never sees hints again. */
export function inFirstWeek(state) {
  return Boolean(state) && state.year === 1 && (state.results?.length ?? 0) < 2;
}

/** The one hint to show on a screen, or null. */
export function hintFor(prefs, state, screen) {
  if (!prefs.hints || !inFirstWeek(state)) return null;
  if (!HINT_SCREENS.includes(screen) || prefs.seen.includes(screen)) return null;
  return screen;
}

export function markHintSeen(prefs, screen) {
  return prefs.seen.includes(screen) ? prefs : { ...prefs, seen: [...prefs.seen, screen] };
}

/** "Show hints again" in settings: forget what was seen. */
export function resetHints(prefs) {
  return { ...prefs, seen: [], primerSeen: false };
}
