import { describe, expect, it } from 'vitest';
import { defaultNotifyMode, summarizeBatch, type AnnouncedLesson } from './batch-rules';

const lesson = (id: string, date: string, isShort = false): AnnouncedLesson => ({
  id,
  title: id,
  date,
  hebrewDate: null,
  isShort,
});

describe('defaultNotifyMode', () => {
  it('announces a single lesson on its own and a batch with one summary', () => {
    expect(defaultNotifyMode(1)).toBe('each');
    expect(defaultNotifyMode(2)).toBe('summary');
    expect(defaultNotifyMode(6)).toBe('summary');
  });
});

describe('summarizeBatch', () => {
  it('orders the week and opens the newest daily lesson', () => {
    const summary = summarizeBatch([
      lesson('thu-short', '2026-08-20', true),
      lesson('sun', '2026-08-16'),
      lesson('thu', '2026-08-20'),
      lesson('tue', '2026-08-18'),
    ])!;
    expect(summary.count).toBe(4);
    expect(summary.lessons.map((l) => l.id)).toEqual(['sun', 'tue', 'thu', 'thu-short']);
    expect(summary.newest.id).toBe('thu');
    expect([summary.first.date, summary.last.date]).toEqual(['2026-08-16', '2026-08-20']);
  });

  it('has nothing to summarize for an empty batch', () => {
    expect(summarizeBatch([])).toBeNull();
  });
});
