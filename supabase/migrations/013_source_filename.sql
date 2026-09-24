-- Separate traceability from display.
--   original_name   : optional admin-editable display name for an audio part/image
--   source_filename : the file as it arrived (WhatsApp export / dropped upload), never shown
ALTER TABLE public.lesson_audio ADD COLUMN IF NOT EXISTS source_filename text;
ALTER TABLE public.lesson_images ADD COLUMN IF NOT EXISTS source_filename text;

-- Rows written by the manifest importer (content_sha1 set) stored the source
-- filename in original_name; move it so the UI falls back to part labels.
UPDATE public.lesson_audio
SET source_filename = original_name, original_name = NULL
WHERE content_sha1 IS NOT NULL AND source_filename IS NULL;

UPDATE public.lesson_images
SET source_filename = original_name, original_name = NULL
WHERE content_sha1 IS NOT NULL AND source_filename IS NULL;
