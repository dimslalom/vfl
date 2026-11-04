# Club accounts: plan only

Status: not built. The owner chose "real accounts later". This PR ships no login UI and changes nothing in the Worker or its secrets. Written 2026-11-04.

## Today

- The Club save is one JSON blob in `localStorage` (`vfl-club-save`, `src/lib/clubSave.js`). It never leaves the browser.
- `getClientId()` is a random per-device id, used only to mark your own row on the Daily leaderboard.
- The Worker has lobbies (with per-seat session tokens), daily score posting and the leaderboards, backed by D1 `vfl-daily-scores`. It has no users, sessions or cookies.
- `DESIGN.md` treats playing without a login as a strength, so accounts must stay optional.

## The rule any design keeps

**An account syncs a club; it never gates one.** The first Play, the primer and the founding draft never wait on sign-in. Signing in later takes the device club with it.

## Options, smallest first

| Option | What it is | Backend work | Trade-off |
| --- | --- | --- | --- |
| 1. Save code | Export the club as a code or file, import it on another device | None | Manual, with no sync. Codes can be edited, which doesn't matter in a single-player mode. |
| 2. Claim code | The Worker stores the save under a random 12-character key the player keeps | One D1 table and two routes | No identity to lose except the code. Easy to build, easy to lose. |
| 3. Email magic link | Sign in by email link, with a cookie session; the save is kept per user | Users, sessions and email sending, plus a mail provider secret | Real accounts, but email is personal data, so it needs privacy copy and deletion. |
| 4. Discord OAuth | Sign in with Discord, which the audience already uses | OAuth app, sessions, secrets | Lowest friction for this audience. Adds a third-party dependency. |

The repo history mentions an OpVAL account flow (commit `c38f7b1`: cookie auth, `/api/auth` and `/api/save`). That code isn't in VFL, but its shape (cookie session, one save row per user) matches options 3 and 4.

## If option 3 or 4 is chosen

- D1: a `users` table (id, provider, provider id, created), a `sessions` table (token hash, user, expiry; hash it the way the lobbies already do with `hashToken`), and a `club_saves` table (user, JSON, `v`, updated).
- Routes: `POST /api/auth/...`, `GET /api/save`, `PUT /api/save` (last write wins, using `updated` to warn when a newer save exists elsewhere), and `DELETE /api/account`.
- Client: `clubSave.js` keeps `localStorage` as the source of truth while offline and pushes on change when signed in. On sign-in with both a local and a cloud club, ask which one to keep, with no silent merge.
- Entry UI: a "Sync this club" row in Club settings, not on the landing.

## Questions for the owner

1. Which option, or option 1 now and 3 or 4 later?
2. Should anything (the leaderboards, a Club league table) ever require an account?
3. Is cross-device play a real ask from players, or a nice-to-have?
