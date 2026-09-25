import { Suspense, cache } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { lessonReadClient } from '@/lib/supabase/admin-lesson';
import { getLessonById } from '@/lib/supabase/queries';
import { notFound } from 'next/navigation';
import { formatDuration } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { ArrowRight, Calendar, Clock, Edit, MapPin, User, BookOpen, Hash } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { ShareButton } from '@/components/shared/share-button';
import { LessonPlayerClient, LessonTags } from './lesson-player-client';
import { JsonLd } from '@/components/seo/json-ld';
import { OG_LOCALE, SITE_NAME, categoryPath, isSiteLocale, lessonPath, pageUrl } from '@/config/site';
import { breadcrumbJsonLd, lessonDescription, lessonJsonLd, pageAlternates } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string; lessonId: string }>;
};

/**
 * One lesson read per request, shared by generateMetadata and the page. Admins
 * read with the service role so drafts open (lessonReadClient); null when the
 * lesson is missing or hidden.
 */
const loadLesson = cache(async (lessonId: string) => {
  try {
    return await getLessonById(await lessonReadClient(), lessonId);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, lessonId } = await params;
  const lesson = await loadLesson(lessonId);
  if (!lesson) return {};
  const title = lesson.hebrew_title || lesson.title;
  const description = lessonDescription(lesson);
  const pathname = lessonPath(lesson.id);
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

export default async function LessonDetailPage({ params }: Props) {
  const { locale, lessonId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('lessons');

  const lesson = await loadLesson(lessonId);
  if (!lesson) notFound();

  const admin = await isAdmin();
  const hasAudio = lesson.audio_url || (lesson.audio_files && lesson.audio_files.length > 0);
  const hasImages = lesson.images && lesson.images.length > 0;
  const hasParts = lesson.parts && lesson.parts.length > 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <JsonLd
        data={[
          lessonJsonLd(lesson),
          breadcrumbJsonLd([
            { name: SITE_NAME.he, pathname: '/' },
            ...(lesson.category ? [{ name: lesson.category.hebrew_name, pathname: categoryPath(lesson.category.id) }] : []),
            { name: lesson.hebrew_title || lesson.title, pathname: lessonPath(lesson.id) },
          ]),
        ]}
      />
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/lessons" className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1" />
        {admin && (
          <Link
            href={`/lessons/${lessonId}/edit`}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
            aria-label="Edit"
          >
            <Edit className="h-5 w-5" />
          </Link>
        )}
        <ShareButton
          lessonId={lessonId}
          title={lesson.hebrew_title || lesson.title}
          seriesName={lesson.series?.hebrew_name || lesson.series?.name}
        />
      </div>

      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-xl font-bold" dir="auto">
          {lesson.hebrew_title || lesson.title}
        </h1>
        <LessonTags lessonId={lesson.id} tags={lesson.tags ?? []} admin={admin} />
        {lesson.series && (
          <Link
            href={`/lessons?series=${lesson.series.id}`}
            className="inline-block text-sm text-primary hover:underline"
            dir="auto"
          >
            {lesson.series.hebrew_name || lesson.series.name}
          </Link>
        )}
      </div>

      {/* Metadata pills */}
      <div className="flex flex-wrap gap-2">
        {lesson.parsha && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
            <BookOpen className="h-3.5 w-3.5" />
            {lesson.parsha}
          </span>
        )}
        {lesson.hebrew_date && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {lesson.hebrew_date}
          </span>
        )}
        {lesson.date && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {lesson.date}
          </span>
        )}
        {lesson.duration > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(lesson.duration)}
          </span>
        )}
        {lesson.teacher && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {lesson.teacher}
          </span>
        )}
        {lesson.location && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {lesson.location}
          </span>
        )}
        {lesson.seder_number && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            {locale === 'he' ? `סדר ${lesson.seder_number}` : `Order ${lesson.seder_number}`}
          </span>
        )}
      </div>

      {/* Description / Summary */}
      {(lesson.description || lesson.summary) && (
        <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-4">
          <h2 className="text-sm font-bold mb-2 text-muted-foreground">
            {locale === 'he' ? 'תיאור השיעור' : 'Description'}
          </h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" dir="auto">
            {lesson.description || lesson.summary}
          </p>
        </div>
      )}

      {/* Player + Audio files + Image gallery (all inlined in one client component to avoid webpack dev chunk issue) */}
      {/* Suspense needed because LessonPlayerClient uses useSearchParams for clip mode */}
      {(hasAudio || hasImages) && (
        <Suspense fallback={null}>
          <LessonPlayerClient lesson={lesson} images={hasImages ? lesson.images : undefined} />
        </Suspense>
      )}

      {/* Multi-part links */}
      {hasParts && (
        <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-4">
          <h2 className="text-sm font-bold mb-3 text-muted-foreground">
            {locale === 'he' ? 'חלקים' : 'Parts'}
          </h2>
          <div className="space-y-1">
            {lesson.parts!.map((part) => (
              <Link
                key={part.id}
                href={`/lessons/${part.id}`}
                className={`block rounded-md p-2.5 text-sm transition-colors ${
                  part.id === lesson.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-[hsl(var(--surface-highlight))]'
                }`}
              >
                {part.part_number ? `${locale === 'he' ? 'חלק' : 'Part'} ${part.part_number}` : (part.hebrew_title || part.title)}
                {part.duration > 0 && (
                  <span className="text-xs text-muted-foreground mr-2">
                    {formatDuration(part.duration)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Snippets */}
      {lesson.snippets && lesson.snippets.length > 0 && (
        <div>
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {locale === 'he' ? 'קטעים נבחרים' : 'Snippets'}
          </h2>
          <div className="space-y-2">
            {lesson.snippets.map((snippet) => (
              <div key={snippet.id} className="rounded-xl bg-[hsl(var(--surface-elevated))] p-4">
                {snippet.title && (
                  <h3 className="text-sm font-bold mb-1" dir="auto">{snippet.title}</h3>
                )}
                {snippet.hebrew_title && snippet.hebrew_title !== snippet.title && (
                  <p className="text-sm text-muted-foreground leading-relaxed" dir="auto">{snippet.hebrew_title}</p>
                )}
                {snippet.start_time > 0 && (
                  <p className="text-xs text-primary mt-2">
                    {formatDuration(snippet.start_time)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
