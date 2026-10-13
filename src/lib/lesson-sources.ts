/*
 * Lesson sources ("מקורות השיעור"): one PDF per lesson that can arrive days after
 * the lesson (migration 029). Pure rules shared by the upload route, the download
 * route, the admin editor and the lesson page.
 */

export type LessonSourceStatus = 'expected' | 'ready';

export interface LessonSource {
  lessonId: string;
  status: LessonSourceStatus;
  fileName: string | null;
  fileSize: number | null;
  updatedAt: string;
}

/** The stored row (snake_case) → the shape the UI uses. */
export interface LessonSourceRow {
  lesson_id: string;
  status: LessonSourceStatus;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  updated_at: string;
}

export const LESSON_SOURCE_COLUMNS = 'lesson_id, status, file_key, file_name, file_size, updated_at';

export function lessonSourceFromRow(row: LessonSourceRow): LessonSource {
  return {
    lessonId: row.lesson_id,
    status: row.status,
    fileName: row.file_name,
    fileSize: row.file_size,
    updatedAt: row.updated_at,
  };
}

/** Large scanned PDFs are fine (chunked upload); this only stops accidents. */
export const MAX_SOURCE_PDF_BYTES = 60 * 1024 * 1024;

/** A PDF starts with "%PDF-" (a leading BOM or whitespace is tolerated by readers; we stay strict). */
export function isPdfHeader(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte);
}

export function isPdfFileName(name: string): boolean {
  return /\.pdf$/i.test(name.trim());
}

/** R2 key for a newly uploaded PDF; a fresh key per upload, so a replacement never overwrites the live file. */
export function lessonSourceFileKey(lessonId: string, now = Date.now()): string {
  return `sources/${lessonId}/${now}.pdf`;
}

export function isLessonSourceKey(key: string): boolean {
  return /^sources\/[0-9a-f-]{36}\/\d+\.pdf$/i.test(key);
}

/** Open in the browser (inline) or save to the device (attachment). */
export function lessonSourcePath(lessonId: string, mode: 'open' | 'download'): string {
  const path = `/api/sources/${encodeURIComponent(lessonId)}`;
  return mode === 'download' ? `${path}?download=1` : path;
}

/** "1.4 MB" / "820 KB": one decimal under 10, whole numbers above. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value < 10 && unit > 0 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${units[unit]}`;
}

/**
 * The saved file name: the lesson's title and date, so a folder of downloads
 * stays readable. Falls back to the uploaded name.
 */
export function lessonSourceDownloadName(
  lesson: { title?: string | null; hebrew_title?: string | null; date?: string | null },
  uploadedName: string | null,
): string {
  const title = (lesson.hebrew_title || lesson.title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim();
  const base = [title, lesson.date].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 150).trim();
  if (base) return `מקורות השיעור - ${base}.pdf`;
  return uploadedName && isPdfFileName(uploadedName) ? uploadedName : 'מקורות השיעור.pdf';
}

/**
 * Errors meaning "lesson_sources is not there yet" (migration 029 not applied):
 * undefined table, and PostgREST's schema-cache miss.
 */
export function isMissingLessonSources(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', 'PGRST205'].includes(error.code ?? '');
}
