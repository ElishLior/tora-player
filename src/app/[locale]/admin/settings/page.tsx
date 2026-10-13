import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isAdmin } from '@/lib/auth/admin';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { readAppSettings } from '@/lib/supabase/app-settings';
import { AppSettingsClient } from './settings-client';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect(`/${locale}/admin/login?from=/${locale}/admin/settings`);

  // Uncached: the form shows what is stored right now. Before migration 028 it says so.
  const { settings, schemaReady } = await readAppSettings(createAdminSupabaseClient());

  return <AppSettingsClient locale={locale} tipIntervalSeconds={settings.tipIntervalSeconds} schemaReady={schemaReady} />;
}
