import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isAdmin } from '@/lib/auth/admin';
import { APP_VERSION } from '@/lib/app-version';
import { getVapidDetails } from '@/lib/notifications/push';
import { createSupabaseReleaseStore } from '@/lib/notifications/release-announcement';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingReleaseSchema, releaseTemplate, type ReleaseAnnouncementRow } from '@/lib/release-announcement';
import { ReleaseAnnouncementsClient } from './announcements-admin-client';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminAnnouncementsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect(`/${locale}/admin/login?from=/${locale}/admin/announcements`);

  // Migration 025 not applied: the page says so and sending stays off.
  let rows: ReleaseAnnouncementRow[] = [];
  let schemaReady = true;
  let loadFailed = false;
  try {
    rows = await createSupabaseReleaseStore(createAdminSupabaseClient()).list();
  } catch (err) {
    schemaReady = !isMissingReleaseSchema(err as { code?: string });
    loadFailed = schemaReady;
  }

  return (
    <ReleaseAnnouncementsClient
      locale={locale}
      rows={rows}
      schemaReady={schemaReady}
      loadFailed={loadFailed}
      pushConfigured={getVapidDetails() !== null}
      template={releaseTemplate(APP_VERSION)}
    />
  );
}
