import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getAdminUsers, type AdminUsersPage } from '@/actions/admin-users';
import { isAdmin } from '@/lib/auth/admin';
import UsersClient from './users-client';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect(`/${locale}/admin/login?from=/${locale}/admin/users`);

  let data: AdminUsersPage;
  try {
    data = await getAdminUsers(await searchParams);
  } catch (error) {
    console.error('[admin-users] load failed:', error);
    const t = await getTranslations('adminUsers');
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-red-400">{t('loadFailed')}</p>
      </div>
    );
  }

  return <UsersClient locale={locale} data={data} />;
}
