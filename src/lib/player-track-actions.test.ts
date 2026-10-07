import { describe, expect, it } from 'vitest';
import type { OfflineLessonMeta } from '@/lib/offline-storage';
import type { AudioTrack } from '@/stores/audio-store';
import {
  getTrackDownloadFilename,
  getTrackDownloadUrl,
  getTrackOfflineDownloadInput,
  getTrackOfflineKey,
  getTrackOfflineLessonInput,
  isTrackDownloadedInLesson,
  systemSkipSeconds,
} from './player-track-actions';

const track: AudioTrack = {
  id: 'runtime-track',
  lessonId: 'lesson-1',
  audioFileId: 'audio-1',
  partIndex: 2,
  partCount: 3,
  fileKey: 'audio/lesson-1/part-1.opus',
  offlineKey: 'lesson-1:audio-1',
  title: 'Lesson',
  hebrewTitle: 'שיעור',
  audioUrl: '/api/audio/stream/audio%2Flesson-1%2Fpart-1.opus',
  duration: 120,
  seriesName: 'עץ חיים',
  date: '2026-05-10',
  originalName: 'WhatsApp Audio 1.opus',
};

describe('player track actions', () => {
  it('builds the same offline payload identity from an active player track', () => {
    expect(getTrackOfflineKey(track)).toBe('lesson-1:audio-1');
    expect(getTrackOfflineDownloadInput(track)).toEqual({
      audioFileId: 'audio-1',
      fileKey: 'audio/lesson-1/part-1.opus',
      audioUrl: '/api/audio/stream/audio%2Flesson-1%2Fpart-1.opus',
      title: 'WhatsApp Audio 1.opus',
      originalName: 'WhatsApp Audio 1.opus',
      duration: 120,
      sortOrder: 2,
      partIndex: 2,
      partCount: 3,
    });
    expect(getTrackOfflineLessonInput(track)).toEqual({
      lessonId: 'lesson-1',
      title: 'Lesson',
      hebrewTitle: 'שיעור',
      duration: 120,
      seriesName: 'עץ חיים',
      date: '2026-05-10',
    });
  });

  it('uses the active track filename for local file downloads', () => {
    expect(getTrackDownloadFilename(track)).toBe('WhatsApp Audio 1.opus');
    expect(getTrackDownloadUrl(track)).toBe(
      '/api/audio/download/audio%2Flesson-1%2Fpart-1.opus?filename=WhatsApp%20Audio%201.opus',
    );
  });

  it('recognizes a saved player track by offline key or audio url', () => {
    const downloadedLesson: OfflineLessonMeta = {
      lessonId: 'lesson-1',
      title: 'Lesson',
      hebrewTitle: 'שיעור',
      audioUrl: '/api/audio/stream/audio%2Flesson-1%2Fpart-1.opus',
      duration: 120,
      fileSize: 1234,
      downloadedAt: '2026-05-10T00:00:00.000Z',
      date: '2026-05-10',
      audioFiles: [
        {
          offlineKey: 'lesson-1:audio-1',
          lessonId: 'lesson-1',
          audioFileId: 'audio-1',
          fileKey: 'audio/lesson-1/part-1.opus',
          audioUrl: '/api/audio/stream/audio%2Flesson-1%2Fpart-1.opus',
          mimeType: 'audio/ogg',
          duration: 120,
          fileSize: 1234,
          sortOrder: 0,
          downloadedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    };

    expect(isTrackDownloadedInLesson(track, downloadedLesson)).toBe(true);
    expect(
      isTrackDownloadedInLesson({ ...track, offlineKey: 'lesson-1:other', audioFileId: 'other' }, downloadedLesson),
    ).toBe(true);
    expect(
      isTrackDownloadedInLesson(
        {
          ...track,
          audioUrl: '/api/audio/stream/other.opus',
          offlineKey: 'lesson-1:other',
          audioFileId: 'other',
          fileKey: 'audio/lesson-1/other.opus',
        },
        downloadedLesson,
      ),
    ).toBe(false);
  });
});

describe('systemSkipSeconds', () => {
  it('uses the interval the OS asked for, since its lock-screen icon shows that number', () => {
    expect(systemSkipSeconds({ seekOffset: 10, appleTouchDevice: false, appSeconds: 15 })).toBe(10);
    expect(systemSkipSeconds({ seekOffset: 30, appleTouchDevice: true, appSeconds: 15 })).toBe(30);
  });

  it('matches the iPhone lock screen "10" icon when iOS sends no interval', () => {
    expect(systemSkipSeconds({ seekOffset: undefined, appleTouchDevice: true, appSeconds: 15 })).toBe(10);
  });

  it('keeps the app interval elsewhere, where the notification shows no number', () => {
    expect(systemSkipSeconds({ seekOffset: undefined, appleTouchDevice: false, appSeconds: 15 })).toBe(15);
    expect(systemSkipSeconds({ seekOffset: 0, appleTouchDevice: false, appSeconds: 15 })).toBe(15);
  });
});
