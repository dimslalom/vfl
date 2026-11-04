const KEY = 'vfl-rules-seen';

export function rulesSeen() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}

export function markRulesSeen() {
  try { localStorage.setItem(KEY, '1'); } catch { /* private window: asks again next time */ }
}
