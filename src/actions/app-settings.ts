'use server';

import { isAdmin } from '@/lib/auth/admin';
import { APP_SETTING_KEYS, isMissingAppSettings, isTipInterval } from '@/lib/app-settings';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { revalidateCatalog } from '@/lib/supabase/anon';

export type AppSettingsActionResult =
  | { ok: true }
  | { ok: false; error: 'unauthorized' | 'invalid' | 'schema_missing' | 'failed' };

/** Sets the seconds between tips on the home page (0 = no rotation). */
export async function updateTipInterval(seconds: unknown): Promise<AppSettingsActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  if (!isTipInterval(seconds)) return { ok: false, error: 'invalid' };

  const { error } = await createAdminSupabaseClient()
    .from('app_settings')
    .upsert({ key: APP_SETTING_KEYS.tipIntervalSeconds, value: seconds, updated_at: new Date().toISOString() });
  if (error) {
    if (isMissingAppSettings(error)) return { ok: false, error: 'schema_missing' };
    console.error('updateTipInterval failed', error);
    return { ok: false, error: 'failed' };
  }

  // The home page reads the setting through the catalog cache.
  revalidateCatalog();
  return { ok: true };
}
