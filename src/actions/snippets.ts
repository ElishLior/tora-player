'use server';

import { revalidatePath } from 'next/cache';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { submitSnippetSchema, updateSnippetSubmissionSchema } from '@/lib/validators';
import { isAdmin } from '@/actions/auth';
import type { SnippetSubmission, SnippetSubmissionWithLesson } from '@/types/database';

// ==================== SUBMIT (public) ====================

export async function submitSnippet(data: {
  lesson_id: string;
  audio_file_id?: string | null;
  title: string;
  description?: string | null;
  start_time: number;
  end_time: number;
}): Promise<{ data?: SnippetSubmission; error?: Record<string, string[]> | { _form: string[] } }> {
  try {
    const parsed = submitSnippetSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const supabase = await requireServerSupabaseClient();

    const { data: row, error } = await supabase
      .from('snippet_submissions')
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      return { error: { _form: [error.message] } };
    }

    revalidatePath('/[locale]', 'layout');
    return { data: row as SnippetSubmission };
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
    const supabase = await requireServerSupabaseClient();

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
    const supabase = await requireServerSupabaseClient();

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

    const supabase = await requireServerSupabaseClient();

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
    const supabase = await requireServerSupabaseClient();

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
