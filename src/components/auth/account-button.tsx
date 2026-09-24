'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Shield, Upload, UserRound } from 'lucide-react';
import { getViewer, type Viewer } from '@/actions/account';
import { syncAccountData } from '@/lib/account/sync';

/**
 * Header account entry: opens the personal library (/me) for everyone — an
 * initial avatar for signed-in users, a person icon for guests — plus the
 * lesson upload and admin shortcuts for admins. Also links this device's
 * bookmarks, progress and notes to the signed-in account.
 */
export function AccountButton() {
  const locale = useLocale();
  const t = useTranslations('auth');
  const tLibrary = useTranslations('library');
  const tUpload = useTranslations('upload.entry');
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
        <>
          <Link
            href={`/${locale}/lessons/upload`}
            aria-label={tUpload('cta')}
            title={tUpload('cta')}
            className="mx-0.5 rounded-full bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Upload className="h-4 w-4" />
          </Link>
          <Link
            href={`/${locale}/admin`}
            aria-label={t('adminArea')}
            title={t('adminArea')}
            className="rounded-full p-2 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <Shield className="h-4 w-4" />
          </Link>
        </>
      )}

      <Link
        href={`/${locale}/me`}
        aria-label={tLibrary('title')}
        title={user?.email ?? tLibrary('title')}
        className={`rounded-full transition-colors hover:bg-primary/10 ${user ? 'p-1.5' : 'p-2 text-muted-foreground hover:text-foreground'}`}
      >
        {user ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {initial ? <bdi>{initial}</bdi> : <UserRound className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <UserRound className="h-4 w-4" />
        )}
      </Link>
    </>
  );
}
