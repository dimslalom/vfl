// The ranked queue's rules, pure: the Matchmaker object keeps the tickets and
// calls these. A ticket waits for a club near its rating and power; both bands
// widen the longer it waits, and after CPU_AFTER_MS it gets the CPU instead.

export const CPU_AFTER_MS = 25_000;
// A ticket nobody has polled for this long is a closed tab: it leaves the queue.
export const TICKET_IDLE_MS = 10_000;
const WIDEN_EVERY_MS = 5_000;

export function bands(waitedMs) {
  const steps = Math.floor(Math.max(0, waitedMs) / WIDEN_EVERY_MS);
  return { rating: 100 + 50 * steps, power: 0.15 + 0.05 * steps };
}

function fits(a, b, now) {
  if (a.userId === b.userId) return false;
  // Both have to accept: the band of whoever has waited less decides.
  const band = bands(Math.min(now - a.enqueuedAt, now - b.enqueuedAt));
  if (Math.abs(a.rating - b.rating) > band.rating) return false;
  return Math.abs(a.power - b.power) <= band.power * Math.max(a.power, b.power);
}

/** Waiting tickets paired oldest first, each with the closest club that fits. */
export function findPairs(tickets, now) {
  const open = tickets.filter(t => !t.match).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  const taken = new Set();
  const pairs = [];
  for (const ticket of open) {
    if (taken.has(ticket.id)) continue;
    const partner = open
      .filter(other => other !== ticket && !taken.has(other.id) && fits(ticket, other, now))
      .sort((a, b) => Math.abs(a.rating - ticket.rating) - Math.abs(b.rating - ticket.rating))[0];
    if (!partner) continue;
    taken.add(ticket.id);
    taken.add(partner.id);
    pairs.push([ticket, partner]);
  }
  return pairs;
}

/** Tickets that have waited long enough for the CPU. */
export function dueForCpu(tickets, now) {
  return tickets.filter(t => !t.match && now - t.enqueuedAt >= CPU_AFTER_MS);
}

export function idleTickets(tickets, now) {
  return tickets.filter(t => now - t.polledAt >= TICKET_IDLE_MS);
}
