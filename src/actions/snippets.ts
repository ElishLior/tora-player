'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { submitSnippetSchema, updateSnippetSubmissionSchema } from '@/lib/validators';
import { isAdmin } from '@/lib/auth/admin';
import type { SnippetSubmission, SnippetSubmissionWithLesson } from '@/types/database';

const submissionsPerIp = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

// ==================== SUBMIT (public) ====================

export async function submitSnippet(data: {
  lesson_id: string;
  audio_file_id?: string | null;
  title: string;
  description?: string | null;
  start_time: number;
  end_time: number;
}): Promise<{ success?: true; error?: Record<string, string[]> | { _form: string[] } }> {
  try {
    const parsed = submitSnippetSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const t = await getTranslations('common');
    if (!submissionsPerIp.consume(getClientIp(await headers()))) {
      return { error: { _form: [t('rateLimited')] } };
    }

    // The public has no direct access to snippet_submissions (RLS); verify the
    // target with the visitor's own client (published lessons only), then insert
    // a pending submission with the service role.
    const visitor = await requireServerSupabaseClient();
    const { data: lesson } = await visitor.from('lessons').select('id').eq('id', parsed.data.lesson_id).maybeSingle();
    const { data: audio } = parsed.data.audio_file_id
      ? await visitor
          .from('lesson_audio')
          .select('id')
          .eq('id', parsed.data.audio_file_id)
          .eq('lesson_id', parsed.data.lesson_id)
          .maybeSingle()
      : { data: null };
    if (!lesson || (parsed.data.audio_file_id && !audio)) {
      return { error: { _form: [t('error')] } };
    }

    const { error } = await createAdminSupabaseClient()
      .from('snippet_submissions')
      .insert({ ...parsed.data, status: 'pending' });

    if (error) {
      console.error('[snippets] submit failed:', error.message);
      return { error: { _form: [t('error')] } };
    }

    return { success: true };
  } catch (err) {
    return { error: { _form: [err instanceof Error ? err.message : 'Failed to submit snippet'] } };
  }
}

// ==================== LIST (admin) ====================

export async function getSnippetSubmissions(
  status?: 'pending' | 'approved' | 'rejected'
): Promise<{ data?: SnippetSubmissionWithLesson[]; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  try {
    const supabase = createAdminSupabaseClient();

    let query = supabase
      .from('snippet_submissions')
      .select(`
        *,
        lesson:lessons!snippet_submissions_lesson_id_fkey(id, title, hebrew_title),
        audio_file:lesson_audio!snippet_submissions_audio_file_id_fkey(id, original_name, file_key, duration)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return { error: error.message };
    }

    return { data: data as SnippetSubmissionWithLesson[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch snippet submissions' };
  }
}

// ==================== COUNT PENDING (admin) ====================

export async function getPendingSnippetCount(): Promise<{ data?: number; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  try {
    const supabase = createAdminSupabaseClient();

    const { count, error } = await supabase
      .from('snippet_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) {
      return { error: error.message };
    }

    return { data: count ?? 0 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to count pending snippets' };
  }
}

// ==================== UPDATE (admin) ====================

export async function updateSnippetSubmission(
  id: string,
  data: {
    title?: string;
    description?: string | null;
    start_time?: number;
    end_time?: number;
    status?: 'pending' | 'approved' | 'rejected';
    admin_notes?: string | null;
    result_lesson_id?: string | null;
  }
): Promise<{ data?: SnippetSubmission; error?: Record<string, string[]> | { _form: string[] } }> {
  if (!(await isAdmin())) {
    return { error: { _form: ['Unauthorized'] } };
  }

  try {
    const parsed = updateSnippetSubmissionSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const supabase = createAdminSupabaseClient();

    // Set reviewed_at when status is explicitly changed to approved or rejected
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status && parsed.data.status !== 'pending') {
      updateData.reviewed_at = new Date().toISOString();
    }

    const { data: row, error } = await supabase
      .from('snippet_submissions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { error: { _form: [error.message] } };
    }

    revalidatePath('/[locale]', 'layout');
    return { data: row as SnippetSubmission };
  } catch (err) {
    return { error: { _form: [err instanceof Error ? err.message : 'Failed to update snippet submission'] } };
  }
}

// ==================== DELETE (admin) ====================

export async function deleteSnippetSubmission(id: string): Promise<{ success?: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  try {
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase
      .from('snippet_submissions')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath('/[locale]', 'layout');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete snippet submission' };
  }
}
