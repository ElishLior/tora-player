import { describe, expect, it } from 'vitest';
import { pendingAnnouncementDecision, splitPendingForSendNow } from './upload-announcement';

describe('pendingAnnouncementDecision', () => {
  it('announces once every draft of the session finished', () => {
    expect(pendingAnnouncementDecision(3, ['published', 'published', 'saved', 'idle'])).toBe('announce');
  });

  it('waits while a draft failed (the retry completes the summary) or is still sending', () => {
    expect(pendingAnnouncementDecision(2, ['published', 'failed'])).toBe('wait');
    expect(pendingAnnouncementDecision(2, ['published', 'uploading'])).toBe('wait');
    expect(pendingAnnouncementDecision(2, ['published', 'queued'])).toBe('wait');
  });

  it('has nothing to do without pending lessons', () => {
    expect(pendingAnnouncementDecision(0, ['published'])).toBe('nothing');
    expect(pendingAnnouncementDecision(0, ['failed'])).toBe('nothing');
  });
});

describe('splitPendingForSendNow', () => {
  it('sends finished lessons and keeps lessons that still have a failed draft', () => {
    expect(splitPendingForSendNow(new Set(['sun', 'mon', 'tue']), ['mon'])).toEqual({
      send: ['sun', 'tue'],
      keep: ['mon'],
    });
  });

  it('sends everything when nothing failed', () => {
    expect(splitPendingForSendNow(['sun'], [])).toEqual({ send: ['sun'], keep: [] });
  });
});
