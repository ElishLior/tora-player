import { z } from 'zod';

// Relaxed UUID pattern — accepts any 8-4-4-4-12 hex string
// (Zod's .uuid() rejects non-RFC-4122 UUIDs like our category IDs)
const uuidLike = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  'Invalid UUID'
);

export const createLessonSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  hebrew_title: z.string().optional(),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  series_id: uuidLike.optional().nullable(),
  part_number: z.number().int().positive().optional().nullable(),
  parent_lesson_id: uuidLike.optional().nullable(),
  source_text: z.string().optional(),
  source_type: z.enum(['upload', 'url_import', 'whatsapp']).default('upload'),
  // Metadata fields
  hebrew_date: z.string().optional().nullable(),
  parsha: z.string().optional().nullable(),
  teacher: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  lesson_type: z.string().optional().nullable(),
  seder_number: z.number().int().positive().optional().nullable(),
  category_id: uuidLike.optional().nullable(),
});

export const updateLessonSchema = z.object({
  title: z.string().min(1).optional(),
  hebrew_title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  series_id: uuidLike.optional().nullable(),
  part_number: z.number().int().positive().optional().nullable(),
  parent_lesson_id: uuidLike.optional().nullable(),
  is_published: z.boolean().optional(),
  // Metadata fields
  hebrew_date: z.string().optional().nullable(),
  parsha: z.string().optional().nullable(),
  teacher: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  lesson_type: z.string().optional().nullable(),
  seder_number: z.number().int().positive().optional().nullable(),
  category_id: uuidLike.optional().nullable(),
});

export const createPlaylistSchema = z.object({
  name: z.string().min(1, 'Playlist name is required'),
  hebrew_name: z.string().optional(),
  description: z.string().optional(),
});

export const createBookmarkSchema = z.object({
  lesson_id: uuidLike,
  position: z.number().int().min(0),
  note: z.string().optional(),
});

export const createSeriesSchema = z.object({
  name: z.string().min(1, 'Series name is required'),
  hebrew_name: z.string().optional(),
  description: z.string().optional(),
});

export const playbackProgressSchema = z.object({
  lesson_id: uuidLike,
  position: z.number().int().min(0),
  completed: z.boolean().default(false),
});

export const searchSchema = z.object({
  query: z.string().min(1),
  series_id: uuidLike.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ==================== CATEGORIES ====================

export const createCategorySchema = z.object({
  hebrew_name: z.string().min(1, 'Hebrew name is required'),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  parent_id: uuidLike.optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateCategorySchema = z.object({
  hebrew_name: z.string().min(1).optional(),
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  parent_id: uuidLike.optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
});

// ==================== SNIPPET SUBMISSIONS ====================

export const submitSnippetSchema = z
  .object({
    lesson_id: uuidLike,
    audio_file_id: uuidLike.optional().nullable(),
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().nullable(),
    start_time: z.number().int().min(0),
    end_time: z.number().int().min(1),
  })
  .refine((d) => d.end_time > d.start_time, {
    message: 'end_time must be greater than start_time',
    path: ['end_time'],
  });

export const updateSnippetSubmissionSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  start_time: z.number().int().min(0).optional(),
  end_time: z.number().int().min(1).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  admin_notes: z.string().optional().nullable(),
  result_lesson_id: uuidLike.optional().nullable(),
});
