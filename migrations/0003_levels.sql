ALTER TABLE sessions ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level IN (1, 2));
ALTER TABLE scores ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level IN (1, 2));
CREATE INDEX IF NOT EXISTS idx_scores_level_rank ON scores (level, score DESC, created_at ASC);
