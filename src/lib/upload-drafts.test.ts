import { describe, expect, it } from 'vitest';
import { generateLessonMetadata } from './hebrew-date';
import {
  applyDuplicates,
  buildLessonDrafts,
  DAILY_CATEGORY_ID,
  includedParts,
  jerusalemToday,
  lessonFieldsForDraft,
  mergeLessonDrafts,
  setDraftDate,
  setDraftShort,
  SHORTS_CATEGORY_ID,
  type UploadCandidate,
} from './upload-drafts';

let nextId = 0;
function file(name: string, durationSec: number | null = 1800, size = 1000 + nextId): UploadCandidate {
  nextId++;
  return { id: `f${nextId}`, name, size, durationSec };
}

const FALLBACK = '2026-09-20';

describe('buildLessonDrafts', () => {
  it('groups a multi-day WhatsApp export into one daily draft per date with images attached', () => {
    const files = [
      file('00001912-AUDIO-2026-09-24-05-40-00.opus'),
      file('00001905-AUDIO-2026-09-23-05-02-00.opus'),
      file('00001910-PHOTO-2026-09-24-05-24-08.jpg', null),
      file('00001909-AUDIO-2026-09-24-05-04-03.opus'),
      file('00001906-AUDIO-2026-09-23-05-50-00.opus'),
    ];
    const { drafts, unsupportedIds } = buildLessonDrafts(files, FALLBACK);

    expect(unsupportedIds).toEqual([]);
    expect(drafts.map((d) => d.date)).toEqual(['2026-09-23', '2026-09-24']);
    const [first, second] = drafts;
    expect(first.audio.map((p) => p.name)).toEqual([
      '00001905-AUDIO-2026-09-23-05-02-00.opus',
      '00001906-AUDIO-2026-09-23-05-50-00.opus',
    ]);
    expect(second.audio.map((p) => [p.name, p.audioType])).toEqual([
      ['00001909-AUDIO-2026-09-24-05-04-03.opus', 'סידור'],
      ['00001912-AUDIO-2026-09-24-05-40-00.opus', 'עץ חיים'],
    ]);
    expect(second.imageIds).toEqual([files[2].id]);
    expect(first.imageIds).toEqual([]);
    expect(second.title).toBe(generateLessonMetadata('2026-09-24').title);
    expect(second.categoryId).toBe(DAILY_CATEGORY_ID);
    expect(second.dateFromFilename).toBe(true);
  });

  it('keeps after-midnight WhatsApp files on their own calendar date', () => {
    const { drafts } = buildLessonDrafts(
      [
        file('WhatsApp Audio 2026-09-24 at 23.50.00.opus'),
        file('WhatsApp Audio 2026-09-25 at 00.30.12.opus'),
      ],
      FALLBACK,
    );
    expect(drafts.map((d) => [d.date, d.audio.length])).toEqual([
      ['2026-09-24', 1],
      ['2026-09-25', 1],
    ]);
    expect(drafts[1].title).toBe(generateLessonMetadata('2026-09-25').title);
  });

  it('flags clips under two minutes and types only the real parts', () => {
    const { drafts } = buildLessonDrafts(
      [
        file('00000001-AUDIO-2026-09-24-05-00-00.opus', 40),
        file('00000002-AUDIO-2026-09-24-05-01-00.opus', 1500),
        file('00000003-AUDIO-2026-09-24-05-30-00.opus', 119),
        file('00000004-AUDIO-2026-09-24-05-31-00.opus', 2400),
        file('00000005-AUDIO-2026-09-24-06-10-00.opus', 120),
      ],
      FALLBACK,
    );
    const parts = drafts[0].audio.map((p) => [p.tooShort, p.include, p.audioType]);
    expect(parts).toEqual([
      [true, false, null],
      [false, true, 'סידור'],
      [true, false, null],
      [false, true, 'עץ חיים'],
      [false, true, null],
    ]);
    expect(includedParts(drafts[0]).map((p) => p.sortOrder)).toEqual([0, 1, 2]);
  });

  it('makes each human-named dated file its own short lesson titled by its topic', () => {
    const { drafts } = buildLessonDrafts(
      [
        file('אליהו 29.01.2026 נושא.mp3', 300),
        file('23-08-2026 יחוד חיוורתי-2- ההבדל.mp3', 90),
        file('WhatsApp Image 2026-01-29 at 10.00.00.jpeg', null),
      ],
      FALLBACK,
    );
    expect(drafts.map((d) => [d.date, d.isShort, d.title, d.categoryId])).toEqual([
      ['2026-01-29', true, 'אליהו נושא', SHORTS_CATEGORY_ID],
      ['2026-08-23', true, 'יחוד חיוורתי 2 ההבדל', SHORTS_CATEGORY_ID],
    ]);
    // Shorts are not subject to the two-minute rule and are typed קצרים.
    expect(drafts[1].audio[0]).toMatchObject({ include: true, tooShort: false, audioType: 'קצרים' });
    expect(drafts[0].imageIds).toHaveLength(1);
    expect(lessonFieldsForDraft(drafts[0]).lesson_type).toBe('short_clip');
  });

  it('puts undated files on the fallback date and reports unsupported files', () => {
    const doc = file('00000141-עץ חיים המקביל.xlsx', null);
    const { drafts, unsupportedIds } = buildLessonDrafts(
      [file('recording.m4a'), file('photo.png', null), doc],
      FALLBACK,
    );
    expect(unsupportedIds).toEqual([doc.id]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ date: FALLBACK, dateFromFilename: false, isShort: false, label: 'recording' });
    expect(drafts[0].imageIds).toHaveLength(1);
    expect(drafts[0].title).toBe(generateLessonMetadata(FALLBACK).title);
  });
});

describe('draft edits', () => {
  it('regenerates the title on date change unless the admin typed one', () => {
    const [draft] = buildLessonDrafts([file('recording.m4a')], FALLBACK).drafts;
    expect(setDraftDate(draft, '2026-09-25').title).toBe(generateLessonMetadata('2026-09-25').title);
    const typed = { ...draft, title: 'שם אחר', titleEdited: true };
    expect(setDraftDate(typed, '2026-09-25').title).toBe('שם אחר');
  });

  it('switches a daily draft to a short lesson and back', () => {
    const [draft] = buildLessonDrafts([file('שיעור על אהבה.mp3', 60)], FALLBACK).drafts;
    expect(draft.audio[0].include).toBe(false);
    const short = setDraftShort(draft, true);
    expect(short).toMatchObject({ isShort: true, title: 'שיעור על אהבה', categoryId: SHORTS_CATEGORY_ID });
    expect(short.audio[0]).toMatchObject({ include: true, audioType: 'קצרים' });
    const back = setDraftShort(short, false);
    expect(back).toMatchObject({ isShort: false, categoryId: DAILY_CATEGORY_ID });
    expect(back.audio[0].include).toBe(false);
  });

  it('excludes duplicates and re-types the remaining parts', () => {
    const [draft] = buildLessonDrafts(
      [file('00000001-AUDIO-2026-09-24-05-00-00.opus'), file('00000002-AUDIO-2026-09-24-05-40-00.opus')],
      FALLBACK,
    ).drafts;
    const marked = applyDuplicates(draft, { [draft.audio[0].fileId]: 'יום חמישי - ...' });
    expect(marked.audio.map((p) => [p.include, p.audioType, p.duplicateOf])).toEqual([
      [false, null, 'יום חמישי - ...'],
      [true, 'סידור', null],
    ]);
  });

  it('merges a second drop into the same day in posting order', () => {
    const first = buildLessonDrafts([file('00000002-AUDIO-2026-09-24-05-40-00.opus')], FALLBACK).drafts;
    const second = buildLessonDrafts(
      [file('00000001-AUDIO-2026-09-24-05-00-00.opus'), file('00000003-AUDIO-2026-09-25-05-00-00.opus')],
      FALLBACK,
    ).drafts;
    const merged = mergeLessonDrafts(first, second);
    expect(merged.map((d) => d.date)).toEqual(['2026-09-24', '2026-09-25']);
    expect(merged[0].audio.map((p) => [p.name, p.audioType])).toEqual([
      ['00000001-AUDIO-2026-09-24-05-00-00.opus', 'סידור'],
      ['00000002-AUDIO-2026-09-24-05-40-00.opus', 'עץ חיים'],
    ]);
  });
});

describe('jerusalemToday', () => {
  it('uses the Israel calendar date, not UTC', () => {
    expect(jerusalemToday(new Date('2026-09-23T22:30:00Z'))).toBe('2026-09-24');
    expect(jerusalemToday(new Date('2026-01-15T21:59:00Z'))).toBe('2026-01-15');
  });
});
