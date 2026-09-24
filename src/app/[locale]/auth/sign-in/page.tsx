import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SignInClient } from './sign-in-client';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function SignInPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const nextPath = safeRedirectPath(next, `/${locale}`);

  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect(nextPath);

  return <SignInClient locale={locale} next={nextPath} initialError={error ?? null} />;
}
