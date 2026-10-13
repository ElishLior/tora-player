import { describe, expect, it } from 'vitest';
import {
  APP_SETTING_KEYS,
  DEFAULT_APP_SETTINGS,
  appSettingsFromRows,
  isMissingAppSettings,
  isTipInterval,
} from './app-settings';

describe('appSettingsFromRows', () => {
  it('uses the defaults with no rows', () => {
    expect(appSettingsFromRows([])).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('reads an allowed tip interval, including 0 (no rotation)', () => {
    expect(appSettingsFromRows([{ key: APP_SETTING_KEYS.tipIntervalSeconds, value: 15 }]).tipIntervalSeconds).toBe(15);
    expect(appSettingsFromRows([{ key: APP_SETTING_KEYS.tipIntervalSeconds, value: 0 }]).tipIntervalSeconds).toBe(0);
  });

  it('ignores values outside the options and unknown keys', () => {
    expect(appSettingsFromRows([{ key: APP_SETTING_KEYS.tipIntervalSeconds, value: 1 }])).toEqual(DEFAULT_APP_SETTINGS);
    expect(appSettingsFromRows([{ key: APP_SETTING_KEYS.tipIntervalSeconds, value: '10' }])).toEqual(DEFAULT_APP_SETTINGS);
    expect(appSettingsFromRows([{ key: 'other', value: 4 }])).toEqual(DEFAULT_APP_SETTINGS);
  });
});

describe('isTipInterval', () => {
  it('accepts only the listed options', () => {
    expect(isTipInterval(7)).toBe(true);
    expect(isTipInterval(8)).toBe(false);
    expect(isTipInterval(null)).toBe(false);
  });
});

describe('isMissingAppSettings', () => {
  it('recognises a missing table', () => {
    expect(isMissingAppSettings({ code: '42P01' })).toBe(true);
    expect(isMissingAppSettings({ code: 'PGRST205' })).toBe(true);
    expect(isMissingAppSettings({ code: '23505' })).toBe(false);
    expect(isMissingAppSettings(null)).toBe(false);
  });
});
