-- Global club leaderboard: one entry per player (Discord account or guest device).
CREATE TABLE club_leaderboard (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  club_name TEXT NOT NULL,
  crest TEXT NOT NULL,
  tone TEXT NOT NULL,
  score INTEGER NOT NULL,
  power INTEGER NOT NULL,
  w INTEGER NOT NULL,
  l INTEGER NOT NULL,
  star_card_id TEXT,
  card_ids TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_club_leaderboard_rank ON club_leaderboard(score DESC, power DESC, updated_at ASC);
CREATE INDEX idx_club_leaderboard_user ON club_leaderboard(user_id);
