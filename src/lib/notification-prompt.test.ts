import { describe, expect, it } from 'vitest';
import {
  NEVER_AGAIN_KEY,
  SNOOZE_MS,
  SNOOZED_UNTIL_KEY,
  isPromptRoute,
  notificationPromptView,
  readPromptMemory,
  rememberEnabled,
  rememberNotNow,
  type PromptStatus,
} from './notification-prompt';

const NOW = 1_800_000_000_000;

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    get: (key: string) => data.get(key),
  };
}

describe('notificationPromptView', () => {
  const base = { neverAgain: false, snoozedUntil: null, now: NOW };

  it('asks for permission when notifications are off', () => {
    expect(notificationPromptView({ ...base, status: 'off' })).toBe('enable');
  });

  it('shows the iOS Add-to-Home-Screen variant on an iPhone/iPad Safari tab', () => {
    expect(notificationPromptView({ ...base, status: 'ios-install' })).toBe('ios-install');
  });

  it.each<PromptStatus>(['checking', 'unavailable', 'denied', 'on'])('never shows for status %s', (status) => {
    expect(notificationPromptView({ ...base, status })).toBeNull();
  });

  it('never shows after "don\'t show again", for any status', () => {
    expect(notificationPromptView({ ...base, neverAgain: true, status: 'off' })).toBeNull();
    expect(notificationPromptView({ ...base, neverAgain: true, status: 'ios-install' })).toBeNull();
  });

  it('stays hidden until the snooze ends', () => {
    expect(notificationPromptView({ ...base, snoozedUntil: NOW + 1, status: 'off' })).toBeNull();
    expect(notificationPromptView({ ...base, snoozedUntil: NOW + 1, status: 'ios-install' })).toBeNull();
  });

  it('shows again once the snooze time has passed', () => {
    expect(notificationPromptView({ ...base, snoozedUntil: NOW, status: 'off' })).toBe('enable');
    expect(notificationPromptView({ ...base, snoozedUntil: NOW - 1, status: 'off' })).toBe('enable');
  });
});

describe('readPromptMemory', () => {
  it('defaults to nothing remembered', () => {
    expect(readPromptMemory(fakeStorage())).toEqual({ neverAgain: false, snoozedUntil: null });
  });

  it('reads the never-again flag and the snooze time', () => {
    expect(readPromptMemory(fakeStorage({ [NEVER_AGAIN_KEY]: '1' }))).toEqual({
      neverAgain: true,
      snoozedUntil: null,
    });
    expect(readPromptMemory(fakeStorage({ [SNOOZED_UNTIL_KEY]: String(NOW) }))).toEqual({
      neverAgain: false,
      snoozedUntil: NOW,
    });
  });

  it('ignores a malformed snooze value', () => {
    expect(readPromptMemory(fakeStorage({ [SNOOZED_UNTIL_KEY]: 'soon' })).snoozedUntil).toBeNull();
  });
});

describe('rememberNotNow', () => {
  it('snoozes for three days when "don\'t show again" is not checked', () => {
    const storage = fakeStorage();
    const memory = rememberNotNow(storage, { neverAgain: false, now: NOW });
    expect(SNOOZE_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(memory).toEqual({ neverAgain: false, snoozedUntil: NOW + SNOOZE_MS });
    expect(storage.get(SNOOZED_UNTIL_KEY)).toBe(String(NOW + SNOOZE_MS));
    expect(storage.get(NEVER_AGAIN_KEY)).toBeUndefined();
  });

  it('never shows again when "don\'t show again" is checked', () => {
    const storage = fakeStorage({ [SNOOZED_UNTIL_KEY]: String(NOW + 5) });
    const memory = rememberNotNow(storage, { neverAgain: true, now: NOW });
    expect(memory).toEqual({ neverAgain: true, snoozedUntil: null });
    expect(storage.get(NEVER_AGAIN_KEY)).toBe('1');
  });

  it('a snoozed prompt is hidden by the view until the snooze ends', () => {
    const storage = fakeStorage();
    rememberNotNow(storage, { neverAgain: false, now: NOW });
    const memory = readPromptMemory(storage);
    expect(notificationPromptView({ ...memory, status: 'off', now: NOW + SNOOZE_MS - 1 })).toBeNull();
    expect(notificationPromptView({ ...memory, status: 'off', now: NOW + SNOOZE_MS })).toBe('enable');
  });
});

describe('rememberEnabled', () => {
  it('records that notifications were turned on so the prompt never returns', () => {
    const storage = fakeStorage({ [SNOOZED_UNTIL_KEY]: String(NOW + 5) });
    const memory = rememberEnabled(storage);
    expect(memory).toEqual({ neverAgain: true, snoozedUntil: null });
    expect(storage.get(NEVER_AGAIN_KEY)).toBe('1');
  });
});

describe('isPromptRoute', () => {
  it('shows the card on the home page, lessons and other reading pages', () => {
    expect(isPromptRoute('/he', 'he')).toBe(true);
    expect(isPromptRoute('/he/lessons', 'he')).toBe(true);
    expect(isPromptRoute('/he/lessons/some-lesson-11-10-2026', 'he')).toBe(true);
    expect(isPromptRoute('/he/search', 'he')).toBe(true);
  });

  it('hides the card on admin, upload, account and driving pages', () => {
    expect(isPromptRoute('/he/admin', 'he')).toBe(false);
    expect(isPromptRoute('/he/admin/stats', 'he')).toBe(false);
    expect(isPromptRoute('/he/lessons/upload', 'he')).toBe(false);
    expect(isPromptRoute('/he/lessons/upload/', 'he')).toBe(false);
    expect(isPromptRoute('/he/me', 'he')).toBe(false);
    expect(isPromptRoute('/he/me/notes', 'he')).toBe(false);
    expect(isPromptRoute('/he/driving', 'he')).toBe(false);
  });

  it('matches whole path segments and the given locale only', () => {
    expect(isPromptRoute('/he/administrators', 'he')).toBe(true);
    expect(isPromptRoute('/he/meet', 'he')).toBe(true);
    expect(isPromptRoute('/he/lessons/upload-archive', 'he')).toBe(true);
    expect(isPromptRoute('/en/me', 'en')).toBe(false);
    expect(isPromptRoute('/en/me', 'he')).toBe(true);
  });
});
