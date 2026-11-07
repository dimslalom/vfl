-- Ranked Clubs: one rating per account (Discord sign-in is required to queue).
-- `form` is the last five ranked results as W/L, newest last.
CREATE TABLE club_rating (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 1000,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  form TEXT NOT NULL DEFAULT '',
  first_win_day TEXT,
  updated_at INTEGER NOT NULL
);
