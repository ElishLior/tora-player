'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bell, Check, ChevronLeft, ChevronRight, Loader2, LogOut, Shield, UserRound } from 'lucide-react';
import { updateProfile } from '@/actions/account';
import { signOutAndReset } from '@/lib/account/sync';
import { PushToggle, Switch } from '@/components/notifications/push-toggle';

interface AccountClientProps {
  locale: string;
  email: string;
  initialDisplayName: string;
  initialNotifyByEmail: boolean;
  isAdmin: boolean;
}

export function AccountClient({
  locale,
  email,
  initialDisplayName,
  initialNotifyByEmail,
  isAdmin,
}: AccountClientProps) {
  const t = useTranslations('auth');
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [notifyByEmail, setNotifyByEmail] = useState(initialNotifyByEmail);
  const [saving, setSaving] = useState<'name' | 'email' | null>(null);
  const [savedName, setSavedName] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const ForwardChevron = locale === 'he' ? ChevronLeft : ChevronRight;

  async function save(next: { display_name: string; notify_new_lessons: boolean }, field: 'name' | 'email') {
    setSaving(field);
    setErrorCode(null);
    try {
      const result = await updateProfile({ display_name: next.display_name.trim() || null, notify_new_lessons: next.notify_new_lessons });
      if (!result.ok) {
        setErrorCode(result.error);
        return false;
      }
      return true;
    } catch {
      setErrorCode('generic');
      return false;
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveName(event: React.FormEvent) {
    event.preventDefault();
    if (await save({ display_name: displayName, notify_new_lessons: notifyByEmail }, 'name')) {
      setSavedName(true);
      setTimeout(() => setSavedName(false), 2000);
    }
  }

  async function handleEmailToggle(checked: boolean) {
    setNotifyByEmail(checked);
    if (!(await save({ display_name: displayName, notify_new_lessons: checked }, 'email'))) {
      setNotifyByEmail(!checked);
    }
  }

  const cardClass = 'rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-5';

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-bold">{t('account.title')}</h1>

      {errorCode && (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {t.has(`errors.${errorCode}`) ? t(`errors.${errorCode}`) : t('errors.generic')}
        </div>
      )}

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('account.signedInAs')}</p>
            <bdi dir="ltr" className="block truncate text-sm font-medium">{email}</bdi>
          </div>
        </div>

        <form onSubmit={handleSaveName} className="space-y-2">
          <label htmlFor="display-name" className="block text-sm font-medium text-muted-foreground">
            {t('account.displayName')}
          </label>
          <div className="flex gap-2">
            <input
              id="display-name"
              value={displayName}
              maxLength={80}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t('account.displayNamePlaceholder')}
              className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={saving !== null}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving === 'name' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedName ? (
                <Check className="h-4 w-4" />
              ) : null}
              {savedName ? t('account.saved') : t('account.save')}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('account.syncNote')}</p>
      </section>

      <section className={`${cardClass} space-y-4`}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Bell className="h-4 w-4 text-primary" />
          {t('account.notificationsTitle')}
        </h2>
        <PushToggle />
        <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
          <p className="text-sm font-medium">{t('account.emailToggle')}</p>
          {saving === 'email' ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch checked={notifyByEmail} label={t('account.emailToggle')} onChange={handleEmailToggle} />
          )}
        </div>
      </section>

      {isAdmin && (
        <section className={`${cardClass} space-y-1`}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Shield className="h-4 w-4 text-primary" />
            {t('account.adminTitle')}
          </h2>
          {[
            { href: `/${locale}/admin`, label: t('account.adminDashboard') },
            { href: `/${locale}/admin/notifications`, label: t('account.adminNotifications') },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-[hsl(var(--surface-highlight))]"
            >
              {link.label}
              <ForwardChevron className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      )}

      <button
        type="button"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await signOutAndReset(`/${locale}`);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/50 px-4 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
      >
        {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        {t('account.signOut')}
      </button>
    </div>
  );
}
