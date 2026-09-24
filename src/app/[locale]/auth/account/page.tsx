import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isAdmin } from '@/lib/auth/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AccountClient } from './account-client';

type Props = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) {
    redirect(`/${locale}/auth/sign-in?next=${encodeURIComponent(`/${locale}/auth/account`)}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, notify_new_lessons')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <AccountClient
      locale={locale}
      email={user.email ?? ''}
      initialDisplayName={profile?.display_name ?? ''}
      initialNotifyByEmail={profile?.notify_new_lessons ?? true}
      isAdmin={await isAdmin()}
    />
  );
}
