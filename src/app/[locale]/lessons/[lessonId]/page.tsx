import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getLessonById } from '@/lib/supabase/queries';
import { notFound } from 'next/navigation';
import { formatDuration } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { ArrowRight, Calendar, Clock, Edit, Share2 } from 'lucide-react';
import { LessonPlayerClient } from './lesson-player-client';

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
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/lessons" className="rounded-full p-2 hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1" />
        <Link
          href={`/lessons/${lessonId}/edit`}
          className="rounded-full p-2 hover:bg-muted transition-colors"
        >
          <Edit className="h-5 w-5" />
        </Link>
        <button className="rounded-full p-2 hover:bg-muted transition-colors">
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* Lesson info */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold" dir="rtl">
          {lesson.hebrew_title || lesson.title}
        </h1>

        {lesson.series && (
          <Link
            href={`/series/${lesson.series.id}`}
            className="inline-block text-sm text-primary hover:underline"
          >
            {lesson.series.hebrew_name || lesson.series.name}
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(lesson.date).toLocaleDateString('he-IL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          {lesson.duration > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDuration(lesson.duration)}
            </span>
          )}
          {lesson.part_number && (
            <span className="rounded bg-muted px-2 py-0.5">
              {t('part')} {lesson.part_number}
            </span>
          )}
        </div>

        {lesson.description && (
          <p className="text-muted-foreground leading-relaxed" dir="rtl">
            {lesson.description}
          </p>
        )}
      </div>

      {/* Player */}
      {(lesson.audio_url || (lesson.audio_files && lesson.audio_files.length > 0)) && (
        <LessonPlayerClient lesson={lesson} />
      )}

      {/* Audio files list (when multiple) */}
      {lesson.audio_files && lesson.audio_files.length > 1 && (
        <section>
          <h2 className="text-lg font-bold mb-3">
            {locale === 'he' ? 'קבצי שמע' : 'Audio Files'}
          </h2>
          <div className="space-y-2">
            {lesson.audio_files
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((audio, index) => (
                <div
                  key={audio.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-sm" dir="rtl">
                        {audio.original_name || `${locale === 'he' ? 'חלק' : 'Part'} ${index + 1}`}
                      </p>
                      {audio.duration > 0 && (
                        <p className="text-xs text-muted-foreground">{formatDuration(audio.duration)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Multi-part links */}
      {lesson.parts && lesson.parts.length > 1 && (
        <section>
          <h2 className="text-lg font-bold mb-3">{t('parts')}</h2>
          <div className="space-y-2">
            {lesson.parts.map((part) => (
              <Link
                key={part.id}
                href={`/lessons/${part.id}`}
                className={`block rounded-lg border p-3 transition-colors ${
                  part.id === lessonId ? 'border-primary bg-primary/5' : 'hover:border-primary/30'
                }`}
              >
                <p className="font-medium" dir="rtl">
                  {t('part')} {part.part_number} - {part.hebrew_title || part.title}
                </p>
                {part.duration > 0 && (
                  <p className="text-xs text-muted-foreground">{formatDuration(part.duration)}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Snippets */}
      {lesson.snippets && lesson.snippets.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">{t('snippets')}</h2>
          <div className="space-y-2">
            {lesson.snippets.map((snippet) => (
              <div
                key={snippet.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium text-sm" dir="rtl">
                    {snippet.hebrew_title || snippet.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
          <h2 className="text-lg font-bold mb-3">
            {locale === 'he' ? 'סימניות' : 'Bookmarks'}
          </h2>
          <div className="space-y-2">
            {lesson.bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:border-primary/30 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm" dir="rtl">
                    {bm.note || formatDuration(bm.position)}
                  </p>
                </div>
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
