-- Listening progress per part: which audio file (lesson_audio row) the saved
-- position is in, so multi-part lessons resume in the right part.
--
-- Additive and nullable: existing rows and older app versions keep working
-- (null = the lesson's main file). No foreign key on purpose: the value is only
-- a resume hint, and a part deleted later must never make a device's progress
-- upload fail; the app falls back to the start of the lesson for unknown ids.

ALTER TABLE public.playback_progress
  ADD COLUMN IF NOT EXISTS audio_file_id uuid;
