import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getLessonById } from '@/lib/supabase/queries';
import { notFound } from 'next/navigation';
import { formatDuration } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { ArrowRight, Calendar, Clock, Edit, Play } from 'lucide-react';
import { LessonPlayerClient } from './lesson-player-client';
import { ShareButton } from '@/components/shared/share-button';

type Props = {
  params: Promise<{ locale: string; lessonId: string }>;
};

export default async function LessonDetailPage({ params }: Props) {
  const { locale, lessonId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('lessons');

  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  let lesson;
  try {
    lesson = await getLessonById(supabase, lessonId);
  } catch {
    notFound();
  }

  if (!lesson) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/lessons" className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1" />
        <Link
          href={`/lessons/${lessonId}/edit`}
          className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
        >
          <Edit className="h-5 w-5" />
        </Link>
        <ShareButton
          lessonId={lessonId}
          title={lesson.hebrew_title || lesson.title}
          seriesName={lesson.series?.hebrew_name || lesson.series?.name}
        />
      </div>

      {/* Hero section — Spotify episode style */}
      <div className="flex gap-4 items-start">
        {/* Artwork */}
        <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-lg flex-shrink-0 flex items-center justify-center shadow-xl"
          style={{
            background: 'linear-gradient(135deg, hsl(141 30% 18%) 0%, hsl(141 20% 8%) 100%)',
          }}
        >
          <span className="text-4xl sm:text-5xl">📖</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2 py-1">
          <h1 className="text-xl sm:text-2xl font-bold leading-tight" dir="rtl">
            {lesson.hebrew_title || lesson.title}
          </h1>

          {lesson.series && (
            <Link
              href={`/series/${lesson.series.id}`}
              className="inline-block text-sm font-semibold text-primary hover:underline"
              dir="rtl"
            >
              {lesson.series.hebrew_name || lesson.series.name}
            </Link>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(lesson.date).toLocaleDateString('he-IL', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            {lesson.duration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(lesson.duration)}
              </span>
            )}
            {lesson.part_number && (
              <span className="bg-[hsl(var(--surface-elevated))] px-2 py-0.5 rounded-full">
                {t('part')} {lesson.part_number}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {lesson.description && (
        <p className="text-sm text-muted-foreground leading-relaxed" dir="rtl">
          {lesson.description}
        </p>
      )}

      {/* Player */}
      {(lesson.audio_url || (lesson.audio_files && lesson.audio_files.length > 0)) && (
        <LessonPlayerClient lesson={lesson} />
      )}

      {/* Audio files list (tracklist style) */}
      {lesson.audio_files && lesson.audio_files.length > 1 && (
        <section>
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {locale === 'he' ? 'קבצי שמע' : 'Audio Files'}
          </h2>
          <div className="space-y-0.5">
            {lesson.audio_files
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((audio, index) => (
                <div
                  key={audio.id}
                  className="flex items-center gap-3 rounded-md p-2.5 hover:bg-[hsl(var(--surface-highlight))] transition-colors group"
                >
                  <span className="text-sm font-medium text-muted-foreground w-5 text-center group-hover:hidden">
                    {index + 1}
                  </span>
                  <Play className="h-4 w-4 text-foreground hidden group-hover:block w-5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" dir="rtl">
                      {audio.original_name || `${locale === 'he' ? 'חלק' : 'Part'} ${index + 1}`}
                    </p>
                  </div>
                  {audio.duration > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDuration(audio.duration)}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Multi-part links */}
      {lesson.parts && lesson.parts.length > 1 && (
        <section>
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {t('parts')}
          </h2>
          <div className="space-y-0.5">
            {lesson.parts.map((part) => (
              <Link
                key={part.id}
                href={`/lessons/${part.id}`}
                className={`block rounded-md p-2.5 transition-colors ${
                  part.id === lessonId
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-[hsl(var(--surface-highlight))]'
                }`}
              >
                <p className="font-medium text-sm" dir="rtl">
                  {t('part')} {part.part_number} - {part.hebrew_title || part.title}
                </p>
                {part.duration > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDuration(part.duration)}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Snippets */}
      {lesson.snippets && lesson.snippets.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {t('snippets')}
          </h2>
          <div className="space-y-0.5">
            {lesson.snippets.map((snippet) => (
              <div
                key={snippet.id}
                className="flex items-center justify-between rounded-md p-2.5 hover:bg-[hsl(var(--surface-highlight))] transition-colors cursor-pointer"
              >
                <div>
                  <p className="font-medium text-sm" dir="rtl">
                    {snippet.hebrew_title || snippet.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDuration(snippet.start_time)} - {formatDuration(snippet.end_time)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bookmarks */}
      {lesson.bookmarks && lesson.bookmarks.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {locale === 'he' ? 'סימניות' : 'Bookmarks'}
          </h2>
          <div className="space-y-0.5">
            {lesson.bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="flex items-center justify-between rounded-md p-2.5 hover:bg-[hsl(var(--surface-highlight))] transition-colors cursor-pointer"
              >
                <p className="font-medium text-sm" dir="rtl">
                  {bm.note || formatDuration(bm.position)}
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDuration(bm.position)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
