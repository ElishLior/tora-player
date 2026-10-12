'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
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
  reorderCategories,
  type CategoryFieldErrors,
} from '@/actions/categories';
import { CategoryPicker } from '@/components/categories/category-picker';
import { categoryLabel, childrenOf, containsProtectedCategory, isProtectedCategory } from '@/lib/category-tree';
import type { Category, CategoryWithChildren } from '@/types/database';

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
  parent_id: string;
}

const EMPTY_FORM: FormState = { hebrew_name: '', name: '', description: '', icon: '', parent_id: '' };

interface CreateState {
  /** null = a new top-level category; otherwise a new child of this category. */
  parentId: string | null;
  form: FormState;
  errors: CategoryFieldErrors;
}

interface EditState {
  id: string;
  form: FormState;
  errors: CategoryFieldErrors;
}

interface DeleteState {
  category: Category;
  childCount: number;
  /** null while counting. */
  lessonCount: number | null;
  countFailed: boolean;
}

const inputClasses =
  'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';

function toFormData(form: FormState): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(form)) {
    data.set(key, value.trim());
  }
  return data;
}

/** Top-level categories the given category may be moved under (itself excluded). */
function parentChoices(categories: CategoryWithChildren[], excludeId?: string): CategoryWithChildren[] {
  return categories.filter((c) => c.id !== excludeId).map((c) => ({ ...c, children: [] }));
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
  /** Choices for the parent selector: top-level categories only. */
  parents: CategoryWithChildren[];
  parentLocked: boolean;
  parentLockedHint?: string;
}

function CategoryFormFields({
  idPrefix,
  form,
  onChange,
  errors,
  parents,
  parentLocked,
  parentLockedHint,
}: CategoryFormFieldsProps) {
  const t = useTranslations('categoryAdmin');
  return (
    <div className="space-y-3">
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

      <FormField id={`${idPrefix}-english`} label={t('englishName')} hint={t('englishNameHint')} messages={errors.name}>
        <input
          id={`${idPrefix}-english`}
          type="text"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={inputClasses}
          aria-invalid={errors.name ? true : undefined}
        />
      </FormField>

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

      <FormField
        id={`${idPrefix}-parent`}
        label={t('parent')}
        hint={parentLocked ? parentLockedHint : undefined}
        messages={errors.parent_id}
      >
        <CategoryPicker
          id={`${idPrefix}-parent`}
          value={form.parent_id}
          onChange={(parent_id) => onChange({ parent_id })}
          categories={parents}
          includeNone
          noneValue=""
          noneLabel={t('topLevelOption')}
          disabled={parentLocked}
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

  // ---- Create ----
  const openCreate = (parentId: string | null) => {
    setCreate((current) =>
      current && current.parentId === parentId
        ? null
        : { parentId, form: { ...EMPTY_FORM, parent_id: parentId ?? '' }, errors: {} },
    );
    setEdit(null);
  };

  const submitCreate = async () => {
    if (!create) return;
    if (!create.form.hebrew_name.trim()) {
      setCreate({ ...create, errors: { hebrew_name: [t('hebrewNameRequired')] } });
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createCategory(toFormData(create.form));
    if ('error' in result) {
      setCreate((current) => (current ? { ...current, errors: result.error } : current));
    } else {
      setCreate(null);
      setNotice(t('created'));
      await load();
    }
    setBusy(false);
  };

  // ---- Edit ----
  const startEdit = (cat: Category) => {
    setCreate(null);
    setEdit({
      id: cat.id,
      form: {
        hebrew_name: cat.hebrew_name,
        name: cat.name || '',
        description: cat.description || '',
        icon: cat.icon || '',
        parent_id: cat.parent_id || '',
      },
      errors: {},
    });
  };

  const submitEdit = async () => {
    if (!edit) return;
    if (!edit.form.hebrew_name.trim()) {
      setEdit({ ...edit, errors: { hebrew_name: [t('hebrewNameRequired')] } });
      return;
    }
    setBusy(true);
    setError(null);
    const result = await updateCategory(edit.id, toFormData(edit.form));
    if ('error' in result) {
      setEdit((current) => (current ? { ...current, errors: result.error } : current));
    } else {
      setEdit(null);
      setNotice(t('updated'));
      await load();
    }
    setBusy(false);
  };

  // ---- Delete ----
  const askDelete = async (cat: Category) => {
    setEdit(null);
    setDeleteTarget({
      category: cat,
      childCount: childrenOf(categories, cat.id).length,
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

  const handleDelete = async (id: string) => {
    setBusy(true);
    setError(null);
    const result = await deleteCategory(id);
    if ('error' in result) {
      setError(result.error);
    } else {
      setNotice(t('deleted'));
      await load();
    }
    setDeleteTarget(null);
    setBusy(false);
  };

  // ---- Reorder ----
  // Optimistic: the new order shows at once. If the server refuses it, the snapshot taken before the move comes back.
  const moveCategory = async (parentId: string | null, index: number, step: -1 | 1) => {
    const snapshot = categories;
    let ids: string[];
    let next: CategoryWithChildren[];

    if (parentId === null) {
      const target = index + step;
      if (target < 0 || target >= categories.length) return;
      const reordered = [...categories];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      next = reordered.map((c, i) => ({ ...c, sort_order: i }));
      ids = next.map((c) => c.id);
    } else {
      const parent = categories.find((p) => p.id === parentId);
      if (!parent) return;
      const target = index + step;
      if (target < 0 || target >= parent.children.length) return;
      const children = [...parent.children];
      [children[index], children[target]] = [children[target], children[index]];
      const renumbered = children.map((c, i) => ({ ...c, sort_order: i }));
      next = categories.map((p) => (p.id === parentId ? { ...p, children: renumbered } : p));
      ids = renumbered.map((c) => c.id);
    }

    setCategories(next);
    setBusy(true);
    const result = await reorderCategories(ids);
    if ('error' in result) {
      setCategories(snapshot);
      setError(t('reorderFailed'));
    }
    setBusy(false);
  };

  // ---- Render helpers ----

  // Render a single category row (parent or child)
  function renderCategoryRow(
    cat: Category,
    index: number,
    siblings: Category[],
    parentId: string | null,
    isChild: boolean,
  ) {
    const isEditing = edit?.id === cat.id;
    const isDeleting = deleteTarget?.category.id === cat.id;
    const protectedSelf = isProtectedCategory(cat.id);
    const protectedInside = !protectedSelf && containsProtectedCategory(categories, cat.id);
    const deleteBlocked = protectedSelf || protectedInside;
    const deleteHint = protectedSelf ? t('protectedHint') : protectedInside ? t('protectedChildHint') : undefined;

    return (
      <div key={cat.id} className={`group ${isChild ? 'ps-8' : ''}`}>
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
            isChild
              ? 'border border-border/30 bg-[hsl(var(--surface-elevated))]/50'
              : 'border border-r-2 border-border/50 border-r-primary bg-[hsl(var(--surface-elevated))]'
          } ${isEditing ? 'ring-1 ring-primary/30' : ''}`}
        >
          {/* Reorder buttons */}
          <div className="flex flex-shrink-0 flex-col gap-0.5">
            <button
              type="button"
              onClick={() => moveCategory(parentId, index, -1)}
              disabled={index === 0 || busy}
              className="p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-20"
              aria-label={t('moveUp')}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveCategory(parentId, index, 1)}
              disabled={index === siblings.length - 1 || busy}
              className="p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-20"
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
                  parents={parentChoices(categories, cat.id)}
                  parentLocked={childrenOf(categories, cat.id).length > 0}
                  parentLockedHint={t('parentLocked')}
                />
                <FormErrors messages={edit.errors._form} />
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={submitEdit}
                    disabled={busy || !edit.form.hebrew_name.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>{t('save')}</span>
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
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground" dir="rtl">
                    {categoryLabel(cat)}
                  </p>
                  {cat.name && cat.name !== cat.hebrew_name && (
                    <span className="hidden text-xs text-muted-foreground sm:inline">({cat.name})</span>
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
                {deleteHint && <p className="text-xs text-muted-foreground">{deleteHint}</p>}
              </div>
            )}
          </div>

          {/* Action buttons (hidden when editing) */}
          {!isEditing && (
            <div className="flex flex-shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
              {!isChild && (
                <button
                  type="button"
                  onClick={() => openCreate(cat.id)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('addSubcategory')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit(cat)}
                disabled={busy}
                className="p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={t('edit')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => askDelete(cat)}
                disabled={busy || deleteBlocked}
                title={deleteHint}
                className="p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground"
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
              <p className="text-sm font-medium text-destructive">{t('deleteConfirm', { name: categoryLabel(cat) })}</p>
              {deleteTarget.childCount > 0 && (
                <p className="text-sm text-destructive">{t('deleteChildren', { count: deleteTarget.childCount })}</p>
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
      </div>
    );
  }

  // Create panel: the top-level one at the top of the list, a subcategory one under its parent.
  function renderCreatePanel(nested: boolean) {
    if (!create) return null;
    const parentName = nested ? (categories.find((c) => c.id === create.parentId)?.hebrew_name ?? '') : '';
    return (
      <div
        className={`space-y-4 rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-5 ${nested ? 'ms-8' : ''}`}
      >
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {nested ? t('newSubcategory', { parent: parentName }) : t('newCategory')}
        </h2>

        <CategoryFormFields
          idPrefix="create"
          form={create.form}
          onChange={(patch) =>
            setCreate((current) => current && { ...current, form: { ...current.form, ...patch }, errors: {} })
          }
          errors={create.errors}
          parents={parentChoices(categories)}
          parentLocked={false}
        />
        <FormErrors messages={create.errors._form} />

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={submitCreate}
            disabled={busy || !create.form.hebrew_name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span>{t('save')}</span>
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
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6" dir="rtl">
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
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <Plus className="h-4 w-4" />
        <span>{t('addCategory')}</span>
      </button>

      {create?.parentId === null && renderCreatePanel(false)}

      {/* Category tree list */}
      <div className="space-y-3">
        {categories.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-8 text-center">
            <FolderTree className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          categories.map((parent, parentIndex) => (
            <div key={parent.id} className="space-y-1.5">
              {/* Parent category row */}
              {renderCategoryRow(parent, parentIndex, categories, null, false)}

              {/* Children, and the subcategory form when it is open for this parent */}
              {(parent.children.length > 0 || create?.parentId === parent.id) && (
                <div className="space-y-1.5">
                  {parent.children.map((child, childIndex) =>
                    renderCategoryRow(child, childIndex, parent.children, parent.id, true),
                  )}
                  {create?.parentId === parent.id && renderCreatePanel(true)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
