import { describe, expect, it } from 'vitest';
import { compareMediaFilenames, parseMediaFilename } from './lesson-naming';

describe('parseMediaFilename', () => {
  it('reads date, time and sequence from WhatsApp export attachments', () => {
    expect(parseMediaFilename('00001909-AUDIO-2026-09-24-05-04-03.opus')).toEqual({
      kind: 'audio',
      source: 'whatsapp-export',
      date: '2026-09-24',
      time: '05:04:03',
      sequence: 1909,
      label: '',
    });
    expect(parseMediaFilename('00001910-PHOTO-2026-09-24-05-24-08.jpg')?.kind).toBe('image');
  });

  it('reads files saved from the WhatsApp app, including converter prefixes and duplicates', () => {
    expect(parseMediaFilename('WhatsApp Audio 2026-09-01 at 05.00.01.opus')).toMatchObject({
      source: 'whatsapp-save',
      date: '2026-09-01',
      time: '05:00:01',
    });
    expect(parseMediaFilename('VERT_WhatsApp Audio 2026-06-15 at 7.10.19.mp3')).toMatchObject({
      date: '2026-06-15',
      time: '07:10:19',
    });
    expect(parseMediaFilename('WhatsApp Image 2026-07-19 at 01.50.08 (1).jpeg')?.date).toBe('2026-07-19');
  });

  it('reads day-first dates from human-named short lessons and keeps the topic as label', () => {
    expect(parseMediaFilename('00000649-אליהו 29.01.2026.mp3')).toMatchObject({
      source: 'named',
      date: '2026-01-29',
      sequence: 649,
      label: 'אליהו',
    });
    expect(
      parseMediaFilename('23-08-2026 יחוד חיוורתי-2- ההבדל בין החיוורתי.mp3'),
    ).toMatchObject({ date: '2026-08-23', label: 'יחוד חיוורתי 2 ההבדל בין החיוורתי' });
  });

  it('rejects impossible dates and undated names', () => {
    expect(parseMediaFilename('31.02.2026 שיעור.mp3')).toBeNull();
    expect(parseMediaFilename('שיעור על אהבה.mp3')).toBeNull();
    expect(parseMediaFilename('00000141-עץ חיים המקביל.xlsx')).toBeNull();
  });
});

describe('compareMediaFilenames', () => {
  it('orders by export sequence, then by timestamp', () => {
    const files = [
      'WhatsApp Audio 2026-09-01 at 07.00.00.opus',
      'WhatsApp Audio 2026-09-01 at 05.00.01.opus',
    ];
    expect([...files].sort(compareMediaFilenames)).toEqual([files[1], files[0]]);
    expect(
      ['00000020-PHOTO-2025-08-28-08-05-20.jpg', '00000019-AUDIO-2025-08-28-08-05-20.opus'].sort(
        compareMediaFilenames,
      ),
    ).toEqual(['00000019-AUDIO-2025-08-28-08-05-20.opus', '00000020-PHOTO-2025-08-28-08-05-20.jpg']);
  });
});
