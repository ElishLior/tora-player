import { describe, expect, it } from 'vitest';
import {
  buildContentDisposition,
  getAudioDownloadUrl,
  sanitizeDownloadFilename,
} from './audio-download';

describe('audio download helpers', () => {
  it('adds download mode and a safe filename to stream proxy urls', () => {
    const url = getAudioDownloadUrl('/api/audio/stream/folder%2Flesson.mp3', 'שיעור / מיוחד.mp3');

    expect(url).toBe(
      '/api/audio/stream/folder%2Flesson.mp3?download=1&filename=%D7%A9%D7%99%D7%A2%D7%95%D7%A8%20-%20%D7%9E%D7%99%D7%95%D7%97%D7%93.mp3'
    );
  });

  it('preserves existing query params when creating a download url', () => {
    const url = getAudioDownloadUrl('/api/audio/stream/lesson.mp3?token=abc', 'Lesson');

    expect(url).toBe('/api/audio/stream/lesson.mp3?token=abc&download=1&filename=Lesson.mp3');
  });

  it('sanitizes local filenames without losing Hebrew text', () => {
    expect(sanitizeDownloadFilename('../שיעור: חלק * א?', 'mp3')).toBe('שיעור- חלק - א.mp3');
  });

  it('builds an attachment disposition with ascii and utf-8 filenames', () => {
    const disposition = buildContentDisposition('שיעור א.mp3');

    expect(disposition).toContain('attachment;');
    expect(disposition).toContain('filename="audio.mp3"');
    expect(disposition).toContain("filename*=UTF-8''%D7%A9%D7%99%D7%A2%D7%95%D7%A8%20%D7%90.mp3");
  });
});
