export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getShortLessons, type ShortLessons } from '@/lib/supabase/shorts';
import ShortsClient from './shorts-client';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ShortsPage({ params }: Props) {
  const { locale } = await params;
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

  return <ShortsClient lessons={shorts.lessons} topics={shorts.topics} loadFailed={failed} />;
}
