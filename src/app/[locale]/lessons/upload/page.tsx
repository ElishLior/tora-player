import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAllSeries } from '@/lib/supabase/queries';
import { UploadForm } from './upload-form';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ seriesId?: string }>;
};

export default async function UploadPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { seriesId } = await searchParams;
  setRequestLocale(locale);

  let series: Awaited<ReturnType<typeof getAllSeries>> = [];
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      series = await getAllSeries(supabase);
    } catch {
      // fallback to empty
    }
  }

  return (
    <UploadForm
      series={series}
      defaultSeriesId={seriesId}
    />
  );
}
