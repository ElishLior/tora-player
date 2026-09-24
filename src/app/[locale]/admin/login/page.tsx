import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getAdminPasswordConfig } from '@/lib/auth/admin-access';
import { isAdmin } from '@/lib/auth/admin';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminLoginClient } from './admin-login-client';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function AdminLoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { from } = await searchParams;
  const next = safeRedirectPath(from, `/${locale}/admin`);

  if (await isAdmin()) redirect(next);

  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  return (
    <AdminLoginClient
      locale={locale}
      next={next}
      signedInEmail={user?.email ?? null}
      passwordEnabled={getAdminPasswordConfig() !== null}
    />
  );
}
