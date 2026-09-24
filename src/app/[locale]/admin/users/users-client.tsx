'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUpNarrowWide,
  Loader2,
  Mail,
  MailX,
  Search,
  Shield,
  ShieldOff,
  Users,
} from 'lucide-react';
import {
  setUserAdminRole,
  setUserEmailNotifications,
  type AdminUserActionResult,
  type AdminUsersPage,
} from '@/actions/admin-users';
import { STATS_TIME_ZONE, USER_SORT_KEYS, type AdminUserRow, type UsersQuery } from '@/lib/admin-insights';

interface UsersClientProps {
  locale: string;
  data: AdminUsersPage;
}

export default function UsersClient({ locale, data }: UsersClientProps) {
  const t = useTranslations('adminUsers');
  const router = useRouter();
  const [navigating, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRTL = locale === 'he';
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;
  const intlLocale = isRTL ? 'he-IL' : 'en-US';
  const number = new Intl.NumberFormat(intlLocale);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, {
    timeZone: STATS_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : t('never'));
  const { query } = data;

  function hrefFor(patch: Partial<UsersQuery>) {
    const next = { ...query, page: 1, ...patch };
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.sort !== 'created') params.set('sort', next.sort);
    if (next.dir !== 'desc') params.set('dir', next.dir);
    if (next.page > 1) params.set('page', String(next.page));
    const search = params.toString();
    return `/${locale}/admin/users${search ? `?${search}` : ''}`;
  }

  function navigate(patch: Partial<UsersQuery>) {
    startTransition(() => router.push(hrefFor(patch)));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q');
    navigate({ q: typeof q === 'string' ? q.trim() : '' });
  }

  async function runAction(key: string, action: () => Promise<AdminUserActionResult>) {
    setBusyKey(key);
    setError(null);
    try {
      const result = await action();
      if (result.ok) startTransition(() => router.refresh());
      else setError(t(`errors.${result.error}`));
    } catch {
      setError(t('errors.failed'));
    } finally {
      setBusyKey(null);
    }
  }

  function toggleRole(user: AdminUserRow) {
    const makeAdmin = user.role !== 'admin';
    const name = user.displayName || user.email || user.id;
    if (!window.confirm(t(makeAdmin ? 'actions.confirmMakeAdmin' : 'actions.confirmRemoveAdmin', { name }))) return;
    void runAction(`${user.id}:role`, () => setUserAdminRole(user.id, makeAdmin));
  }

  function toggleEmail(user: AdminUserRow) {
    void runAction(`${user.id}:email`, () => setUserEmailNotifications(user.id, !user.notifyNewLessons));
  }

  function renderRole(user: AdminUserRow) {
    const isSelf = user.id === data.currentUserId;
    const busy = busyKey === `${user.id}:role`;
    const isRoleAdmin = user.role === 'admin';
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isRoleAdmin || user.envAdmin ? 'bg-primary/15 text-primary' : 'bg-border/40 text-muted-foreground'
          }`}
        >
          {user.envAdmin ? t('role.envAdmin') : t(isRoleAdmin ? 'role.admin' : 'role.user')}
          {isSelf && ` · ${t('role.you')}`}
        </span>
        <button
          type="button"
          onClick={() => toggleRole(user)}
          disabled={busy || (isSelf && isRoleAdmin)}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isRoleAdmin ? (
            <ShieldOff className="h-3.5 w-3.5" />
          ) : (
            <Shield className="h-3.5 w-3.5" />
          )}
          {t(isRoleAdmin ? 'actions.removeAdmin' : 'actions.makeAdmin')}
        </button>
      </div>
    );
  }

  function renderEmailToggle(user: AdminUserRow) {
    const busy = busyKey === `${user.id}:email`;
    const Icon = user.notifyNewLessons ? Mail : MailX;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={user.notifyNewLessons}
        aria-label={t('actions.toggleEmail')}
        title={t('actions.toggleEmail')}
        onClick={() => toggleEmail(user)}
        disabled={busy || !user.email}
        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          user.notifyNewLessons
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/50 text-muted-foreground hover:text-foreground'
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        {t(user.notifyNewLessons ? 'actions.emailOn' : 'actions.emailOff')}
      </button>
    );
  }

  function renderIdentity(user: AdminUserRow) {
    return (
      <div className="min-w-0">
        {user.displayName && (
          <p className="truncate font-medium text-foreground">
            <bdi>{user.displayName}</bdi>
          </p>
        )}
        <p className={`truncate ${user.displayName ? 'text-xs text-muted-foreground' : 'font-medium text-foreground'}`}>
          <bdi dir="ltr">{user.email ?? user.id}</bdi>
        </p>
      </div>
    );
  }

  const listened = (user: AdminUserRow) => t('minutes', { count: number.format(Math.round(user.listenedSeconds / 60)) });
  const SortIcon = query.dir === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <div>
        <Link
          href={`/${locale}/admin`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <BackArrow className="h-4 w-4" />
          <span>{t('back')}</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('subtitle')} · {t('count', { total: data.total })}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="relative flex-1" role="search">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            key={query.q}
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className="w-full rounded-lg border border-border/50 bg-[hsl(var(--surface-elevated))] py-2 pe-3 ps-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
        </form>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">{t('sortLabel')}</span>
            <select
              value={query.sort}
              onChange={(event) => navigate({ sort: event.target.value as UsersQuery['sort'] })}
              className="rounded-lg border border-border/50 bg-[hsl(var(--surface-elevated))] px-2 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            >
              {USER_SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`sort.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <Link
            href={hrefFor({ dir: query.dir === 'asc' ? 'desc' : 'asc' })}
            aria-label={t(`dir.${query.dir}`)}
            title={t(`dir.${query.dir}`)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors hover:text-foreground"
          >
            <SortIcon className="h-4 w-4" />
          </Link>
          {navigating && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {data.rows.length === 0 ? (
        <p className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-8 text-center text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <>
          {/* Cards on small screens */}
          <ul className="space-y-3 md:hidden">
            {data.rows.map((user) => (
              <li key={user.id} className="space-y-3 rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4">
                {renderIdentity(user)}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t('columns.joined')}</dt>
                    <dd className="text-foreground"><bdi>{formatDate(user.createdAt)}</bdi></dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('columns.lastSignIn')}</dt>
                    <dd className="text-foreground"><bdi>{formatDate(user.lastSignInAt)}</bdi></dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('columns.lastListen')}</dt>
                    <dd className="text-foreground"><bdi>{formatDate(user.lastListenAt)}</bdi></dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('columns.listened')}</dt>
                    <dd className="text-foreground">
                      {listened(user)} · {t('listens', { count: number.format(user.listens) })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('columns.push')}</dt>
                    <dd className="text-foreground">{t('pushDevices', { count: user.pushSubscriptions })}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
                  {renderRole(user)}
                  {renderEmailToggle(user)}
                </div>
              </li>
            ))}
          </ul>

          {/* Table from md up */}
          <div className="hidden overflow-x-auto rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t('columns.user')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('columns.joined')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('columns.lastSignIn')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('columns.lastListen')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('columns.listened')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('columns.email')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('columns.push')}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t('columns.role')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((user) => (
                  <tr key={user.id} className="border-b border-border/30 align-middle last:border-b-0">
                    <td className="max-w-[16rem] px-4 py-3">{renderIdentity(user)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground"><bdi>{formatDate(user.createdAt)}</bdi></td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground"><bdi>{formatDate(user.lastSignInAt)}</bdi></td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground"><bdi>{formatDate(user.lastListenAt)}</bdi></td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="text-foreground">{listened(user)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t('listens', { count: number.format(user.listens) })}
                      </span>
                    </td>
                    <td className="px-3 py-3">{renderEmailToggle(user)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {t('pushDevices', { count: user.pushSubscriptions })}
                    </td>
                    <td className="px-4 py-3">{renderRole(user)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data.pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label={t('pagination.page', { page: data.page, pageCount: data.pageCount })}>
          <PageLink href={data.page > 1 ? hrefFor({ page: data.page - 1 }) : null}>{t('pagination.previous')}</PageLink>
          <span className="text-muted-foreground">
            {t('pagination.page', { page: data.page, pageCount: data.pageCount })}
          </span>
          <PageLink href={data.page < data.pageCount ? hrefFor({ page: data.page + 1 }) : null}>{t('pagination.next')}</PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const className = 'rounded-lg border border-border/50 px-3 py-1.5';
  if (!href) return <span className={`${className} text-muted-foreground/40`}>{children}</span>;
  return (
    <Link href={href} className={`${className} text-foreground transition-colors hover:border-primary/40`}>
      {children}
    </Link>
  );
}
