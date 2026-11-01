-- Eine Zeile pro gestarteter Runde. Erscheint in der Bestenliste, sobald
-- sie vom Server als Sieg geprüft wurde (score) und einen Namen hat (name).
CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  mode        TEXT NOT NULL,
  diff        TEXT NOT NULL,
  seed        INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  score       INTEGER,
  time_ms     INTEGER,
  hints       INTEGER,
  name        TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_board ON games (mode, diff, score DESC) WHERE name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_started ON games (started_at);
