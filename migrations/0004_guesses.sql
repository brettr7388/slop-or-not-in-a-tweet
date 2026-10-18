-- One row per graded guess, for per-image stats. Deliberately no IP, session or name.
-- Never pruned by the session cleanup, and never exposed by a public route (it would leak the answer key).
CREATE TABLE IF NOT EXISTS guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level IN (1, 2)),
  guess TEXT NOT NULL CHECK (guess IN ('ai', 'real')),
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guesses_image ON guesses (image);
