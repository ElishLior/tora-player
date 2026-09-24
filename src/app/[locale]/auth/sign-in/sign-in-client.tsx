'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, KeyRound, Loader2, Mail, UserRound } from 'lucide-react';
import { sendSignInCode, startGoogleSignIn, verifySignInCode } from '@/actions/auth';

interface SignInClientProps {
  locale: string;
  /** Same-origin path to open after signing in (already validated on the server). */
  next: string;
  initialError: string | null;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.27a12 12 0 0 0 0 10.8l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.27 6.6l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

export function SignInClient({ locale, next, initialError }: SignInClientProps) {
  const t = useTranslations('auth');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<'google' | 'send' | 'verify' | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(initialError);

  const errorMessage = errorCode
    ? t.has(`errors.${errorCode}`) ? t(`errors.${errorCode}`) : t('errors.generic')
    : null;

  async function handleGoogle() {
    setPending('google');
    setErrorCode(null);
    try {
      const result = await startGoogleSignIn(locale, next);
      if ('url' in result) {
        window.location.assign(result.url);
        return;
      }
      setErrorCode(result.error);
    } catch {
      setErrorCode('generic');
    }
    setPending(null);
  }

  async function handleSendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setPending('send');
    setErrorCode(null);
    try {
      const result = await sendSignInCode(email, locale, next);
      if (result.ok) {
        setStep('code');
        setCode('');
      } else {
        setErrorCode(result.error);
      }
    } catch {
      setErrorCode('generic');
    } finally {
      setPending(null);
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setPending('verify');
    setErrorCode(null);
    try {
      const result = await verifySignInCode(email, code);
      if (result.ok) {
        // Full navigation so the header, account sync and cached pages see the new session.
        window.location.assign(next);
        return;
      }
      setErrorCode(result.error);
    } catch {
      setErrorCode('generic');
    }
    setPending(null);
  }

  const inputClass =
    'w-full rounded-lg border border-border/50 bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
  const primaryButtonClass =
    'flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <UserRound className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('signIn.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('signIn.subtitle')}</p>
        </div>

        {errorMessage && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {step === 'email' ? (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={pending !== null}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-border/60 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50"
            >
              {pending === 'google' ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
              <span>{t('signIn.google')}</span>
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border/60" />
              {t('signIn.or')}
              <span className="h-px flex-1 bg-border/60" />
            </div>

            <form onSubmit={handleSendCode} className="space-y-3">
              <label htmlFor="sign-in-email" className="block text-sm font-medium text-muted-foreground">
                {t('signIn.emailLabel')}
              </label>
              <input
                id="sign-in-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                className={`${inputClass} text-start`}
              />
              <button type="submit" disabled={pending !== null || !email} className={primaryButtonClass}>
                {pending === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                <span>{t('signIn.sendCode')}</span>
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleVerify} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('signIn.codeSentTo')}{' '}
              <bdi dir="ltr" className="font-medium text-foreground">{email}</bdi>
            </p>
            <label htmlFor="sign-in-code" className="block text-sm font-medium text-muted-foreground">
              {t('signIn.codeLabel')}
            </label>
            <input
              id="sign-in-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              dir="ltr"
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
            />
            <button type="submit" disabled={pending !== null || code.length < 6} className={primaryButtonClass}>
              {pending === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              <span>{t('signIn.verify')}</span>
            </button>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('signIn.linkHint')}</p>
            <div className="flex items-center justify-between gap-3 pt-1 text-xs">
              <button
                type="button"
                onClick={() => handleSendCode()}
                disabled={pending !== null}
                className="text-primary hover:underline disabled:opacity-50"
              >
                {t('signIn.resend')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setErrorCode(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                {t('signIn.changeEmail')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
