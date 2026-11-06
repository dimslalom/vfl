// Club onboarding preferences: whether the primer runs before a new club, whether
// contextual hints show, and which hints have been seen. Kept apart from the club
// save so deleting a club doesn't bring the hints back.
export const ONBOARDING_KEY = 'vfl-club-onboarding';

export const HINT_KEYS = [
  'home',
  'home_tapes',
  'squad',
  'squad_fatigue',
  'train',
  'train_active',
  'vault',
  'vault_packs',
  'chips',
  'chipPick',
  'league',
  'window',
];

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
      seen: Array.isArray(stored.seen) ? stored.seen.filter(key => HINT_KEYS.includes(key)) : [],
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

/** First week: year 1, before the second series. */
export function inFirstWeek(state) {
  return Boolean(state) && state.year === 1 && (state.results?.length ?? 0) < 2;
}

/**
 * State-aware hint resolution: evaluates current game state and target screen
 * to deliver relevant, just-in-time guidance.
 */
export function hintFor(prefs, state, screen) {
  if (!prefs?.hints || !state) return null;
  const seen = prefs.seen ?? [];

  if (screen === 'home') {
    if (state.year === 1 && (state.results?.length ?? 0) === 0) {
      return seen.includes('home') ? null : 'home';
    }
    const tapes = state.trainingTapes?.length ?? 0;
    if (tapes > 0 && !seen.includes('home_tapes')) return 'home_tapes';
    if (inFirstWeek(state) && !seen.includes('home')) return 'home';
    return null;
  }

  if (screen === 'squad') {
    const squad = state.squad ?? [];
    const fatigued = squad.some(id => (state.fatigue?.[id] ?? 0) >= 30);
    if (fatigued && !seen.includes('squad_fatigue')) return 'squad_fatigue';
    if (inFirstWeek(state) && !seen.includes('squad')) return 'squad';
    return null;
  }

  if (screen === 'train') {
    const tapes = state.trainingTapes?.length ?? 0;
    if (tapes > 0 && !seen.includes('train_active')) return 'train_active';
    if (inFirstWeek(state) && !seen.includes('train')) return 'train';
    return null;
  }

  if (screen === 'vault') {
    const packs = state.packs?.length ?? 0;
    if (packs > 0 && !seen.includes('vault_packs')) return 'vault_packs';
    if (inFirstWeek(state) && !seen.includes('vault')) return 'vault';
    return null;
  }

  if (screen === 'chips') {
    if (inFirstWeek(state) && !seen.includes('chips')) return 'chips';
    return null;
  }

  if (screen === 'chipPick') {
    return seen.includes('chipPick') ? null : 'chipPick';
  }

  if (screen === 'league') {
    if (inFirstWeek(state) && !seen.includes('league')) return 'league';
    return null;
  }

  if (screen === 'window') {
    return seen.includes('window') ? null : 'window';
  }

  return null;
}

export function markHintSeen(prefs, hintKey) {
  if (!hintKey || prefs.seen.includes(hintKey)) return prefs;
  return { ...prefs, seen: [...prefs.seen, hintKey] };
}

/** "Show tips again" in settings: forget what was seen and reset primer. */
export function resetHints(prefs) {
  return { ...prefs, seen: [], primerSeen: false };
}
