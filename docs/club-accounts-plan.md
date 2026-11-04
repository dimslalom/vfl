# VFL accounts: Discord sign-in and the Clubs cloud save

Status: built on `clubs-landing` (2026-11-04). It isn't live until the migration below is applied and the branch reaches `main`.

## Before this goes live (owner)

Merging to `main` deploys automatically (`.github/workflows`), so do step 1 **before** that merge, or sign-in and saving will fail until it runs.

1. Create the tables in the real database, from your `vfl` folder:
   `npx wrangler d1 migrations apply vfl-accounts --remote`
2. The Worker secrets `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are already set. Nothing else on Cloudflare changes.

To test sign-in locally:
1. Add `AUTH_ORIGIN=http://localhost:8787` to `.dev.vars`. `wrangler dev` rewrites the host and the `Origin` header to the custom domain, and this tells the Worker its real local address.
2. Create the local tables: `npx wrangler d1 migrations apply vfl-accounts --local`.
3. Run `npm run build && npx wrangler dev`, then open `http://localhost:8787/club`. The `localhost:8787` redirect is already on the Discord app.

Plain `npm run dev` (Vite only) has no Worker, so the sign-in button hides itself there.

## What was built

- `worker/accounts.js`: Discord OAuth (`identify` scope only, a `state` cookie, an HttpOnly session cookie stored hashed), `GET /api/me`, the Clubs save (`GET`/`PUT`/`DELETE /api/club-save`, 256 KB cap), sign-out and account deletion. Writes must carry the game's `Origin`. Tests in `test/accounts.test.js` run against the real migration in SQLite.
- `worker/migrations/accounts/0001_accounts.sql`: `users`, `sessions`, `club_saves`.
- `src/lib/account.js` and `src/lib/useClubSync.js`: the device save stays the source of truth. Each change is uploaded 1.2 s later, and immediately on `pagehide`. On load, `decideSync` picks push, adopt or ask. It remembers the last agreed version, so a tab closed before an upload doesn't trigger the question. Tests in `test/account.test.js`.
- UI: "Sign in with Discord" on the landing (only when the Worker answers), account rows in Club settings (sign out, delete account), the "Two clubs found" choice screen, and sign-in result notices.
- `/legal` now describes what an account stores.
- The CSP allows `https://cdn.discordapp.com` images for avatars.

## Original plan

**Decided (owner, 2026-11-04):** Clubs gets **Discord login, optional**. A guest can still create and play a club on this device. Signing in with Discord saves the club to the account and syncs it across devices. The landing's "No login. Saved on this device." line is placeholder copy until then.

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

## One VFL login, not a Clubs login

The owner wants this Discord app ("VFL") to be the login for every VFL product, present and future. So:

- `users` and `sessions` are VFL-wide and know nothing about Clubs. Each product keeps its own data table keyed by user id (`club_saves` for Clubs).
- They live in a new D1 database, `vfl-accounts`, kept apart from the OpVAL-owned `vfl-daily-scores`.
- The session cookie is host-only on `vctfantasy.dimas.works` for now. If a future product moves to another `dimas.works` subdomain, move sign-in to one host and widen the cookie to `.dimas.works` then. A product on a different domain adds its own redirect URI in the Discord app.

## Discord, optional: the build

1. **Owner:** create a Discord application (Developer Portal, OAuth2), set the redirect URI to `https://vctfantasy.dimas.works/api/auth/discord/callback`, and add `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` as Worker secrets. Claude never sees the secret.
2. **Worker:** `GET /api/auth/discord` (redirect with `state`), the callback (exchange the code, read `/users/@me` with the `identify` scope only, and set an `HttpOnly; Secure; SameSite=Lax` session cookie), `POST /api/auth/logout`, `GET /api/me`, `GET`/`PUT /api/club-save`, and `DELETE /api/account`. D1 migrations for `users`, `sessions` and `club_saves`.
3. **Client:** a "Sign in with Discord" row in Club settings and a quiet button on the landing in place of the "No login" line. On the first sign-in with a device club, upload it. If both a device club and a cloud club exist, ask which one to keep.
4. **Privacy:** store the Discord id, the username and the avatar hash only, never email. Add a line to `/legal`.

## Questions for the owner

1. ~~Which option?~~ Decided: Discord, optional.
2. Should anything (the leaderboards, a Club league table) ever require an account?
3. Is cross-device play a real ask from players, or a nice-to-have?
