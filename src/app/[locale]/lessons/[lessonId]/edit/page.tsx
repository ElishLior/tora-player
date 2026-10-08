import { notFound, permanentRedirect } from 'next/navigation';
import { isSiteLocale } from '@/config/site';
import { lessonReadClient } from '@/lib/supabase/admin-lesson';
import { lessonRedirectUrl, resolveLessonRoute, type LessonSearchParams } from '@/lib/supabase/lesson-route';
import EditLessonClient from './edit-client';

export default async function EditLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; lessonId: string }>;
  searchParams: Promise<LessonSearchParams>;
}) {
  // The middleware guards admins. All client actions receive the resolved UUID.
  const { locale, lessonId } = await params;
  const route = await resolveLessonRoute(await lessonReadClient(), lessonId);
  if (route.kind === 'not-found') notFound();
  if (route.kind === 'redirect') {
    permanentRedirect(
      lessonRedirectUrl(`${route.pathname}/edit`, isSiteLocale(locale) ? locale : 'he', await searchParams),
    );
  }
  return <EditLessonClient lessonId={route.lessonId} />;
}
