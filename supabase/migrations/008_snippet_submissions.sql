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
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_snippet_submissions_status ON snippet_submissions(status);
CREATE INDEX IF NOT EXISTS idx_snippet_submissions_lesson ON snippet_submissions(lesson_id);
ALTER TABLE snippet_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create snippet submissions" ON snippet_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read snippet submissions" ON snippet_submissions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can update snippet submissions" ON snippet_submissions FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete snippet submissions" ON snippet_submissions FOR DELETE USING (true);
