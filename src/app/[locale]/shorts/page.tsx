export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getShortLessons, type ShortLessons } from '@/lib/supabase/shorts';
import { tagFromSearchParam } from '@/lib/tag-links';
import ShortsClient from './shorts-client';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string | string[] }>;
};

export default async function ShortsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const initialTag = tagFromSearchParam((await searchParams).tag);
  setRequestLocale(locale);

  let shorts: ShortLessons = { lessons: [], topics: [] };
  let failed = false;
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      shorts = await getShortLessons(supabase);
    } catch (error) {
      console.error('Failed to load short lessons:', error);
      failed = true;
    }
  }

  return (
    <ShortsClient lessons={shorts.lessons} topics={shorts.topics} loadFailed={failed} initialTag={initialTag} />
  );
}
