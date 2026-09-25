import { describe, expect, it } from 'vitest';
import { getListenedFraction, getResumePoint, isLastPart, isNearPartEnd } from './lesson-progress';

const parts = [
  { audioFileId: 'p1', duration: 3600 },
  { audioFileId: 'p2', duration: 1800 },
  { audioFileId: 'p3', duration: 1200 },
];

describe('getResumePoint', () => {
  it('resumes inside the part that was being heard', () => {
    expect(getResumePoint(parts, { audioFileId: 'p2', position: 600, completed: false })).toEqual({
      index: 1,
      position: 600,
    });
  });

  it('moves on to the next part when the saved part was practically finished', () => {
    expect(getResumePoint(parts, { audioFileId: 'p1', position: 3570, completed: false })).toEqual({
      index: 1,
      position: 0,
    });
  });

  it('starts over when the lesson was heard to the end', () => {
    expect(getResumePoint(parts, { audioFileId: 'p3', position: 1190, completed: false })).toEqual({ index: 0, position: 0 });
    expect(getResumePoint(parts, { audioFileId: 'p2', position: 600, completed: true })).toEqual({ index: 0, position: 0 });
  });

  it('treats entries saved before parts were tracked as the main file', () => {
    expect(getResumePoint(parts, { position: 900, completed: false })).toEqual({ index: 0, position: 900 });
  });

  it('starts from the beginning when the saved part no longer exists', () => {
    expect(getResumePoint(parts, { audioFileId: 'deleted', position: 900, completed: false })).toEqual({
      index: 0,
      position: 0,
    });
  });

  it('plays a part from its start when barely begun', () => {
    expect(getResumePoint(parts, { audioFileId: 'p2', position: 3, completed: false })).toEqual({ index: 1, position: 0 });
  });

  it('advances after an unknown-duration part ends using the observed file duration', () => {
    const unknownFirstPart = [{ audioFileId: 'p1', duration: 0 }, { audioFileId: 'p2', duration: 900 }];
    expect(getResumePoint(unknownFirstPart, {
      audioFileId: 'p1',
      position: 600,
      duration: 600,
      completed: false,
    })).toEqual({ index: 1, position: 0 });
    expect(getResumePoint(unknownFirstPart, {
      audioFileId: 'p1',
      position: 300,
      duration: 600,
      completed: false,
    })).toEqual({ index: 0, position: 300 });
    expect(getResumePoint(unknownFirstPart, {
      audioFileId: 'p1',
      position: 600,
      completed: false,
    })).toEqual({ index: 0, position: 600 });
  });
});

describe('completion', () => {
  it('counts the last minute (or last 5% of a short clip) as the end of a part', () => {
    expect(isNearPartEnd(3540, 3600)).toBe(true); // 60s left of an hour
    expect(isNearPartEnd(3420, 3600)).toBe(false); // 3 minutes left is still content
    expect(isNearPartEnd(115, 120)).toBe(true); // last 5% of a 2-minute clip
    expect(isNearPartEnd(90, 120)).toBe(false);
    expect(isNearPartEnd(100, 0)).toBe(false); // unknown duration
  });

  it('only the last part can finish a lesson', () => {
    expect(isLastPart({ partIndex: 0, partCount: 3 })).toBe(false);
    expect(isLastPart({ partIndex: 2, partCount: 3 })).toBe(true);
    expect(isLastPart({})).toBe(true);
    expect(isLastPart({ audioFileId: 'p1' })).toBe(false);
    expect(isLastPart({ audioFileId: 'p3', partIndex: 2 })).toBe(false);
  });
});

describe('getListenedFraction', () => {
  it('counts earlier parts as heard', () => {
    expect(getListenedFraction(parts, { audioFileId: 'p2', position: 900, completed: false })).toBeCloseTo(4500 / 6600);
  });

  it('uses the observed duration when computing progress in an unknown-length part', () => {
    const lesson = [{ audioFileId: 'p1', duration: 0 }, { audioFileId: 'p2', duration: 900 }];
    expect(getListenedFraction(lesson, {
      audioFileId: 'p1',
      position: 300,
      duration: 600,
      completed: false,
    })).toBeCloseTo(300 / 1500);
  });

  it('does not show 100% when an unplayed part still has unknown length', () => {
    const lesson = [{ audioFileId: 'p1', duration: 0 }, { audioFileId: 'p2', duration: 0 }];
    expect(getListenedFraction(lesson, {
      audioFileId: 'p1',
      position: 600,
      duration: 600,
      completed: false,
    })).toBe(0);
  });

  it('is full for a completed lesson and empty without progress', () => {
    expect(getListenedFraction(parts, { audioFileId: 'p1', position: 0, completed: true })).toBe(1);
    expect(getListenedFraction(parts, undefined)).toBe(0);
  });
});
