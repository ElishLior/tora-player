export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedTagCounts } from '@/lib/supabase/anon';
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
  if (isSupabaseConfigured()) {
    try {
      tagCounts = await getCachedTagCounts();
    } catch (error) {
      console.error('Failed to load tag counts:', error);
      failed = true;
    }
  }

  return <TagsClient tagCounts={tagCounts} loadFailed={failed} />;
}
