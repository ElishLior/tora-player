'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertCircle, Eye, EyeOff, Lock, LogIn, UserRound } from 'lucide-react';
import { loginAdmin } from '@/actions/auth';
import { signOutAndReset } from '@/lib/account/sync';

interface AdminLoginClientProps {
  locale: string;
  /** Validated same-origin path to open after login. */
  next: string;
  /** Email of a signed-in account that is not an admin, if any. */
  signedInEmail: string | null;
  passwordEnabled: boolean;
}

export function AdminLoginClient({ locale, next, signedInEmail, passwordEnabled }: AdminLoginClientProps) {
  const t = useTranslations('auth');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const signInHref = `/${locale}/auth/sign-in?next=${encodeURIComponent(next)}`;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorCode(null);
    setLoading(true);
    try {
      const result = await loginAdmin(password);
      if (result.success) {
        // Full navigation so the new session cookie is sent with the next request.
        window.location.href = next;
        return;
      }
      setErrorCode(result.error ?? 'generic');
    } catch {
      setErrorCode('generic');
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('adminLogin.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('adminLogin.subtitle')}</p>
        </div>

        {errorCode && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t.has(`errors.${errorCode}`) ? t(`errors.${errorCode}`) : t('errors.generic')}</span>
          </div>
        )}

        {signedInEmail ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('adminLogin.notAdmin')}{' '}
              <bdi dir="ltr" className="font-medium text-foreground">{signedInEmail}</bdi>
            </p>
            <button
              type="button"
              onClick={() => signOutAndReset(signInHref)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <UserRound className="h-4 w-4" />
              {t('adminLogin.switchAccount')}
            </button>
          </div>
        ) : (
          <Link
            href={signInHref}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <UserRound className="h-4 w-4" />
            {t('adminLogin.accountButton')}
          </Link>
        )}

        {passwordEnabled && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3 border-t border-border/40 pt-5">
            <p className="text-xs font-medium text-muted-foreground">{t('adminLogin.passwordTitle')}</p>
            <label htmlFor="admin-password" className="sr-only">
              {t('adminLogin.passwordLabel')}
            </label>
            <div className="relative" dir="ltr">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('adminLogin.passwordPlaceholder')}
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-border/50 bg-background py-2.5 pe-12 ps-4 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('adminLogin.hidePassword') : t('adminLogin.showPassword')}
                className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 px-4 py-2.5 text-sm font-semibold hover:bg-[hsl(var(--surface-highlight))] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {t('adminLogin.login')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
