'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { loginAdmin } from '@/actions/auth';

export default function AdminLoginPage() {
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;
  const isRTL = locale === 'he';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await loginAdmin(password);

      if (result.success) {
        // Use full page navigation to ensure cookie is sent with the next request
        window.location.href = `/${locale}/admin`;
      } else {
        setError(result.error || (isRTL ? 'סיסמה שגויה' : 'Wrong password'));
      }
    } catch {
      setError(isRTL ? 'שגיאה בהתחברות' : 'Login error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-8 shadow-xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              {isRTL ? 'כניסת מנהל' : 'Admin Login'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isRTL ? 'הזן סיסמת מנהל כדי להמשיך' : 'Enter admin password to continue'}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-muted-foreground">
                {isRTL ? 'סיסמה' : 'Password'}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRTL ? 'הזן סיסמה...' : 'Enter password...'}
                  className="w-full rounded-lg border border-border/50 bg-background px-4 py-2.5 pr-11 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  autoFocus
                  required
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>{isRTL ? 'כניסה' : 'Login'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
