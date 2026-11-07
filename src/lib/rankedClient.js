// The browser end of ranked Clubs (worker/ranked.js): your rating, and the queue.
import { squadPayload } from './duelClient';

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message ?? 'Request failed.');
    error.code = data.error ?? 'request_failed';
    throw error;
  }
  return data;
}

/** Your rating, rank and form; null when signed out. */
export async function fetchRating() {
  try {
    return (await call('/api/rating')).rating;
  } catch {
    return null;
  }
}

export async function joinQueue({ club, squad }) {
  const { ticket } = await call('/api/match/queue', {
    method: 'POST',
    body: { club, squad: squadPayload(squad) },
  });
  return ticket.id;
}

/** { status: 'waiting', waitedMs } or { status: 'matched', code, seatId, sessionToken, bestOf, cpu }. */
export function pollTicket(id) {
  return call(`/api/match/ticket/${id}`);
}

export function leaveQueue(id) {
  return call(`/api/match/ticket/${id}`, { method: 'DELETE' }).catch(() => null);
}
