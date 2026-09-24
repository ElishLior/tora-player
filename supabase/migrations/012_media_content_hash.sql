-- Content hashes make media imports idempotent: the same WhatsApp file posted
-- twice (e.g. the Elul resend) or re-imported maps to one row.
ALTER TABLE public.lesson_audio ADD COLUMN IF NOT EXISTS content_sha1 text;
ALTER TABLE public.lesson_images ADD COLUMN IF NOT EXISTS content_sha1 text;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_audio_content_sha1_key
  ON public.lesson_audio (content_sha1) WHERE content_sha1 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lesson_images_content_sha1_key
  ON public.lesson_images (content_sha1) WHERE content_sha1 IS NOT NULL;
