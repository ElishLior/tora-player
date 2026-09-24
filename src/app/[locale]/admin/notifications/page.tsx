import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isAdmin } from '@/lib/auth/admin';
import { countEmailRecipients, isEmailConfigured } from '@/lib/notifications/email';
import { getVapidDetails } from '@/lib/notifications/push';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { NotificationsAdminClient } from './notifications-admin-client';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminNotificationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect(`/${locale}/admin/login?from=/${locale}/admin/notifications`);

  const supabase = createAdminSupabaseClient();
  const [total, linked, emailRecipients] = await Promise.all([
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }),
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).not('user_id', 'is', null),
    countEmailRecipients().catch(() => null),
  ]);

  return (
    <NotificationsAdminClient
      locale={locale}
      pushConfigured={getVapidDetails() !== null}
      emailConfigured={isEmailConfigured()}
      subscriberCount={total.count ?? null}
      linkedSubscriberCount={linked.count ?? null}
      emailRecipientCount={emailRecipients}
    />
  );
}
