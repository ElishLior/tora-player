import { setRequestLocale } from 'next-intl/server';
import { isAdmin } from '@/lib/auth/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import MeClient, { type MeAccount } from './me-client';

type Props = { params: Promise<{ locale: string }> };

/**
 * Personal library ("הספרייה שלי"). Works for guests (device data plus a
 * sign-in call to action) and for signed-in users (account settings too).
 */
export default async function MePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  let account: MeAccount | null = null;
  if (supabase && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, notify_new_lessons')
      .eq('id', user.id)
      .maybeSingle();
    account = {
      email: user.email ?? '',
      displayName: profile?.display_name ?? '',
      notifyByEmail: profile?.notify_new_lessons ?? true,
      isAdmin: await isAdmin(),
    };
  }

  return <MeClient locale={locale} account={account} />;
}
