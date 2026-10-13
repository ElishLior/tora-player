/*
 * App-wide display settings an admin changes from the panel (`app_settings`,
 * migration 028). Pure rules: the keys, the defaults, the allowed values and
 * parsing. Reads live in src/lib/supabase/app-settings.ts, the write in
 * src/actions/app-settings.ts.
 */

/** Seconds between tips in the home page's "טיפים ועדכונים" row; 0 = no rotation. */
export const TIP_INTERVAL_OPTIONS = [0, 4, 7, 10, 15, 20, 30] as const;
export const DEFAULT_TIP_INTERVAL_SECONDS = 7;

export const APP_SETTING_KEYS = {
  tipIntervalSeconds: 'home_tip_interval_seconds',
} as const;

export interface AppSettings {
  tipIntervalSeconds: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tipIntervalSeconds: DEFAULT_TIP_INTERVAL_SECONDS,
};

export function isTipInterval(value: unknown): value is (typeof TIP_INTERVAL_OPTIONS)[number] {
  return typeof value === 'number' && (TIP_INTERVAL_OPTIONS as readonly number[]).includes(value);
}

/** Rows from `app_settings` → settings; unknown keys are ignored and bad values fall back to the default. */
export function appSettingsFromRows(rows: readonly { key: string; value: unknown }[]): AppSettings {
  const settings = { ...DEFAULT_APP_SETTINGS };
  for (const row of rows) {
    if (row.key === APP_SETTING_KEYS.tipIntervalSeconds && isTipInterval(row.value)) {
      settings.tipIntervalSeconds = row.value;
    }
  }
  return settings;
}

/**
 * Error codes meaning "app_settings is not there yet" (migration 028 not
 * applied): undefined table, and PostgREST's schema-cache miss.
 */
export function isMissingAppSettings(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', 'PGRST205'].includes(error.code ?? '');
}
