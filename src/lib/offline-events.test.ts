import { describe, expect, it } from 'vitest';
import { OFFLINE_DOWNLOADS_CHANGED_EVENT, isOfflineDownloadsChangedEvent } from './offline-events';

describe('offline download events', () => {
  it('matches offline download change events for the affected lesson', () => {
    const event = new CustomEvent(OFFLINE_DOWNLOADS_CHANGED_EVENT, {
      detail: { lessonId: 'lesson-1' },
    });

    expect(isOfflineDownloadsChangedEvent(event, 'lesson-1')).toBe(true);
    expect(isOfflineDownloadsChangedEvent(event, 'lesson-2')).toBe(false);
  });

  it('ignores unrelated or unstructured events', () => {
    expect(isOfflineDownloadsChangedEvent(new Event(OFFLINE_DOWNLOADS_CHANGED_EVENT), 'lesson-1')).toBe(false);
    expect(isOfflineDownloadsChangedEvent(new Event('other'), 'lesson-1')).toBe(false);
  });
});
