-- Auto session creation feature
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS auto_create_session BOOLEAN DEFAULT false;
