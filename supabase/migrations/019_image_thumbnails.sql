-- Gallery thumbnails: R2 key of a ~480px-wide WebP rendition of each lesson
-- image (`images/<lesson>/thumbs/<name>.webp`), written by the admin image
-- upload and by scripts/backfill-image-thumbs.mjs.
--
-- Additive and nullable: the lesson page falls back to the original while it
-- is null. width/height (003) are the original's displayed dimensions; they
-- need the image bytes, so the backfill script fills them, not this migration.

ALTER TABLE public.lesson_images
  ADD COLUMN IF NOT EXISTS thumb_key text;
