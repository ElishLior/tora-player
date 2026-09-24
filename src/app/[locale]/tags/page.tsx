export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchTagCounts } from '@/lib/supabase/lesson-list';
import type { TagCount } from '@/lib/tag-links';
import TagsClient from './tags-client';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function TagsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  let tagCounts: TagCount[] = [];
  let failed = false;
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      tagCounts = await fetchTagCounts(supabase);
    } catch (error) {
      console.error('Failed to load tag counts:', error);
      failed = true;
    }
  }

  return <TagsClient tagCounts={tagCounts} loadFailed={failed} />;
}
