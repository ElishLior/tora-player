import { Suspense, cache } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { lessonReadClient } from '@/lib/supabase/admin-lesson';
import { getLessonById } from '@/lib/supabase/queries';
import { lessonRedirectUrl, resolveLessonRoute, type LessonSearchParams } from '@/lib/supabase/lesson-route';
import { notFound, permanentRedirect } from 'next/navigation';
import { cn, formatDuration } from '@/lib/utils';
import { parshaLabel } from '@/lib/parsha-label';
import { Link } from '@/i18n/routing';
import { ArrowRight, Calendar, Clock, Edit, MapPin, User, BookOpen, Hash } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { LessonPlayerClient, LessonTags } from './lesson-player-client';
import { JsonLd } from '@/components/seo/json-ld';
import { DEFAULT_LOCALE, OG_LOCALE, SITE_NAME, categoryPath, isSiteLocale, lessonPath, pageUrl, seriesPath } from '@/config/site';
import { categoryLabel, findCategory } from '@/lib/category-tree';
import { categorySelectionFor } from '@/lib/lesson-categories';
import { readLessonCategoryIds } from '@/lib/supabase/lesson-category-writes';
import { breadcrumbJsonLd, lessonDescription, lessonJsonLd, pageAlternates } from '@/lib/seo';
import { lessonsHref } from '@/lib/tag-links';
import { getCachedCategoriesTree } from '@/lib/supabase/anon';

type Props = {
  params: Promise<{ locale: string; lessonId: string }>;
  searchParams: Promise<LessonSearchParams>;
};

/**
 * Desktop body (xl+): the main column (player, part list, notes) and the side column (description,
 * category, gallery). Below xl both columns are `contents`, so the phone order is set by `order-*`
 * classes on their children. The same classes live in lesson-player-client.tsx for the player branch.
 */
const MAIN_COLUMN = 'contents xl:block xl:col-start-1 xl:row-start-2 xl:min-w-0 xl:space-y-4';
const SIDE_COLUMN = 'contents xl:sticky xl:top-16 xl:block xl:col-start-2 xl:row-start-2 xl:min-w-0 xl:self-start xl:space-y-4';

/**
 * One cached route/detail lookup per request, shared by generateMetadata and the page. Admins
 * read with the service role so drafts open (lessonReadClient); null when the
 * lesson is missing or hidden.
 */
const loadLesson = cache(async (lessonId: string) => {
  try {
    const client = await lessonReadClient();
    const route = await resolveLessonRoute(client, lessonId);
    if (route.kind === 'not-found') return null;
    const lesson = await getLessonById(client, route.lessonId);
    // Every category of the lesson (migration 026). A missing table (null) falls back to the primary.
    // A failed read is kept apart: the admin editor would otherwise save over the hidden categories.
    let memberships: string[] | null = null;
    let membershipsReadFailed = false;
    try {
      memberships = await readLessonCategoryIds(client, route.lessonId);
    } catch {
      membershipsReadFailed = true;
    }
    return { route, lesson, categoryIds: categorySelectionFor(memberships, lesson.category_id), membershipsReadFailed };
  } catch {
    return null;
  }
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, lessonId } = await params;
  const loaded = await loadLesson(lessonId);
  if (!loaded) notFound();
  const { lesson, route } = loaded;
  if (route.kind === 'redirect') {
    permanentRedirect(lessonRedirectUrl(route.pathname, isSiteLocale(locale) ? locale : 'he', await searchParams));
  }
  const title = lesson.hebrew_title || lesson.title;
  const description = lessonDescription(lesson);
  const pathname = lessonPath(lesson);
  return {
    title,
    description,
    alternates: pageAlternates(pathname),
    // Images come from ./opengraph-image.tsx.
    openGraph: {
      type: 'music.song',
      url: pageUrl(pathname),
      title,
      description,
      siteName: SITE_NAME.he,
      locale: OG_LOCALE[isSiteLocale(locale) ? locale : 'he'],
      ...(lesson.duration > 0 && { duration: Math.round(lesson.duration) }),
    },
  };
}

export default async function LessonDetailPage({ params, searchParams }: Props) {
  const { locale, lessonId } = await params;
  setRequestLocale(locale);
  const browseT = await getTranslations('lessonBrowse');
  const pageT = await getTranslations('lessonPage');

  const loaded = await loadLesson(lessonId);
  if (!loaded) notFound();
  const { lesson, route, categoryIds, membershipsReadFailed } = loaded;
  if (route.kind === 'redirect') {
    permanentRedirect(lessonRedirectUrl(route.pathname, isSiteLocale(locale) ? locale : 'he', await searchParams));
  }

  const admin = await isAdmin();
  // The tree names the lesson's categories and feeds the admin picker. A failed read shows the primary category only.
  const tree = await getCachedCategoriesTree().catch(() => []);
  const categories = admin && !membershipsReadFailed ? tree : undefined;
  const named = categoryIds
    .map((id) => findCategory(tree, id))
    .filter((category) => category !== undefined);
  const shownCategories: { id: string; label: string }[] =
    named.length > 0
      ? named.map((category) => ({ id: category.id, label: categoryLabel(category, locale) }))
      : lesson.category
        ? [{ id: lesson.category.id, label: categoryLabel(lesson.category, locale) }]
        : [];
  const hasAudio = lesson.audio_url || (lesson.audio_files && lesson.audio_files.length > 0);
  const hasImages = lesson.images && lesson.images.length > 0;
  const hasParts = lesson.parts && lesson.parts.length > 1;
  const hasSnippets = Boolean(lesson.snippets && lesson.snippets.length > 0);
  const hasDescription = Boolean(lesson.description || lesson.summary);

  // Side column (xl): description, then the category links (desktop only; phones show them in the header tools).
  const sideContent =
    hasDescription || shownCategories.length > 0 ? (
      <>
        {hasDescription && (
          <div className="order-1 mb-2 rounded-xl bg-[hsl(var(--surface-elevated))] p-4 xl:mb-0">
            <h2 className="mb-2 text-sm font-bold text-muted-foreground">
              {locale === 'he' ? 'תיאור השיעור' : 'Description'}
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
              {lesson.description || lesson.summary}
            </p>
          </div>
        )}
        {shownCategories.length > 0 && (
          <div className="hidden rounded-xl bg-[hsl(var(--surface-elevated))] p-4 xl:block">
            <h2 className="mb-2 text-sm font-bold text-muted-foreground">{pageT('category')}</h2>
            <ul className="space-y-1">
              {shownCategories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={categoryPath(category.id)}
                    className="inline-block max-w-full rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    dir="auto"
                  >
                    {category.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    ) : null;

  // Main column, after the notes: multi-part links and snippets.
  const mainContent =
    hasParts || hasSnippets ? (
      <>
        {hasParts && (
          <div className="order-6 mt-2 rounded-xl bg-[hsl(var(--surface-elevated))] p-4 xl:mt-0">
            <h2 className="mb-3 text-sm font-bold text-muted-foreground">{locale === 'he' ? 'חלקים' : 'Parts'}</h2>
            <div className="space-y-1">
              {lesson.parts!.map((part) => (
                <Link
                  key={part.id}
                  href={lessonPath(part)}
                  className={`block rounded-md p-2.5 text-sm transition-colors ${
                    part.id === lesson.id
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'hover:bg-[hsl(var(--surface-highlight))]'
                  }`}
                >
                  {part.part_number
                    ? `${locale === 'he' ? 'חלק' : 'Part'} ${part.part_number}`
                    : part.hebrew_title || part.title}
                  {part.duration > 0 && (
                    <span className="mr-2 text-xs text-muted-foreground">{formatDuration(part.duration)}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {hasSnippets && (
          <div className="order-7 mt-2 xl:mt-0">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {locale === 'he' ? 'קטעים נבחרים' : 'Snippets'}
            </h2>
            <div className="space-y-2">
              {lesson.snippets!.map((snippet) => (
                <div key={snippet.id} className="rounded-xl bg-[hsl(var(--surface-elevated))] p-4">
                  {snippet.title && (
                    <h3 className="mb-1 text-sm font-bold" dir="auto">
                      {snippet.title}
                    </h3>
                  )}
                  {snippet.hebrew_title && snippet.hebrew_title !== snippet.title && (
                    <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">
                      {snippet.hebrew_title}
                    </p>
                  )}
                  {snippet.start_time > 0 && (
                    <p className="mt-2 text-xs text-primary">{formatDuration(snippet.start_time)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    ) : null;

  // Two columns from xl only when there is a side column; otherwise the body is one full-width column.
  const hasSideColumn = Boolean(sideContent) || Boolean(hasImages);

  return (
    <div
      className={cn(
        'animate-fade-in mx-auto flex max-w-2xl flex-col gap-4 xl:grid xl:max-w-[1680px] xl:gap-x-8 xl:gap-y-6',
        hasSideColumn ? 'xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)]',
      )}
    >
      <JsonLd
        data={[
          lessonJsonLd(lesson),
          breadcrumbJsonLd([
            { name: SITE_NAME.he, pathname: '/' },
            ...(lesson.category
              ? [{ name: categoryLabel(lesson.category, DEFAULT_LOCALE), pathname: categoryPath(lesson.category.id) }]
              : []),
            { name: lesson.hebrew_title || lesson.title, pathname: lessonPath(lesson) },
          ]),
        ]}
      />

      {/* Header band: phones stack it; from xl the title, series and tags share a row and the pills wrap below */}
      <div className="mb-2 mt-6 space-y-6 xl:col-span-full xl:mb-0 xl:mt-0 xl:space-y-3">
        <div className="flex items-center gap-3">
          <Link
            href="/lessons"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-highlight))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="flex-1" />
          {admin && (
            <Link
              href={`${lessonPath(lesson)}/edit`}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-highlight))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              aria-label={pageT('edit')}
            >
              <Edit className="h-5 w-5" />
            </Link>
          )}
        </div>

        <div className="space-y-2 xl:flex xl:flex-wrap xl:items-center xl:gap-x-4 xl:gap-y-2 xl:space-y-0">
          <h1 className="text-xl font-bold xl:text-2xl" dir="auto">
            {lesson.hebrew_title || lesson.title}
          </h1>
          <LessonTags
            lessonId={lesson.id}
            tags={lesson.tags ?? []}
            admin={admin}
            categoryIds={categoryIds}
            categories={categories}
          />
          {lesson.series && (
            <Link
              href={seriesPath(lesson.series.id)}
              className="inline-block rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              dir="auto"
            >
              {lesson.series.hebrew_name || lesson.series.name}
            </Link>
          )}
        </div>

        {/* Metadata pills */}
        <div className="flex flex-wrap gap-2">
          {lesson.parsha && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary xl:text-sm">
              <BookOpen className="h-3.5 w-3.5" />
              {parshaLabel(lesson.parsha)}
            </span>
          )}
          {lesson.hebrew_date && (
            <Link
              href={lessonsHref({ date: lesson.date })}
              aria-label={browseT('dateLink', { date: `${lesson.hebrew_date} (${lesson.date})` })}
              data-lesson-date={lesson.date}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 xl:min-h-8 xl:text-sm"
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <bdi className="break-words">{lesson.hebrew_date}</bdi>
            </Link>
          )}
          {lesson.date && (
            <Link
              href={lessonsHref({ date: lesson.date })}
              aria-label={browseT('dateLink', { date: lesson.date })}
              data-lesson-date={lesson.date}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 xl:min-h-8 xl:text-sm"
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              <bdi>{lesson.date}</bdi>
            </Link>
          )}
          {lesson.duration > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground xl:text-sm">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(lesson.duration)}
            </span>
          )}
          {lesson.teacher && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground xl:text-sm">
              <User className="h-3.5 w-3.5" />
              {lesson.teacher}
            </span>
          )}
          {lesson.location && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground xl:text-sm">
              <MapPin className="h-3.5 w-3.5" />
              {lesson.location}
            </span>
          )}
          {/* Category: a pill with the other details on phones; on xl it sits in the side column */}
          {shownCategories.map((category) => (
            <Link
              key={category.id}
              href={categoryPath(category.id)}
              className="inline-flex min-h-11 max-w-full items-center rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 xl:hidden"
            >
              <bdi className="break-words">{category.label}</bdi>
            </Link>
          ))}
          {lesson.seder_number && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground xl:text-sm">
              <Hash className="h-3.5 w-3.5" />
              {locale === 'he' ? `סדר ${lesson.seder_number}` : `Order ${lesson.seder_number}`}
            </span>
          )}
        </div>
      </div>

      {/* Body: player, part list and notes (main column) with the gallery and description (side column).
          Player + gallery come from LessonPlayerClient (one client component per page); without audio or
          images the page renders the two columns itself. */}
      {/* Suspense needed because LessonPlayerClient uses useSearchParams for clip mode */}
      {hasAudio || hasImages ? (
        <Suspense fallback={null}>
          <LessonPlayerClient
            lesson={lesson}
            images={hasImages ? lesson.images : undefined}
            sideSlot={sideContent}
            mainSlot={mainContent}
          />
        </Suspense>
      ) : (
        <>
          {mainContent && <div className={MAIN_COLUMN}>{mainContent}</div>}
          {sideContent && <div className={SIDE_COLUMN}>{sideContent}</div>}
        </>
      )}
    </div>
  );
}
