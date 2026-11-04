-- VFL-wide accounts: one row per person, whatever product they sign in from.
-- Only what Discord's `identify` scope gives and the UI needs. No email.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Session cookies are stored hashed, the way lobby seats already are.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Clubs: one saved club per account, the same JSON the device keeps.
CREATE TABLE club_saves (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  save TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
