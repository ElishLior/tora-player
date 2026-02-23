// Database types matching Supabase schema

export interface Series {
  id: string;
  name: string;
  hebrew_name: string | null;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  title: string;
  hebrew_title: string | null;
  description: string | null;
  date: string; // ISO date string
  audio_url: string | null;
  audio_url_fallback: string | null;
  audio_url_original: string | null;
  duration: number;
  file_size: number; // BIGINT in DB
  codec: string;
  recorded_at: string | null;
  series_id: string | null;
  part_number: number | null;
  parent_lesson_id: string | null;
  source_text: string | null;
  source_type: 'upload' | 'url_import' | 'whatsapp';
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonWithRelations extends Lesson {
  series?: Series | null;
  parts?: Lesson[];
  snippets?: Snippet[];
  progress?: PlaybackProgress | null;
  bookmarks?: Bookmark[];
}

export interface Snippet {
  id: string;
  parent_lesson_id: string;
  title: string;
  hebrew_title: string | null;
  start_time: number;
  end_time: number;
  audio_url: string | null;
  created_at: string;
}

export interface Playlist {
  id: string;
  name: string;
  hebrew_name: string | null;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaylistWithLessons extends Playlist {
  items: PlaylistLesson[];
  lesson_count: number;
  total_duration: number;
}

export interface PlaylistLesson {
  id: string;
  playlist_id: string;
  lesson_id: string;
  position: number;
  created_at: string;
  lesson?: Lesson;
}

export interface Bookmark {
  id: string;
  lesson_id: string;
  position: number; // seconds
  note: string | null;
  created_at: string;
  lesson?: Lesson;
}

export interface PlaybackProgress {
  id: string;
  lesson_id: string;
  position: number; // seconds
  completed: boolean;
  last_played_at: string;
  updated_at: string;
}

// Input types for creating/updating
export interface CreateLessonInput {
  title: string;
  hebrew_title?: string;
  description?: string;
  date: string;
  series_id?: string;
  part_number?: number;
  parent_lesson_id?: string;
  source_text?: string;
  source_type?: 'upload' | 'url_import' | 'whatsapp';
}

export interface UpdateLessonInput {
  title?: string;
  hebrew_title?: string;
  description?: string;
  date?: string;
  series_id?: string | null;
  part_number?: number | null;
  parent_lesson_id?: string | null;
  is_published?: boolean;
}

export interface CreatePlaylistInput {
  name: string;
  hebrew_name?: string;
  description?: string;
}

export interface CreateBookmarkInput {
  lesson_id: string;
  position: number;
  note?: string;
}

export interface CreateSeriesInput {
  name: string;
  hebrew_name?: string;
  description?: string;
}
