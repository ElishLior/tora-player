import { describe, expect, it } from 'vitest';
import { chooseLessonStart } from './play-lesson';

const resumeAt = { index: 1, position: 300 };

describe('chooseLessonStart', () => {
  it('starts a chosen part from its beginning, ignoring saved progress', () => {
    expect(chooseLessonStart({ partCount: 2, liveIndex: -1, resume: resumeAt, startPart: 0 })).toEqual({
      index: 0,
      position: 0,
    });
  });

  it('starts a chosen part even when another part is loaded', () => {
    expect(chooseLessonStart({ partCount: 2, liveIndex: 0, resume: resumeAt, startPart: 1 })).toEqual({
      index: 1,
      position: 0,
    });
  });

  it('keeps the loaded part live when it is the chosen one (no seek)', () => {
    expect(chooseLessonStart({ partCount: 2, liveIndex: 1, resume: resumeAt, startPart: 1 })).toEqual({
      index: 1,
      position: 0,
    });
  });

  it('ignores an out-of-range or fractional part and falls back to the rules', () => {
    expect(chooseLessonStart({ partCount: 2, liveIndex: -1, resume: resumeAt, startPart: 2 })).toEqual(resumeAt);
    expect(chooseLessonStart({ partCount: 2, liveIndex: -1, resume: resumeAt, startPart: -1 })).toEqual(resumeAt);
    expect(chooseLessonStart({ partCount: 2, liveIndex: -1, resume: resumeAt, startPart: 0.5 })).toEqual(resumeAt);
  });

  it('keeps a loaded lesson where it is when no part is chosen', () => {
    expect(chooseLessonStart({ partCount: 2, liveIndex: 1, resume: resumeAt })).toEqual({ index: 1, position: 0 });
  });

  it('resumes from saved progress when the lesson is not loaded', () => {
    expect(chooseLessonStart({ partCount: 2, liveIndex: -1, resume: resumeAt })).toEqual(resumeAt);
  });
});
