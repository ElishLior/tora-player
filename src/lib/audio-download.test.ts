import { describe, expect, it } from 'vitest';
import {
  buildAudioDownloadFilename,
  buildContentDisposition,
  getAudioDownloadUrl,
  sanitizeDownloadFilename,
} from './audio-download';

const OPUS_URL = '/api/audio/stream/audio%2Flesson-1%2F0_1715000000.opus';

describe('audio download helpers', () => {
  it('points stream urls at the download route with a safe Hebrew filename', () => {
    expect(getAudioDownloadUrl('/api/audio/stream/audio%2Flesson.mp3', 'שיעור / מיוחד.mp3')).toBe(
      '/api/audio/download/audio%2Flesson.mp3?filename=%D7%A9%D7%99%D7%A2%D7%95%D7%A8%20-%20%D7%9E%D7%99%D7%95%D7%97%D7%93.mp3',
    );
  });

  it('leaves non-stream (external) urls unchanged', () => {
    expect(getAudioDownloadUrl('https://example.com/a.mp3', 'x')).toBe('https://example.com/a.mp3');
  });

  it('treats digits after a dot as part of the name, not an extension', () => {
    expect(buildAudioDownloadFilename('WhatsApp Audio 2026-05-10 at 10.30.12', OPUS_URL)).toBe(
      'WhatsApp Audio 2026-05-10 at 10.30.12.opus',
    );
    expect(buildAudioDownloadFilename('פרק 10.12', OPUS_URL)).toBe('פרק 10.12.opus');
  });

  it('uses the stored file extension even when the display name has another one', () => {
    expect(buildAudioDownloadFilename('שיעור.mp3', OPUS_URL)).toBe('שיעור.opus');
  });

  it('falls back to mp3 when neither name nor url has an audio extension', () => {
    expect(buildAudioDownloadFilename('שיעור', '/api/audio/stream/audio%2Fx')).toBe('שיעור.mp3');
  });

  it('sanitizes local filenames without losing Hebrew text', () => {
    expect(sanitizeDownloadFilename('../שיעור: חלק * א?', 'mp3')).toBe('שיעור- חלק - א.mp3');
  });

  it('builds an attachment disposition with ascii and RFC 5987 utf-8 filenames', () => {
    const disposition = buildContentDisposition('שיעור 10.12.opus');

    expect(disposition).toBe(
      `attachment; filename="10.12.opus"; filename*=UTF-8''%D7%A9%D7%99%D7%A2%D7%95%D7%A8%2010.12.opus`,
    );
  });

  it('percent-encodes characters RFC 5987 does not allow unescaped', () => {
    expect(buildContentDisposition("it's (1).mp3")).toContain(`filename*=UTF-8''it%27s%20%281%29.mp3`);
  });
});
