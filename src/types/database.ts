// Database types matching Supabase schema

export interface Category {
  id: string;
  name: string;
  hebrew_name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryWithChildren extends Category {
  children: Category[];
  lesson_count?: number;
}

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
  // New fields from migration 003
  hebrew_date: string | null;
  parsha: string | null;
  teacher: string | null;
  location: string | null;
  summary: string | null;
  lesson_type: string | null;
  seder_number: number | null;
  // New field from migration 005
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonAudio {
  id: string;
  lesson_id: string;
  file_key: string;
  audio_url: string;
  original_name: string | null;
  file_size: number;
  duration: number;
  codec: string;
  sort_order: number;
  audio_type: string | null; // 'סידור' | 'עץ חיים' | custom
  created_at: string;
}

export interface LessonImage {
  id: string;
  lesson_id: string;
  file_key: string;
  image_url: string;
  original_name: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface LessonWithRelations extends Lesson {
  series?: Series | null;
  category?: Category | null;
  parts?: Lesson[];
  snippets?: Snippet[];
  progress?: PlaybackProgress | null;
  bookmarks?: Bookmark[];
  audio_files?: LessonAudio[];
  images?: LessonImage[];
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
