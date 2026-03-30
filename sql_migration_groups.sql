-- Add game_mode to sessions table (default 'normal')
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'normal';

-- Create session_groups table
CREATE TABLE IF NOT EXISTS session_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_num INTEGER NOT NULL DEFAULT 0,
  member_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add group_id to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES session_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_groups_session_id ON session_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_matches_group_id ON matches(group_id);
