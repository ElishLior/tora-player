-- Snippet submissions: users mark audio clips and submit for admin review
CREATE TABLE IF NOT EXISTS snippet_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  audio_file_id UUID REFERENCES lesson_audio(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time INTEGER NOT NULL DEFAULT 0,
  end_time INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  result_lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT snippet_time_range_check CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_snippet_submissions_status ON snippet_submissions(status);
CREATE INDEX IF NOT EXISTS idx_snippet_submissions_lesson ON snippet_submissions(lesson_id);

ALTER TABLE snippet_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone can submit (public feature)
CREATE POLICY "Anyone can create snippet submissions"
  ON snippet_submissions FOR INSERT WITH CHECK (true);

-- Anyone can read (admin reads via server, public doesn't have UI for it)
CREATE POLICY "Anyone can read snippet submissions"
  ON snippet_submissions FOR SELECT USING (true);

-- UPDATE/DELETE: allowed via anon key since admin uses cookie-based auth,
-- not Supabase auth. Server actions guard with isAdmin() checks.
CREATE POLICY "Server can update snippet submissions"
  ON snippet_submissions FOR UPDATE USING (true);

CREATE POLICY "Server can delete snippet submissions"
  ON snippet_submissions FOR DELETE USING (true);
