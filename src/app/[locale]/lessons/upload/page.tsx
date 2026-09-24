import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCategoriesTree } from '@/lib/supabase/queries';
import type { CategoryWithChildren } from '@/types/database';
import DailyUploadClient from './daily-upload-client';

type Props = {
  params: Promise<{ locale: string }>;
  /** `shared=1`: opened by the share target; files wait in the service worker's stash. */
  searchParams: Promise<{ shared?: string }>;
};

export default async function UploadPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shared } = await searchParams;

  let categories: CategoryWithChildren[] = [];
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      categories = await getCategoriesTree(supabase);
    } catch (error) {
      console.error('Upload page: failed to load categories', error);
    }
  }

  return <DailyUploadClient categories={categories} shared={shared === '1'} />;
}
