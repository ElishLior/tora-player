import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  isLessonSourceKey,
  isMissingLessonSources,
  isPdfFileName,
  isPdfHeader,
  lessonSourceDownloadName,
  lessonSourceFileKey,
  lessonSourceFromRow,
  lessonSourcePath,
} from './lesson-sources';

const LESSON = '0902782f-2942-4286-a3d5-8906c09d388f';

describe('isPdfHeader', () => {
  it('accepts the PDF magic bytes only', () => {
    expect(isPdfHeader(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
    expect(isPdfHeader(new TextEncoder().encode('%PDF'))).toBe(false);
    expect(isPdfHeader(new TextEncoder().encode('<html>'))).toBe(false);
    expect(isPdfHeader(new Uint8Array())).toBe(false);
  });
});

describe('file names and keys', () => {
  it('recognises .pdf names', () => {
    expect(isPdfFileName('מקורות.PDF')).toBe(true);
    expect(isPdfFileName('notes.docx')).toBe(false);
  });

  it('builds a fresh sources/ key per upload', () => {
    const key = lessonSourceFileKey(LESSON, 1791697880885);
    expect(key).toBe(`sources/${LESSON}/1791697880885.pdf`);
    expect(isLessonSourceKey(key)).toBe(true);
    expect(isLessonSourceKey('audio/x/1.opus')).toBe(false);
    expect(isLessonSourceKey(`sources/${LESSON}/../x.pdf`)).toBe(false);
  });

  it('names the download after the lesson', () => {
    expect(lessonSourceDownloadName({ hebrew_title: 'פנימיות / חיצוניות', date: '2026-10-12' }, 'x.pdf')).toBe(
      'מקורות השיעור - פנימיות חיצוניות 2026-10-12.pdf',
    );
    expect(lessonSourceDownloadName({}, 'scan.pdf')).toBe('scan.pdf');
    expect(lessonSourceDownloadName({}, null)).toBe('מקורות השיעור.pdf');
  });
});

describe('lessonSourcePath', () => {
  it('opens inline or downloads', () => {
    expect(lessonSourcePath(LESSON, 'open')).toBe(`/api/sources/${LESSON}`);
    expect(lessonSourcePath(LESSON, 'download')).toBe(`/api/sources/${LESSON}?download=1`);
  });
});

describe('formatFileSize', () => {
  it('formats bytes for people', () => {
    expect(formatFileSize(820 * 1024)).toBe('820 KB');
    expect(formatFileSize(1.44 * 1024 * 1024)).toBe('1.4 MB');
    expect(formatFileSize(23 * 1024 * 1024)).toBe('23 MB');
    expect(formatFileSize(0)).toBe('');
  });
});

describe('rows', () => {
  it('maps a stored row', () => {
    expect(
      lessonSourceFromRow({
        lesson_id: LESSON,
        status: 'ready',
        file_key: `sources/${LESSON}/1.pdf`,
        file_name: 'a.pdf',
        file_size: 10,
        updated_at: '2026-10-13T00:00:00Z',
      }),
    ).toEqual({ lessonId: LESSON, status: 'ready', fileName: 'a.pdf', fileSize: 10, updatedAt: '2026-10-13T00:00:00Z' });
  });

  it('recognises a missing table', () => {
    expect(isMissingLessonSources({ code: 'PGRST205' })).toBe(true);
    expect(isMissingLessonSources({ code: '42501' })).toBe(false);
  });
});
