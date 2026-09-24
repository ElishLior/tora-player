import { describe, expect, it } from 'vitest';
import { generateLessonMetadata } from './hebrew-date';
import {
  appendTarget,
  applyUploadLookup,
  buildLessonDrafts,
  DAILY_CATEGORY_ID,
  draftState,
  formatDraftDay,
  includedImages,
  includedParts,
  jerusalemToday,
  lessonFieldsForDraft,
  lookupCandidates,
  matchUploadLookup,
  mergeLessonDrafts,
  moveDraftToDate,
  setAppendToExisting,
  setDraftDate,
  setDraftShort,
  SHORTS_CATEGORY_ID,
  summarizeDrafts,
  type LessonDraft,
  type LookupLesson,
  type UploadCandidate,
} from './upload-drafts';

let nextId = 0;
function file(name: string, durationSec: number | null = 1800, size = 1000 + nextId): UploadCandidate {
  nextId++;
  return { id: `f${nextId}`, name, size, durationSec };
}

const FALLBACK = '2026-09-20';

function lesson(overrides: Partial<LookupLesson> & Pick<LookupLesson, 'id' | 'date'>): LookupLesson {
  return {
    title: `שיעור ${overrides.date}`,
    isPublished: true,
    isShort: false,
    createdAt: '2026-08-01T00:00:00Z',
    audio: [],
    images: [],
    ...overrides,
  };
}

/** Run drafts through the server lookup the way the upload page does. */
function withLookup(drafts: LessonDraft[], lessons: LookupLesson[]): LessonDraft[] {
  const lookup = matchUploadLookup(drafts.flatMap(lookupCandidates), lessons);
  return drafts.map((d) => applyUploadLookup(d, lookup));
}

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
    expect(second.images.map((i) => i.fileId)).toEqual([files[2].id]);
    expect(first.images).toEqual([]);
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

  it('groups phone voice-recorder files with WhatsApp files of the same day', () => {
    const { drafts } = buildLessonDrafts(
      [file('20260924-061500.mp3'), file('WhatsApp Audio 2026-09-24 at 05.00.01.opus')],
      FALLBACK,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ date: '2026-09-24', isShort: false, dateFromFilename: true });
    expect(drafts[0].audio.map((p) => [p.name, p.audioType])).toEqual([
      ['WhatsApp Audio 2026-09-24 at 05.00.01.opus', 'סידור'],
      ['20260924-061500.mp3', 'עץ חיים'],
    ]);
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
    expect(summarizeDrafts(drafts).tinyClips).toBe(2);
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
    expect(drafts[0].images).toHaveLength(1);
    expect(lessonFieldsForDraft(drafts[0]).lesson_type).toBe('short_clip');
  });

  it('puts undated files on the fallback date and holds them until the date is confirmed', () => {
    const doc = file('00000141-עץ חיים המקביל.xlsx', null);
    const { drafts, unsupportedIds } = buildLessonDrafts(
      [file('recording.m4a'), file('photo.png', null), doc],
      FALLBACK,
    );
    expect(unsupportedIds).toEqual([doc.id]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ date: FALLBACK, dateFromFilename: false, isShort: false, label: 'recording' });
    expect(drafts[0].images).toHaveLength(1);
    expect(drafts[0].title).toBe(generateLessonMetadata(FALLBACK).title);
    expect(draftState(drafts[0])).toEqual({ kind: 'attention', reason: 'noDate' });
    expect(summarizeDrafts(drafts).undated).toBe(2);

    const confirmed = setDraftDate(drafts[0], FALLBACK);
    expect(draftState(confirmed)).toEqual({ kind: 'ready' });
    expect(summarizeDrafts([confirmed]).undated).toBe(0);
  });
});

describe('a week upload against the lessons already stored', () => {
  // Sunday–Friday of one week, two parts a day plus board photos, a topic clip
  // and a stray announcement, as exported from the WhatsApp group.
  const week = [
    file('00002001-AUDIO-2026-08-16-05-00-00.opus', 3600, 5_000_001),
    file('00002002-AUDIO-2026-08-16-05-40-00.opus', 900, 5_000_002),
    file('00002003-PHOTO-2026-08-16-05-50-00.jpg', null, 300_001),
    file('00002010-AUDIO-2026-08-17-05-00-00.opus', 3500, 5_000_010),
    file('00002011-AUDIO-2026-08-17-05-40-00.opus', 800, 5_000_011),
    file('00002012-AUDIO-2026-08-17-06-30-00.opus', 45, 5_000_012),
    // Tuesday's סידור is already on the site; only עץ חיים and a photo are new.
    file('00002020-AUDIO-2026-08-18-05-00-00.opus', 6540, 5_000_020),
    file('00002021-AUDIO-2026-08-18-05-40-00.opus', 480, 5_000_021),
    file('00002022-PHOTO-2026-08-18-05-45-00.jpg', null, 300_022),
    // Wednesday was uploaded completely before.
    file('00002030-AUDIO-2026-08-19-05-00-00.opus', 3600, 5_000_030),
    file('00002031-AUDIO-2026-08-19-05-40-00.opus', 700, 5_000_031),
    file('00002040-AUDIO-2026-08-20-05-00-00.opus', 3600, 5_000_040),
    file('00002041-AUDIO-2026-08-20-05-40-00.opus', 900, 5_000_041),
    file('00002042-PHOTO-2026-08-20-05-45-00.jpg', null, 300_042),
    file('00002043-PHOTO-2026-08-20-05-46-00.jpg', null, 300_043),
    file('אליהו 20.08.2026 אהבת חינם.mp3', 420, 2_000_000),
    file('00002050-AUDIO-2026-08-21-05-00-00.opus', 3600, 5_000_050),
  ];
  const stored = [
    lesson({
      id: 'tue',
      date: '2026-08-18',
      title: 'יום שלישי - ...',
      audio: [{ size: 5_000_020, name: 'whatever.opus', sortOrder: 0 }],
      images: [{ size: 1, name: 'board.jpg', sortOrder: 0 }],
    }),
    lesson({
      id: 'wed',
      date: '2026-08-19',
      audio: [
        { size: 1, name: '00002030-AUDIO-2026-08-19-05-00-00.opus', sortOrder: 0 },
        { size: 5_000_031, name: null, sortOrder: 1 },
      ],
    }),
    // A short on Thursday is never the target of Thursday's daily lesson.
    lesson({ id: 'thu-short', date: '2026-08-20', isShort: true, audio: [{ size: 9, name: 'x.mp3', sortOrder: 0 }] }),
  ];
  const drafts = withLookup(buildLessonDrafts(week, FALLBACK).drafts, stored);
  const byDate = (date: string, isShort = false) => drafts.find((d) => d.date === date && d.isShort === isShort)!;

  it('makes one row per day, sorted, with the topic clip as its own short', () => {
    expect(drafts.map((d) => [d.date, d.isShort])).toEqual([
      ['2026-08-16', false],
      ['2026-08-17', false],
      ['2026-08-18', false],
      ['2026-08-19', false],
      ['2026-08-20', false],
      ['2026-08-20', true],
      ['2026-08-21', false],
    ]);
    expect(byDate('2026-08-20').images).toHaveLength(2);
    expect(byDate('2026-08-17').audio.map((p) => [p.audioType, p.include])).toEqual([
      ['סידור', true],
      ['עץ חיים', true],
      [null, false],
    ]);
  });

  it('appends to a day that already has a lesson, continuing its part order', () => {
    const tuesday = byDate('2026-08-18');
    expect(appendTarget(tuesday)?.id).toBe('tue');
    expect(tuesday.audio.map((p) => [p.duplicateOf, p.include, p.audioType])).toEqual([
      ['יום שלישי - ...', false, null],
      [null, true, 'עץ חיים'],
    ]);
    expect(includedParts(tuesday).map((p) => p.sortOrder)).toEqual([1]);
    expect(includedImages(tuesday).map((i) => i.sortOrder)).toEqual([1]);
    expect(draftState(tuesday)).toEqual({ kind: 'ready' });
  });

  it('skips a day whose files are all stored already', () => {
    expect(draftState(byDate('2026-08-19'))).toEqual({ kind: 'skip' });
  });

  it('creates new lessons elsewhere; shorts never append to a daily lesson', () => {
    expect(appendTarget(byDate('2026-08-16'))).toBeNull();
    expect(appendTarget(byDate('2026-08-20'))).toBeNull();
    expect(appendTarget(byDate('2026-08-20', true))).toBeNull();
    expect(includedParts(byDate('2026-08-16')).map((p) => [p.audioType, p.sortOrder])).toEqual([
      ['סידור', 0],
      ['עץ חיים', 1],
    ]);
  });

  it('summarizes the batch for the strip', () => {
    expect(summarizeDrafts(drafts)).toEqual({
      lessons: 5, // Sun, Mon, Tue (append), Thu, Fri — Wed is skipped
      shorts: 1,
      recordings: 2 + 2 + 1 + 2 + 1 + 1,
      images: 1 + 1 + 2,
      duplicates: 3,
      undated: 0,
      tinyClips: 1,
    });
  });

  it('lets the admin make a separate lesson instead of appending', () => {
    const separate = setAppendToExisting(byDate('2026-08-18'), false);
    expect(appendTarget(separate)).toBeNull();
    expect(includedParts(separate).map((p) => [p.audioType, p.sortOrder])).toEqual([['סידור', 0]]);
    expect(lessonFieldsForDraft(separate).title).toBe(generateLessonMetadata('2026-08-18').title);
  });
});

describe('matchUploadLookup', () => {
  it('appends to the earliest daily lesson of the date and matches duplicates by kind', () => {
    const candidates = [
      { fileId: 'a', kind: 'audio' as const, date: '2026-08-18', size: 10, name: 'a.opus' },
      { fileId: 'i', kind: 'image' as const, date: '2026-08-18', size: 10, name: 'i.jpg' },
    ];
    const result = matchUploadLookup(candidates, [
      lesson({ id: 'late', date: '2026-08-18', createdAt: '2026-08-18T10:00:00Z' }),
      lesson({ id: 'early', date: '2026-08-18', createdAt: '2026-08-18T06:00:00Z', images: [{ size: 10, name: null, sortOrder: 4 }] }),
    ]);
    expect(result.existingByDate['2026-08-18']).toMatchObject({ id: 'early', nextAudioSort: 0, nextImageSort: 5 });
    // Same size, but only an image of that size is stored.
    expect(result.duplicates).toEqual({ i: 'שיעור 2026-08-18' });
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

  it('needs audio for a new lesson but lets images alone join an existing one', () => {
    const [photos] = buildLessonDrafts([file('00000001-PHOTO-2026-08-18-05-00-00.jpg', null)], FALLBACK).drafts;
    expect(draftState(photos)).toEqual({ kind: 'attention', reason: 'noAudio' });
    const [joined] = withLookup([photos], [lesson({ id: 'tue', date: '2026-08-18' })]);
    expect(draftState(joined)).toEqual({ kind: 'ready' });
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

  it('moves an undated draft onto a day: joins that day if still open, else stays separate', () => {
    const { drafts } = buildLessonDrafts(
      [file('00000001-AUDIO-2026-08-18-05-00-00.opus'), file('recording.m4a')],
      FALLBACK,
    );
    const undatedKey = drafts.find((d) => !d.dateFromFilename)!.key;

    const joined = moveDraftToDate(drafts, undatedKey, '2026-08-18', () => true);
    expect(joined).toHaveLength(1);
    expect(joined[0].audio.map((p) => [p.name, p.audioType])).toEqual([
      ['00000001-AUDIO-2026-08-18-05-00-00.opus', 'סידור'],
      ['recording.m4a', 'עץ חיים'],
    ]);

    const separate = moveDraftToDate(drafts, undatedKey, '2026-08-18', () => false);
    expect(separate).toHaveLength(2);
    expect(new Set(separate.map((d) => d.key)).size).toBe(2);
    expect(separate.every((d) => d.date === '2026-08-18')).toBe(true);

    const elsewhere = moveDraftToDate(drafts, undatedKey, '2026-08-19', () => true);
    expect(elsewhere.map((d) => d.key)).toEqual(['day:2026-08-18', 'day:2026-08-19']);
    expect(draftState(elsewhere[1])).toEqual({ kind: 'ready' });
  });

  it('saves tags normalized', () => {
    const [draft] = buildLessonDrafts([file('00000001-AUDIO-2026-08-18-05-00-00.opus')], FALLBACK).drafts;
    expect(lessonFieldsForDraft({ ...draft, tags: [' #אהבה ', 'אהבה', 'תפילה'] }).tags).toEqual(['אהבה', 'תפילה']);
  });
});

describe('formatDraftDay', () => {
  it('shows the Hebrew weekday letter and day.month', () => {
    expect(formatDraftDay('2026-08-18')).toBe('ג׳ 18.8');
    expect(formatDraftDay('2026-08-22')).toBe('ש׳ 22.8');
  });
});

describe('jerusalemToday', () => {
  it('uses the Israel calendar date, not UTC', () => {
    expect(jerusalemToday(new Date('2026-09-23T22:30:00Z'))).toBe('2026-09-24');
    expect(jerusalemToday(new Date('2026-01-15T21:59:00Z'))).toBe('2026-01-15');
  });
});
