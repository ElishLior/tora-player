import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  current: [] as Array<{ id: string }>,
  history: [] as Array<{ lesson_id: string }>,
  updateError: null as { code: string; message: string } | null,
  updates: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/supabase/anon', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ requireServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/admin-lesson', () => ({ lessonReadClient: vi.fn() }));
vi.mock('@/lib/auth/admin', () => ({ isAdmin: vi.fn(async () => true), requireAdmin: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications/notify', () => ({ notifyNewLesson: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) =>
    ({ invalid: 'כתובת לא תקינה', taken: 'הכתובת כבר שייכת לשיעור אחר', unavailable: 'לא ניתן לבדוק את הכתובת' })[
      key as 'invalid'
    ],
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from(table: string) {
      let excluded = '';
      const query = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        neq(_column: string, value: string) {
          excluded = value;
          return this;
        },
        update(values: Record<string, unknown>) {
          state.updates.push(values);
          return this;
        },
        async maybeSingle() {
          const data =
            table === 'lessons'
              ? state.current.find((row) => row.id !== excluded)
              : state.history.find((row) => row.lesson_id !== excluded);
          return { data: data ?? null, error: null };
        },
        async single() {
          return { data: { id: 'lesson-id', ...state.updates.at(-1) }, error: state.updateError };
        },
      };
      return query;
    },
  })),
}));

import { updateLesson } from './lessons';
import { revalidateCatalog } from '@/lib/supabase/anon';
import { requireAdmin } from '@/lib/auth/admin';

beforeEach(() => {
  state.current = [];
  state.history = [];
  state.updates = [];
  state.updateError = null;
  vi.clearAllMocks();
});
function form(slug: string) {
  const form = new FormData();
  form.set('slug', slug);
  form.set('title', 'שיעור');
  return form;
}

describe('admin lesson slug updates', () => {
  it('rejects an invalid slug with a translated error before a write', async () => {
    expect(await updateLesson('lesson-id', form('Bad--Slug'))).toMatchObject({ error: { slug: ['כתובת לא תקינה'] } });
    expect(state.updates).toEqual([]);
  });
  it.each(['current', 'history'] as const)('rejects a %s name belonging to another lesson', async (kind) => {
    if (kind === 'current') state.current = [{ id: 'other-id' }];
    else state.history = [{ lesson_id: 'other-id' }];
    expect(await updateLesson('lesson-id', form('old-name'))).toMatchObject({
      error: { slug: ['הכתובת כבר שייכת לשיעור אחר'] },
    });
    expect(state.updates).toEqual([]);
  });
  it('allows restoring the same lesson history, authorizes and invalidates the catalog', async () => {
    state.history = [{ lesson_id: 'lesson-id' }];
    expect(await updateLesson('lesson-id', form('old-name'))).toMatchObject({
      data: { id: 'lesson-id', slug: 'old-name' },
    });
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(revalidateCatalog).toHaveBeenCalledOnce();
  });
  it('keeps the current slug when the field is empty', async () => {
    await updateLesson('lesson-id', form('   '));
    expect(state.updates[0]).not.toHaveProperty('slug');
  });
  it('translates a concurrent slug uniqueness violation', async () => {
    state.updateError = { code: '23505', message: 'duplicate lessons_slug_key' };
    expect(await updateLesson('lesson-id', form('new-name'))).toMatchObject({
      error: { slug: ['הכתובת כבר שייכת לשיעור אחר'] },
    });
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });
});
