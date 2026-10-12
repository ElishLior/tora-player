'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, Pencil, Check, Trash2, ChevronUp, ChevronDown, Plus, FolderTree } from 'lucide-react';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  countCategoryLessons,
  moveCategory,
  reorderCategory,
  type CategoryActionError,
  type CategoryFieldErrors,
} from '@/actions/categories';
import {
  MAX_CATEGORY_LEVELS,
  categoryLabel,
  childrenOf,
  containsProtectedCategory,
  descendantIds,
  hasEnglishName,
  isProtectedCategory,
  validMoveTargets,
} from '@/lib/category-tree';
import type { Category, CategoryWithChildren } from '@/types/database';

/** Parents of the "Move to…" control, by the depth they would land at (indent). */
const INDENT_BY_DEPTH = ['ps-0', 'ps-8', 'ps-16'];

/** Value of the "Move to…" option for top level. */
const TOP_LEVEL_VALUE = '__top__';

/** Admin error codes (src/actions/categories.ts) to messages in categoryAdmin. */
const MOVE_ERROR_KEY: Record<CategoryActionError, string> = {
  'not-admin': 'errNotAdmin',
  failed: 'errFailed',
  'migration-missing': 'errMigration',
  stale: 'errStale',
  'missing-category': 'errMissingCategory',
  'missing-parent': 'errMissingParent',
  self: 'errSelf',
  cycle: 'errCycle',
  'too-deep': 'errTooDeep',
};

// ---- Icon map for rendering category icons ----
// Maps icon name strings to simple emoji/text fallbacks (lucide icons would need dynamic import)
function CategoryIcon({ icon, className }: { icon: string | null; className?: string }) {
  if (!icon) return <FolderTree className={className} />;
  // If the icon is an emoji or short text, render it directly
  if (icon.length <= 2) return <span className={className}>{icon}</span>;
  // Otherwise show folder icon as fallback
  return <FolderTree className={className} />;
}

interface FormState {
  hebrew_name: string;
  name: string;
  description: string;
  icon: string;
}

const EMPTY_FORM: FormState = { hebrew_name: '', name: '', description: '', icon: '' };

interface CreateState {
  /** null = a new top-level category; otherwise a new subcategory of this category. */
  parentId: string | null;
  form: FormState;
  errors: CategoryFieldErrors;
}

interface EditState {
  id: string;
  /** The category's updated_at when the edit opened; a save against a newer version is refused. */
  updatedAt: string;
  form: FormState;
  errors: CategoryFieldErrors;
}

interface DeleteState {
  category: CategoryWithChildren;
  /** Subcategories at every level below the category. */
  descendantCount: number;
  /** null while counting. */
  lessonCount: number | null;
  countFailed: boolean;
}

const inputClasses =
  'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';

/** Form values as FormData. `parentId` is sent only for a new category (undefined = leave the parent alone). */
function toFormData(form: FormState, parentId?: string | null): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(form)) {
    data.set(key, value.trim());
  }
  if (parentId !== undefined) data.set('parent_id', parentId ?? '');
  return data;
}

/** The English name as the edit form shows it: '' when the category has none yet. */
function englishFor(category: Category): string {
  return hasEnglishName(category) ? category.name : '';
}

function FormErrors({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <>
      {messages.map((message) => (
        <p key={message} className="mt-1 text-xs font-medium text-destructive">
          {message}
        </p>
      ))}
    </>
  );
}

function FormField({
  id,
  label,
  hint,
  messages,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  messages?: string[];
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <FormErrors messages={messages} />
    </div>
  );
}

interface CategoryFormFieldsProps {
  idPrefix: string;
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  errors: CategoryFieldErrors;
}

/** Hebrew and English names side by side, each in its own direction. English may stay empty. */
function CategoryFormFields({ idPrefix, form, onChange, errors }: CategoryFormFieldsProps) {
  const t = useTranslations('categoryAdmin');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${idPrefix}-hebrew`} label={`${t('hebrewName')} *`} messages={errors.hebrew_name}>
          <input
            id={`${idPrefix}-hebrew`}
            type="text"
            value={form.hebrew_name}
            onChange={(e) => onChange({ hebrew_name: e.target.value })}
            className={inputClasses}
            dir="rtl"
            aria-invalid={errors.hebrew_name ? true : undefined}
          />
        </FormField>

        <FormField
          id={`${idPrefix}-english`}
          label={t('englishName')}
          hint={t('englishNameHint')}
          messages={errors.name}
        >
          <input
            id={`${idPrefix}-english`}
            type="text"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputClasses}
            dir="ltr"
            aria-invalid={errors.name ? true : undefined}
          />
        </FormField>
      </div>

      <FormField id={`${idPrefix}-description`} label={t('description')} messages={errors.description}>
        <input
          id={`${idPrefix}-description`}
          type="text"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={inputClasses}
          dir="rtl"
        />
      </FormField>

      <FormField id={`${idPrefix}-icon`} label={t('icon')} messages={errors.icon}>
        <input
          id={`${idPrefix}-icon`}
          type="text"
          value={form.icon}
          onChange={(e) => onChange({ icon: e.target.value })}
          className={inputClasses}
        />
      </FormField>
    </div>
  );
}

export default function AdminCategoriesPage() {
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations('categoryAdmin');

  // ---- State ----
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [create, setCreate] = useState<CreateState | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteState | null>(null);
  // Set synchronously, so a double click before React re-renders cannot start a second write.
  const writing = useRef(false);

  // ---- Fetch categories ----
  const load = useCallback(async () => {
    const result = await getCategories();
    if (result.data) {
      setCategories(result.data);
      setError(null);
    } else {
      setError(result.error ? `${t('loadFailed')} (${result.error})` : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // ---- Success notice fades after 3 seconds ----
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Runs one write at a time; the tree reloads afterwards, so the screen always shows what the server holds. */
  const runWrite = async (write: () => Promise<void>) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      await write();
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  // ---- Create ----
  const openCreate = (parentId: string | null) => {
    setCreate((current) =>
      current && current.parentId === parentId ? null : { parentId, form: { ...EMPTY_FORM }, errors: {} },
    );
    setEdit(null);
  };

  const submitCreate = () => {
    if (!create) return;
    if (!create.form.hebrew_name.trim()) {
      setCreate({ ...create, errors: { hebrew_name: [t('hebrewNameRequired')] } });
      return;
    }
    void runWrite(async () => {
      const result = await createCategory(toFormData(create.form, create.parentId));
      if ('error' in result) {
        setCreate((current) => (current ? { ...current, errors: result.error } : current));
      } else {
        setCreate(null);
        setNotice(t('created'));
        await load();
      }
    });
  };

  // ---- Edit ----
  const startEdit = (cat: CategoryWithChildren) => {
    setCreate(null);
    setEdit({
      id: cat.id,
      updatedAt: cat.updated_at,
      form: {
        hebrew_name: cat.hebrew_name,
        name: englishFor(cat),
        description: cat.description || '',
        icon: cat.icon || '',
      },
      errors: {},
    });
  };

  const submitEdit = () => {
    if (!edit) return;
    if (!edit.form.hebrew_name.trim()) {
      setEdit({ ...edit, errors: { hebrew_name: [t('hebrewNameRequired')] } });
      return;
    }
    void runWrite(async () => {
      const result = await updateCategory(edit.id, toFormData(edit.form), edit.updatedAt);
      if ('error' in result) {
        const failure = result.error;
        if (failure === 'stale') {
          // Someone else changed it: close the form, reload the tree, and say so.
          setEdit(null);
          await load();
          setError(t('errStale'));
        } else {
          setEdit((current) => (current ? { ...current, errors: failure } : current));
        }
      } else {
        setEdit(null);
        setNotice(t('updated'));
        await load();
      }
    });
  };

  // ---- Delete ----
  const askDelete = async (cat: CategoryWithChildren) => {
    setEdit(null);
    setDeleteTarget({
      category: cat,
      descendantCount: descendantIds(categories, cat.id).length - 1,
      lessonCount: null,
      countFailed: false,
    });
    const result = await countCategoryLessons(cat.id);
    setDeleteTarget((current) =>
      current && current.category.id === cat.id
        ? {
            ...current,
            lessonCount: 'error' in result ? null : result.count,
            countFailed: 'error' in result,
          }
        : current,
    );
  };

  const handleDelete = (id: string) => {
    void runWrite(async () => {
      const result = await deleteCategory(id);
      if ('error' in result) {
        setError(result.error);
      } else {
        setNotice(t('deleted'));
        await load();
      }
      setDeleteTarget(null);
    });
  };

  // ---- Move and reorder ----
  /** Moves a category, with its branch, to `parentId` (null = top level) at the end of that parent's children. */
  const moveTo = (cat: CategoryWithChildren, parentId: string | null) => {
    const index = parentId ? childrenOf(categories, parentId).length : categories.length;
    void runWrite(async () => {
      const result = await moveCategory(cat.id, parentId, index, cat.updated_at);
      if ('error' in result) setError(t(MOVE_ERROR_KEY[result.error]));
      else setNotice(t('moved'));
      await load();
    });
  };

  /** Moves a category one place up (step -1) or down (step 1) among its siblings. */
  const step = (cat: CategoryWithChildren, index: number, delta: -1 | 1) => {
    void runWrite(async () => {
      const result = await reorderCategory(cat.id, index + delta, cat.updated_at);
      if ('error' in result) setError(t(MOVE_ERROR_KEY[result.error]));
      else setNotice(t('orderSaved'));
      await load();
    });
  };

  // ---- Render helpers ----

  /** The "Move to…" control: valid targets only (validMoveTargets). Renders nothing when there are none. */
  function renderMoveTo(cat: CategoryWithChildren) {
    const targets = validMoveTargets(categories, cat.id, locale);
    if (targets.length === 0) return null;
    return (
      <select
        aria-label={t('moveTo')}
        value=""
        disabled={busy}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) return;
          moveTo(cat, value === TOP_LEVEL_VALUE ? null : value);
        }}
        className="max-w-[140px] rounded-lg bg-[hsl(var(--surface-highlight))] px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
        dir="rtl"
      >
        <option value="" disabled>
          {t('moveTo')}
        </option>
        {targets.map((target) => (
          <option key={target.parentId ?? TOP_LEVEL_VALUE} value={target.parentId ?? TOP_LEVEL_VALUE}>
            {target.parentId === null ? t('moveToTopLevel') : `${' '.repeat(target.depth * 4)}${target.label}`}
          </option>
        ))}
      </select>
    );
  }

  // Render one category row with its subcategories (up to three levels).
  function renderCategory(cat: CategoryWithChildren, index: number, siblings: CategoryWithChildren[], depth: number) {
    const isEditing = edit?.id === cat.id;
    const isDeleting = deleteTarget?.category.id === cat.id;
    const protectedSelf = isProtectedCategory(cat.id);
    const protectedInside = !protectedSelf && containsProtectedCategory(categories, cat.id);
    const deleteBlocked = protectedSelf || protectedInside;
    const deleteHint = protectedSelf ? t('protectedHint') : protectedInside ? t('protectedChildHint') : undefined;
    const parent = depth > 0 ? findParent(cat.id) : null;
    const canHaveChildren = depth < MAX_CATEGORY_LEVELS - 1;
    const english = hasEnglishName(cat) ? cat.name : null;

    return (
      <div key={cat.id} className={`group ${INDENT_BY_DEPTH[depth] ?? ''}`}>
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
            depth > 0
              ? 'border border-border/30 bg-[hsl(var(--surface-elevated))]/50'
              : 'border border-s-2 border-border/50 border-s-primary bg-[hsl(var(--surface-elevated))]'
          } ${isEditing ? 'ring-1 ring-primary/30' : ''}`}
        >
          {/* Move up / move down */}
          <div className="flex flex-shrink-0 flex-col gap-0.5">
            <button
              type="button"
              onClick={() => step(cat, index, -1)}
              disabled={index === 0 || busy}
              className="p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-20 motion-reduce:transition-none"
              aria-label={t('moveUp')}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => step(cat, index, 1)}
              disabled={index === siblings.length - 1 || busy}
              className="p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-20 motion-reduce:transition-none"
              aria-label={t('moveDown')}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Icon */}
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <CategoryIcon icon={cat.icon} className="h-4 w-4 text-primary" />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {isEditing && edit ? (
              <div className="space-y-3">
                <CategoryFormFields
                  idPrefix={`edit-${cat.id}`}
                  form={edit.form}
                  onChange={(patch) =>
                    setEdit((current) => current && { ...current, form: { ...current.form, ...patch }, errors: {} })
                  }
                  errors={edit.errors}
                />
                <FormErrors messages={edit.errors._form} />
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={submitEdit}
                    disabled={busy || !edit.form.hebrew_name.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>{busy ? t('saving') : t('save')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdit(null)}
                    className="rounded-lg bg-[hsl(var(--surface-highlight))] px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground" dir="rtl">
                    {categoryLabel(cat, 'he')}
                  </p>
                  {english ? (
                    <span className="hidden text-xs text-muted-foreground sm:inline" dir="ltr">
                      ({english})
                    </span>
                  ) : (
                    <span className="hidden text-xs text-muted-foreground/70 sm:inline">{t('noEnglishYet')}</span>
                  )}
                  {cat.description && (
                    <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:inline">
                      - {cat.description}
                    </span>
                  )}
                  {protectedSelf && (
                    <span className="flex-shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {t('protectedBadge')}
                    </span>
                  )}
                </div>
                {parent && (
                  <p className="text-xs text-muted-foreground" dir="rtl">
                    {t('within', { parent: categoryLabel(parent, 'he') })}
                  </p>
                )}
                {deleteHint && <p className="text-xs text-muted-foreground">{deleteHint}</p>}
              </div>
            )}
          </div>

          {/* Action buttons (hidden when editing) */}
          {!isEditing && (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {renderMoveTo(cat)}
              {canHaveChildren && (
                <button
                  type="button"
                  onClick={() => openCreate(cat.id)}
                  disabled={busy}
                  className="flex min-h-9 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('addSubcategory')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit(cat)}
                disabled={busy}
                className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={t('edit')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => askDelete(cat)}
                disabled={busy || deleteBlocked}
                title={deleteHint}
                className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-30 disabled:hover:text-muted-foreground"
                aria-label={t('delete')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        {isDeleting && deleteTarget && (
          <div className="mt-2 space-y-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
            <div className="space-y-1" dir="rtl">
              <p className="text-sm font-medium text-destructive">
                {t('deleteConfirm', { name: categoryLabel(cat, 'he') })}
              </p>
              {deleteTarget.descendantCount > 0 && (
                <p className="text-sm text-destructive">
                  {t('deleteChildren', { count: deleteTarget.descendantCount })}
                </p>
              )}
              <p className="text-sm text-destructive">
                {deleteTarget.lessonCount !== null
                  ? t('deleteLessons', { count: deleteTarget.lessonCount })
                  : deleteTarget.countFailed
                    ? t('deleteCountFailed')
                    : t('deleteCounting')}
              </p>
              <p className="text-sm text-destructive">{t('deleteIrreversible')}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDelete(cat.id)}
                disabled={busy || (deleteTarget.lessonCount === null && !deleteTarget.countFailed)}
                className="rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('confirmDelete')}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Subcategories, and the form for a new one when it is open under this category */}
        {(cat.children.length > 0 || create?.parentId === cat.id) && (
          <div className="mt-1.5 space-y-1.5">
            {cat.children.map((child, childIndex) => renderCategory(child, childIndex, cat.children, depth + 1))}
            {create?.parentId === cat.id && renderCreatePanel(cat, depth + 1)}
          </div>
        )}
      </div>
    );
  }

  /** The category holding `id` as a direct child, for the parent context line. */
  function findParent(id: string): CategoryWithChildren | null {
    const walk = (nodes: CategoryWithChildren[]): CategoryWithChildren | null => {
      for (const node of nodes) {
        if (node.children.some((child) => child.id === id)) return node;
        const found = walk(node.children);
        if (found) return found;
      }
      return null;
    };
    return walk(categories);
  }

  // Create panel: the top-level one at the top of the list, a subcategory one under its parent.
  function renderCreatePanel(parent: CategoryWithChildren | null, depth: number) {
    if (!create) return null;
    return (
      <div
        className={`space-y-4 rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-5 ${INDENT_BY_DEPTH[depth] ?? ''}`}
      >
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {parent ? t('newSubcategory', { parent: categoryLabel(parent, 'he') }) : t('newCategory')}
        </h2>

        <CategoryFormFields
          idPrefix="create"
          form={create.form}
          onChange={(patch) =>
            setCreate((current) => current && { ...current, form: { ...current.form, ...patch }, errors: {} })
          }
          errors={create.errors}
        />
        <FormErrors messages={create.errors._form} />

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={submitCreate}
            disabled={busy || !create.form.hebrew_name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span>{busy ? t('saving') : t('save')}</span>
          </button>
          <button
            type="button"
            onClick={() => setCreate(null)}
            className="rounded-lg bg-[hsl(var(--surface-highlight))] px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    );
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---- Main render ----
  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/admin`}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-highlight))] hover:text-foreground"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('topLevelCount', { count: categories.length })}</p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Success / Error messages */}
      {notice && (
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3" role="status">
          <p className="text-sm font-medium text-primary">{notice}</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3" role="alert">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-1 text-xs text-destructive/70 underline hover:text-destructive"
          >
            {t('dismiss')}
          </button>
        </div>
      )}

      {/* Create button: a new top-level category */}
      <button
        type="button"
        onClick={() => openCreate(null)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Plus className="h-4 w-4" />
        <span>{t('addCategory')}</span>
      </button>

      {create?.parentId === null && renderCreatePanel(null, 0)}

      {/* Category tree list */}
      <div className="space-y-3">
        {categories.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-8 text-center">
            <FolderTree className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          categories.map((cat, index) => renderCategory(cat, index, categories, 0))
        )}
      </div>
    </div>
  );
}
