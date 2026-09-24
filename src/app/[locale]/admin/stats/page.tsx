import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Clock,
  Headphones,
  Timer,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { getAdminStats, type AdminStats, type TopLesson } from '@/actions/admin-stats';
import { STATS_PERIODS, STATS_TIME_ZONE, parseStatsPeriod } from '@/lib/admin-insights';
import { isAdmin } from '@/lib/auth/admin';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const panelClass = 'rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))]';

interface ChartPoint {
  day: string;
  value: number;
  tooltip: string;
}

/**
 * Daily bars as inline SVG (no chart library). Oldest day sits at the reading
 * start: right in Hebrew, left in English, matching the date labels below.
 */
function DailyBars({
  label,
  points,
  isRTL,
  formatDay,
}: {
  label: string;
  points: ChartPoint[];
  isRTL: boolean;
  formatDay: (day: string) => string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const slot = 10;
  const height = 100;
  return (
    <div>
      <svg
        viewBox={`0 0 ${points.length * slot} ${height}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={label}
      >
        <line x1={0} x2={points.length * slot} y1={height - 0.5} y2={height - 0.5} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => {
          const barHeight = (point.value / max) * (height - 4);
          const x = (isRTL ? points.length - 1 - index : index) * slot;
          return (
            <g key={point.day}>
              <title>{point.tooltip}</title>
              {/* Full-height hit area so small bars still show the tooltip. */}
              <rect x={x} y={0} width={slot} height={height} fill="transparent" />
              <rect
                x={x + slot * 0.15}
                y={height - barHeight}
                width={slot * 0.7}
                height={barHeight}
                rx={1.5}
                className="fill-primary/80"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/60">
        <bdi>{formatDay(points[0].day)}</bdi>
        <bdi>{formatDay(points[points.length - 1].day)}</bdi>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className={`${panelClass} p-4`}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-sm font-medium text-muted-foreground">{children}</h2>
    </div>
  );
}

export default async function AdminStatsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const days = parseStatsPeriod((await searchParams).days);
  if (!(await isAdmin())) redirect(`/${locale}/admin/login?from=/${locale}/admin/stats`);

  const t = await getTranslations('adminStats');
  const isRTL = locale === 'he';
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;
  const intlLocale = isRTL ? 'he-IL' : 'en-US';
  const number = new Intl.NumberFormat(intlLocale);
  const decimal = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });
  const dayLabel = new Intl.DateTimeFormat(intlLocale, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const formatDay = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));
  const signupDate = new Intl.DateTimeFormat(intlLocale, {
    timeZone: STATS_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const minutes = (seconds: number) => number.format(Math.round(seconds / 60));

  let stats: AdminStats;
  try {
    stats = await getAdminStats(days);
  } catch (error) {
    console.error('[admin-stats] load failed:', error);
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-400">
            {t('error', { message: error instanceof Error ? error.message : String(error) })}
          </p>
        </div>
      </div>
    );
  }

  const topLists: { title: string; icon: LucideIcon; lessons: TopLesson[]; metric: (lesson: TopLesson) => string }[] = [
    {
      title: t('top.byListens'),
      icon: Trophy,
      lessons: stats.topByListens,
      metric: (lesson) => t('top.listens', { count: number.format(lesson.listens) }),
    },
    {
      title: t('top.byMinutes'),
      icon: Timer,
      lessons: stats.topByMinutes,
      metric: (lesson) => t('top.minutes', { count: minutes(lesson.listenedSeconds) }),
    },
  ];

  const countCharts = [
    { title: t('charts.signups'), icon: UserPlus, series: stats.signupsPerDay },
    { title: t('charts.push'), icon: Bell, series: stats.pushPerDay },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-8">
      <div>
        <Link
          href={`/${locale}/admin`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <BackArrow className="h-4 w-4" />
          <span>{t('back')}</span>
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
              <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>

          <nav aria-label={t('periodLabel')} className="flex rounded-lg border border-border/50 p-0.5">
            {STATS_PERIODS.map((period) => (
              <Link
                key={period}
                href={`/${locale}/admin/stats?days=${period}`}
                aria-current={period === days ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  period === days
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('period', { days: period })}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-3 text-xs text-muted-foreground/70">{t('trackingNote')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Headphones} label={t('kpi.listens')} value={number.format(stats.listens.total)} />
        <StatCard
          icon={Users}
          label={t('kpi.listeners')}
          value={number.format(stats.listens.listeners)}
          hint={t('kpi.listenersHint', { count: number.format(stats.listens.signedInListeners) })}
        />
        <StatCard icon={Clock} label={t('kpi.hours')} value={decimal.format(stats.listens.listenedSeconds / 3600)} />
        <StatCard
          icon={UserPlus}
          label={t('kpi.signups')}
          value={number.format(stats.audience.usersNew)}
          hint={t('kpi.signupsHint', { count: number.format(stats.audience.usersTotal) })}
        />
        <StatCard
          icon={Bell}
          label={t('kpi.push')}
          value={number.format(stats.audience.pushTotal)}
          hint={t('kpi.pushHint', { count: number.format(stats.audience.pushNew) })}
        />
        <StatCard
          icon={BookOpen}
          label={t('kpi.lessons')}
          value={number.format(stats.content.lessons)}
          hint={t('kpi.lessonsHint', { count: number.format(stats.content.publishedLessons) })}
        />
      </div>

      <section>
        <SectionTitle icon={Activity}>{t('active.title')}</SectionTitle>
        <div className={`${panelClass} grid grid-cols-3 divide-x divide-border/40 rtl:divide-x-reverse`}>
          {[
            { label: t('active.day'), value: stats.activeListeners.day },
            { label: t('active.week'), value: stats.activeListeners.week },
            { label: t('active.month'), value: stats.activeListeners.month },
          ].map((item) => (
            <div key={item.label} className="p-4 text-center">
              <p className="text-xl font-bold tabular-nums text-foreground">{number.format(item.value)}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle icon={Headphones}>{t('charts.listens')}</SectionTitle>
        <div className={`${panelClass} p-4`}>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('charts.total', { count: number.format(stats.listens.total) })}
          </p>
          <DailyBars
            label={t('charts.listens')}
            isRTL={isRTL}
            formatDay={formatDay}
            points={stats.listensPerDay.map((row) => ({
              day: row.day,
              value: row.listens,
              tooltip: t('charts.listensTooltip', {
                date: formatDay(row.day),
                listens: number.format(row.listens),
                listeners: number.format(row.listeners),
              }),
            }))}
          />
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        {countCharts.map((chart) => (
          <section key={chart.title}>
            <SectionTitle icon={chart.icon}>{chart.title}</SectionTitle>
            <div className={`${panelClass} p-4`}>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('charts.total', { count: number.format(chart.series.reduce((sum, row) => sum + row.count, 0)) })}
              </p>
              <DailyBars
                label={chart.title}
                isRTL={isRTL}
                formatDay={formatDay}
                points={chart.series.map((row) => ({
                  day: row.day,
                  value: row.count,
                  tooltip: t('charts.countTooltip', { date: formatDay(row.day), count: number.format(row.count) }),
                }))}
              />
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {topLists.map((list) => (
          <section key={list.title}>
            <SectionTitle icon={list.icon}>{list.title}</SectionTitle>
            <div className={`${panelClass} overflow-hidden`}>
              {list.lessons.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">{t('top.empty')}</p>
              ) : (
                <ol>
                  {list.lessons.map((lesson, index) => (
                    <li key={lesson.lessonId} className="border-b border-border/30 last:border-b-0">
                      <Link
                        href={`/${locale}/lessons/${lesson.lessonId}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[hsl(var(--surface-highlight))]"
                      >
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium tabular-nums text-primary">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            <bdi>{lesson.hebrewTitle || lesson.title}</bdi>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t('top.listeners', { count: number.format(lesson.listeners) })}
                          </p>
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                          {list.metric(lesson)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        ))}
      </div>

      <section>
        <SectionTitle icon={UserPlus}>{t('recentSignups.title')}</SectionTitle>
        <div className={`${panelClass} overflow-hidden`}>
          {stats.recentSignups.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('recentSignups.empty')}</p>
          ) : (
            <ul>
              {stats.recentSignups.map((signup) => (
                <li
                  key={signup.userId}
                  className="flex items-center justify-between gap-3 border-b border-border/30 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    {signup.displayName && (
                      <p className="truncate text-sm font-medium text-foreground">
                        <bdi>{signup.displayName}</bdi>
                      </p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {signup.email ? <bdi dir="ltr">{signup.email}</bdi> : t('recentSignups.noEmail')}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    <bdi>{signupDate.format(new Date(signup.createdAt))}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <SectionTitle icon={BookOpen}>{t('content.title')}</SectionTitle>
        <div className={`${panelClass} p-4`}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { label: t('content.audioFiles'), value: stats.content.audioFiles },
              { label: t('content.images'), value: stats.content.images },
              { label: t('content.series'), value: stats.content.series },
              { label: t('content.bookmarks'), value: stats.content.bookmarks },
              { label: t('content.emailOptIn'), value: stats.audience.emailOptIn },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">{number.format(item.value)}</dd>
              </div>
            ))}
          </dl>
          {stats.completion.tracked > 0 && (
            <div className="mt-4 border-t border-border/40 pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                {t('content.completion', {
                  completed: number.format(stats.completion.completed),
                  tracked: number.format(stats.completion.tracked),
                })}
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-border/50">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((stats.completion.completed / stats.completion.tracked) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
