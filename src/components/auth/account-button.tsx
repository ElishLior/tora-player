'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Shield, UserRound } from 'lucide-react';
import { getViewer, type Viewer } from '@/actions/account';
import { syncAccountData } from '@/lib/account/sync';

/**
 * Header account entry: sign-in icon for guests, initial avatar linking to the
 * account page for signed-in users, plus the admin shortcut for admins.
 * Also links this device's bookmarks/progress to the signed-in account.
 */
export function AccountButton() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('auth');
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let cancelled = false;
    getViewer()
      .then((result) => {
        if (cancelled) return;
        setViewer(result);
        if (result.user) void syncAccountData(result.user.id);
      })
      .catch(() => {
        if (!cancelled) setViewer({ user: null, isAdmin: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const user = viewer?.user;
  const initial = (user?.displayName || user?.email || '').trim().charAt(0).toUpperCase();

  return (
    <>
      {viewer?.isAdmin && (
        <Link
          href={`/${locale}/admin`}
          aria-label={t('adminArea')}
          title={t('adminArea')}
          className="rounded-full p-2 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Shield className="h-4 w-4" />
        </Link>
      )}

      {user ? (
        <Link
          href={`/${locale}/auth/account`}
          aria-label={t('account.title')}
          title={user.email ?? undefined}
          className="rounded-full p-1.5 transition-colors hover:bg-primary/10"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {initial ? <bdi>{initial}</bdi> : <UserRound className="h-3.5 w-3.5" />}
          </span>
        </Link>
      ) : (
        <Link
          href={`/${locale}/auth/sign-in?next=${encodeURIComponent(pathname)}`}
          aria-label={t('signIn.title')}
          title={t('signIn.title')}
          className={`rounded-full p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground ${
            viewer ? '' : 'invisible'
          }`}
        >
          <UserRound className="h-4 w-4" />
        </Link>
      )}
    </>
  );
}
