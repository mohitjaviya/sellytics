-- ============================================================
--  Phase 8 Migration — Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS user_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('city', 'account')),
  assignment_value TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, assignment_type, assignment_value)
);

CREATE INDEX IF NOT EXISTS idx_user_assignments_user ON user_assignments(user_id);

-- RLS
ALTER TABLE user_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read user_assignments" ON user_assignments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin/Manager can write user_assignments" ON user_assignments FOR ALL 
  USING (auth.jwt()->>'role' IN ('Admin','Manager'))
  WITH CHECK (auth.jwt()->>'role' IN ('Admin','Manager'));
