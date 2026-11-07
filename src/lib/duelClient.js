// The browser end of a live Club duel (worker Duel object, src/engine/duel.js).
// Holds the latest snapshot, reconnects with the seat's token, and gives the
// board a `remote` per map: place() resolves with the other club's board at the
// reveal, rotate() with the server's result for that map.

const SESSION_KEY = 'vfl.duel.session';

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message ?? 'Request failed.');
    error.code = data.error ?? 'request_failed';
    throw error;
  }
  return data;
}

/** The fields the server reads off a club card; the rest it takes from its own data. */
export function squadPayload(squad) {
  return squad.map(card => ({
    id: card.id,
    rating: card.rating,
    stats: card.stats,
    tier: card.tier,
    palette: card.palette,
    learned: card.learned ?? [],
    evoTheme: card.evoTheme ?? null,
    evoLevel: card.evoLevel ?? null,
    evoBadge: card.evoBadge ?? null,
  }));
}

export function createDuel({ club, squad, bestOf }) {
  return post('/api/duels', { club, squad: squadPayload(squad), bestOf });
}

export function joinDuel(code, { club, squad, sessionToken = null }) {
  return post(`/api/duels/${encodeURIComponent(code)}/join`, { club, squad: squadPayload(squad), sessionToken });
}

/** The last seat this browser held, so a refresh can take it back. */
export function savedSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function saveSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* private mode: no rejoin after refresh */ }
}

/** The other club's board for `round`, once revealed (or once that map is already over). */
export function revealedPlan(snap, round) {
  if (snap.round === round && snap.board?.phase === 'rotate') return snap.board.theirPlan;
  return snap.history?.[round]?.theirPlan ?? null;
}

export class DuelConnection {
  constructor({ code, sessionToken }) {
    this.code = code;
    this.token = sessionToken;
    this.snapshot = null;
    this.offset = 0;
    this.listeners = new Set();
    this.waiters = new Set();
    this.closed = false;
    this.retry = 0;
    this.status = 'connecting';
  }

  connect() {
    if (this.closed) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${location.host}/ws/duel/${this.code}?token=${encodeURIComponent(this.token)}`);
    this.socket = socket;
    socket.onopen = () => {
      this.retry = 0;
      // A move sent while the line was down goes again; the server drops repeats.
      if (this.pending) socket.send(JSON.stringify(this.pending));
      this.setStatus('open');
    };
    socket.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.snapshot) this.receive(message.snapshot);
    };
    socket.onclose = () => {
      if (this.socket !== socket || this.closed) return;
      this.setStatus('reconnecting');
      // ponytail: fixed backoff ladder; jitter if many clients reconnect at once.
      const wait = [500, 1000, 2000, 4000][Math.min(this.retry, 3)];
      this.retry += 1;
      setTimeout(() => this.connect(), wait);
    };
  }

  close() {
    this.closed = true;
    this.socket?.close();
    this.listeners.clear();
    this.waiters.clear();
  }

  setStatus(status) {
    this.status = status;
    this.emit();
  }

  receive(snapshot) {
    if (this.snapshot && snapshot.version < this.snapshot.version) return;
    this.snapshot = snapshot;
    this.offset = snapshot.serverNow - Date.now();
    for (const waiter of [...this.waiters]) {
      const value = waiter.test(snapshot);
      if (value) {
        this.waiters.delete(waiter);
        waiter.resolve(value);
      }
    }
    this.emit();
  }

  emit() {
    for (const listener of this.listeners) listener(this.snapshot, this.status);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot, this.status);
    return () => this.listeners.delete(listener);
  }

  send(type, payload) {
    this.pending = type === 'forfeit' ? null : { type, payload };
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type, payload }));
  }

  /** Waits for the first snapshot `test` returns something truthy for. */
  until(test) {
    const now = this.snapshot && test(this.snapshot);
    if (now) return Promise.resolve(now);
    return new Promise(resolve => this.waiters.add({ test, resolve }));
  }

  /** Server time, for the shared clock. */
  now() {
    return Date.now() + this.offset;
  }

  /** What the board calls for map `round`. */
  remote(round) {
    return {
      place: (plan) => {
        if (!this.snapshot?.board?.youPlaced) this.send('place', { round, ...plan });
        return this.until(snap => revealedPlan(snap, round));
      },
      rotate: (slots) => {
        if (!this.snapshot?.board?.youRotated) this.send('rotate', { round, slots });
        return this.until((snap) => {
          const map = snap.history?.[round];
          return map ? { result: map.result, oppSlots: map.theirRotate } : null;
        });
      },
    };
  }

  /** Ready for map `round`: it deals once both clubs are, or when the timer runs out. */
  ready(round) {
    this.send('ready', { round });
  }

  forfeit() {
    this.send('forfeit');
  }
}
