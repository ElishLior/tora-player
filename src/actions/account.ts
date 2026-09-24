'use server';

import { isAdmin } from '@/lib/auth/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { profileUpdateSchema } from '@/lib/validators';

export interface Viewer {
  user: { id: string; email: string | null; displayName: string | null } | null;
  isAdmin: boolean;
}

/** Who is using the app right now; used by the header account entry. */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return { user: null, isAdmin: await isAdmin() };

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    user: { id: user.id, email: user.email ?? null, displayName: profile?.display_name ?? null },
    isAdmin: await isAdmin(),
  };
}

export async function updateProfile(input: {
  display_name: string | null;
  notify_new_lessons: boolean;
}): Promise<{ ok: true } | { ok: false; error: 'invalid' | 'auth_required' | 'save_failed' }> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return { ok: false, error: 'auth_required' };

  // RLS (owner-only) and column grants (display_name, notify_new_lessons) apply.
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.display_name || null,
      notify_new_lessons: parsed.data.notify_new_lessons,
    })
    .eq('id', user.id);
  if (error) {
    console.error('[account] profile update failed:', error.message);
    return { ok: false, error: 'save_failed' };
  }
  return { ok: true };
}
