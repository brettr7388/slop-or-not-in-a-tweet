CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  deck TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 0 CHECK (round BETWEEN 0 AND 10),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 10),
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions (created_at);
ALTER TABLE scores ADD COLUMN session_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_session ON scores (session_id);
