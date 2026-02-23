import { z } from 'zod';

export const createLessonSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  hebrew_title: z.string().optional(),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  series_id: z.string().uuid().optional().nullable(),
  part_number: z.number().int().positive().optional().nullable(),
  parent_lesson_id: z.string().uuid().optional().nullable(),
  source_text: z.string().optional(),
  source_type: z.enum(['upload', 'url_import', 'whatsapp']).default('upload'),
});

export const updateLessonSchema = z.object({
  title: z.string().min(1).optional(),
  hebrew_title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  series_id: z.string().uuid().optional().nullable(),
  part_number: z.number().int().positive().optional().nullable(),
  parent_lesson_id: z.string().uuid().optional().nullable(),
  is_published: z.boolean().optional(),
});

export const createPlaylistSchema = z.object({
  name: z.string().min(1, 'Playlist name is required'),
  hebrew_name: z.string().optional(),
  description: z.string().optional(),
});

export const createBookmarkSchema = z.object({
  lesson_id: z.string().uuid(),
  position: z.number().int().min(0),
  note: z.string().optional(),
});

export const createSeriesSchema = z.object({
  name: z.string().min(1, 'Series name is required'),
  hebrew_name: z.string().optional(),
  description: z.string().optional(),
});

export const playbackProgressSchema = z.object({
  lesson_id: z.string().uuid(),
  position: z.number().int().min(0),
  completed: z.boolean().default(false),
});

export const searchSchema = z.object({
  query: z.string().min(1),
  series_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
