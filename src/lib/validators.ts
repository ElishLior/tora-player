import { z } from 'zod';
import { LISTEN_MIN_SECONDS, LISTEN_SOURCES } from '@/lib/listen-tracking';

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

// ==================== UPLOADS ====================

/** Body of POST /api/upload/complete (chunked audio upload). */
export const completeAudioUploadSchema = z.object({
  uploadId: uuidLike,
  totalParts: z.number().int().min(1).max(200),
  lessonId: uuidLike,
  /** Name of the uploaded bytes (may be a transcoded .ogg); decides the stored format. */
  fileName: z.string().min(1).max(255),
  /** Name of the file the admin dropped, kept for traceability. */
  originalName: z.string().min(1).max(255).optional(),
  fileSize: z.number().int().min(1),
  sortOrder: z.number().int().min(0).max(999).default(0),
  duration: z.number().int().min(0).max(24 * 3600).default(0),
  audioType: z.string().trim().min(1).max(50).optional().nullable(),
});

export const duplicateAudioCandidatesSchema = z
  .array(
    z.object({
      fileId: z.string().min(1).max(100),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      size: z.number().int().min(0),
      name: z.string().max(255),
    }),
  )
  .max(500);

export const createPlaylistSchema = z.object({
  name: z.string().min(1, 'Playlist name is required'),
  hebrew_name: z.string().optional(),
  description: z.string().optional(),
});

/** A bookmark row; `id` is the client-generated local bookmark id. */
export const bookmarkSchema = z.object({
  id: uuidLike,
  lesson_id: uuidLike,
  position: z.number().min(0),
  note: z.string().max(2000).optional().nullable(),
  tag: z.string().max(40).optional().nullable(),
  audio_file_id: uuidLike.optional().nullable(),
});

export const createSeriesSchema = z.object({
  name: z.string().min(1, 'Series name is required'),
  hebrew_name: z.string().optional(),
  description: z.string().optional(),
});

export const playbackProgressSchema = z.object({
  lesson_id: uuidLike,
  /** Seconds; stored rounded to an integer. */
  position: z.number().min(0),
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
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().max(2000).optional().nullable(),
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

// ==================== ACCOUNTS ====================

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Supabase email one-time codes are 6–10 digits depending on project settings. */
export const otpCodeSchema = z.string().trim().regex(/^\d{6,10}$/);

export const profileUpdateSchema = z.object({
  display_name: z.string().trim().max(80).nullable(),
  notify_new_lessons: z.boolean(),
});

/**
 * Array of at most `max` items where entries failing `item` are dropped
 * instead of rejecting the whole payload (old device data can be malformed).
 */
function validItems<T extends z.ZodType>(item: T, max: number) {
  return z
    .array(z.unknown())
    .max(max)
    .transform((entries) =>
      entries.flatMap((entry) => {
        const result = item.safeParse(entry);
        return result.success ? [result.data as z.output<T>] : [];
      }),
    );
}

export const bookmarkSyncSchema = z.object({
  bookmarks: validItems(bookmarkSchema, 2000),
  deletedIds: validItems(uuidLike, 1000),
});

export const progressSyncSchema = validItems(
  z.object({
    lesson_id: uuidLike,
    position: z.number().min(0),
    completed: z.boolean(),
    last_played_at: z.iso.datetime({ offset: true }),
  }),
  2000,
);

// ==================== PUSH NOTIFICATIONS ====================

/** Push services of Chrome/Android (FCM), Firefox, Safari/iOS and Edge. */
const PUSH_SERVICE_HOST = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(1000)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && PUSH_SERVICE_HOST.test(url.hostname);
      } catch {
        return false;
      }
    }, 'Unsupported push endpoint'),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

// ==================== LISTEN STATISTICS ====================

/** POST /api/listen. One session id per play session; heartbeats repeat it. */
export const listenPayloadSchema = z.object({
  sessionId: uuidLike,
  lessonId: uuidLike,
  audioFileId: uuidLike.optional(),
  listenedSeconds: z.number().int().min(LISTEN_MIN_SECONDS).max(12 * 60 * 60),
  /** Random per-browser id from localStorage (see listen-tracker.ts). */
  deviceId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  source: z.enum(LISTEN_SOURCES),
});
