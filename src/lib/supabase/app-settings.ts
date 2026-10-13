import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_APP_SETTINGS, appSettingsFromRows, isMissingAppSettings, type AppSettings } from '@/lib/app-settings';

export type AppSettingsRead = { settings: AppSettings; schemaReady: boolean };

/**
 * Reads every app setting. Never throws: before migration 028 (or on any failed
 * read) it returns the defaults, so a settings problem can't break a page.
 */
export async function readAppSettings(supabase: SupabaseClient): Promise<AppSettingsRead> {
  try {
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) {
      if (!isMissingAppSettings(error)) console.error('app_settings read failed', error);
      return { settings: DEFAULT_APP_SETTINGS, schemaReady: !isMissingAppSettings(error) };
    }
    return { settings: appSettingsFromRows(data ?? []), schemaReady: true };
  } catch (error) {
    console.error('app_settings read failed', error);
    return { settings: DEFAULT_APP_SETTINGS, schemaReady: true };
  }
}
