'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight, Loader2, Pencil, Check, X, Trash2,
  ChevronUp, ChevronDown, Plus, FolderTree,
} from 'lucide-react';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from '@/actions/categories';
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

export default function AdminCategoriesPage() {
  const params = useParams();
  const locale = params.locale as string;
  const isRTL = locale === 'he';

  // ---- State ----
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    hebrew_name: '',
    name: '',
    description: '',
    icon: '',
    parent_id: '',
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    hebrew_name: '',
    name: '',
    description: '',
    icon: '',
    parent_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ---- Fetch categories ----
  const fetchCategories = useCallback(async () => {
    const result = await getCategories();
    if (result.data) {
      setCategories(result.data);
    } else if (result.error) {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    async function load() {
      await fetchCategories();
      setLoading(false);
    }
    load();
  }, [fetchCategories]);

  // ---- Helper: flash success ----
  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // ---- Create ----
  const handleCreate = async () => {
    if (!createForm.hebrew_name.trim()) {
      setError('שם בעברית הוא שדה חובה');
      return;
    }
    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set('hebrew_name', createForm.hebrew_name.trim());
    if (createForm.name.trim()) formData.set('name', createForm.name.trim());
    if (createForm.description.trim()) formData.set('description', createForm.description.trim());
    if (createForm.icon.trim()) formData.set('icon', createForm.icon.trim());
    if (createForm.parent_id) formData.set('parent_id', createForm.parent_id);

    const result = await createCategory(formData);
    if ('error' in result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = result.error as any;
      const errMsg = typeof err === 'string' ? err : err?._form?.[0] || 'שגיאה ביצירת קטגוריה';
      setError(errMsg);
    } else {
      setCreateForm({ hebrew_name: '', name: '', description: '', icon: '', parent_id: '' });
      setShowCreateForm(false);
      flashSuccess('הקטגוריה נוצרה בהצלחה');
      await fetchCategories();
    }
    setSaving(false);
  };

  // ---- Edit ----
  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditForm({
      hebrew_name: cat.hebrew_name,
      name: cat.name || '',
      description: cat.description || '',
      icon: cat.icon || '',
      parent_id: cat.parent_id || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ hebrew_name: '', name: '', description: '', icon: '', parent_id: '' });
  };

  const handleUpdate = async () => {
    if (!editingId || !editForm.hebrew_name.trim()) return;
    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set('hebrew_name', editForm.hebrew_name.trim());
    formData.set('name', editForm.name.trim());
    formData.set('description', editForm.description.trim());
    formData.set('icon', editForm.icon.trim());
    formData.set('parent_id', editForm.parent_id);

    const result = await updateCategory(editingId, formData);
    if ('error' in result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = result.error as any;
      const errMsg = typeof err === 'string' ? err : err?._form?.[0] || 'שגיאה בעדכון קטגוריה';
      setError(errMsg);
    } else {
      cancelEdit();
      flashSuccess('הקטגוריה עודכנה בהצלחה');
      await fetchCategories();
    }
    setSaving(false);
  };

  // ---- Delete ----
  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);

    const result = await deleteCategory(id);
    if ('error' in result) {
      setError(typeof result.error === 'string' ? result.error : 'שגיאה במחיקת קטגוריה');
    } else {
      flashSuccess('הקטגוריה נמחקה בהצלחה');
      await fetchCategories();
    }
    setDeleteConfirmId(null);
    setSaving(false);
  };

  // ---- Reorder ----
  const moveCategory = useCallback(async (
    list: Category[],
    index: number,
    direction: 'up' | 'down',
    parentId: string | null
  ) => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const newList = [...list];
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];

    // Optimistic update
    if (!parentId) {
      // Reordering top-level categories
      setCategories(prev => {
        const updated = [...prev];
        const idxA = updated.findIndex(c => c.id === newList[index].id);
        const idxB = updated.findIndex(c => c.id === newList[swapIndex].id);
        if (idxA >= 0 && idxB >= 0) {
          [updated[idxA], updated[idxB]] = [updated[idxB], updated[idxA]];
        }
        return updated;
      });
    } else {
      // Reordering children of a parent
      setCategories(prev =>
        prev.map(p =>
          p.id === parentId
            ? { ...p, children: newList as Category[] }
            : p
        )
      );
    }

    setSaving(true);
    await reorderCategories(newList.map(c => c.id));
    setSaving(false);
  }, []);

  // ---- Render helpers ----

  const inputClasses = 'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';
  const selectClasses = 'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';

  // Form fields for create and edit
  function renderFormFields(
    form: typeof createForm,
    setForm: (f: typeof createForm) => void,
    excludeParentId?: string
  ) {
    return (
      <div className="space-y-3">
        {/* Hebrew Name (required) */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {isRTL ? 'שם בעברית' : 'Hebrew Name'} *
          </label>
          <input
            type="text"
            value={form.hebrew_name}
            onChange={(e) => setForm({ ...form, hebrew_name: e.target.value })}
            className={inputClasses}
            dir="rtl"
            placeholder="לדוגמה: עץ חיים"
            required
          />
        </div>

        {/* English Name */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {isRTL ? 'שם באנגלית' : 'English Name'}
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClasses}
            placeholder="e.g. Etz Chaim"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {isRTL ? 'תיאור' : 'Description'}
          </label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={inputClasses}
            dir="rtl"
          />
        </div>

        {/* Icon */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {isRTL ? 'אייקון (אימוג\'י או שם)' : 'Icon (emoji or name)'}
          </label>
          <input
            type="text"
            value={form.icon}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
            className={inputClasses}
            placeholder="e.g. or book"
          />
        </div>

        {/* Parent Category */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {isRTL ? 'קטגוריית אב' : 'Parent Category'}
          </label>
          <select
            value={form.parent_id}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            className={selectClasses}
            dir="rtl"
          >
            <option value="">{isRTL ? 'קטגוריה ראשית (ללא הורה)' : 'Top-level (no parent)'}</option>
            {categories
              .filter(p => p.id !== excludeParentId)
              .map(parent => (
                <option key={parent.id} value={parent.id}>{parent.hebrew_name}</option>
              ))}
          </select>
        </div>
      </div>
    );
  }

  // Render a single category row (parent or child)
  function renderCategoryRow(
    cat: Category,
    index: number,
    list: Category[],
    parentId: string | null,
    isChild: boolean
  ) {
    const isEditing = editingId === cat.id;
    const isDeleting = deleteConfirmId === cat.id;

    return (
      <div
        key={cat.id}
        className={`group ${isChild ? 'pr-8' : ''}`}
      >
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
            isChild
              ? 'bg-[hsl(var(--surface-elevated))]/50 border border-border/30'
              : 'bg-[hsl(var(--surface-elevated))] border border-border/50 border-r-2 border-r-primary'
          } ${isEditing ? 'ring-1 ring-primary/30' : ''}`}
        >
          {/* Reorder buttons */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => moveCategory(list, index, 'up', parentId)}
              disabled={index === 0 || saving}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
              aria-label="Move up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveCategory(list, index, 'down', parentId)}
              disabled={index === list.length - 1 || saving}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
              aria-label="Move down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Icon */}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
            <CategoryIcon icon={cat.icon} className="h-4 w-4 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-3">
                {renderFormFields(
                  editForm,
                  setEditForm,
                  cat.id
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={saving || !editForm.hebrew_name.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>{isRTL ? 'שמור' : 'Save'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg bg-[hsl(var(--surface-highlight))] px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isRTL ? 'ביטול' : 'Cancel'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate" dir="rtl">
                  {cat.hebrew_name}
                </p>
                {cat.name && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    ({cat.name})
                  </span>
                )}
                {cat.description && (
                  <span className="text-xs text-muted-foreground hidden md:inline truncate max-w-[200px]">
                    - {cat.description}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons (hidden when editing) */}
          {!isEditing && (
            <div className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => startEdit(cat)}
                disabled={saving}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(cat.id)}
                disabled={saving}
                className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        {isDeleting && (
          <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/20 p-4 space-y-3">
            <p className="text-sm font-medium text-destructive" dir="rtl">
              {isRTL
                ? `האם אתה בטוח שברצונך למחוק את "${cat.hebrew_name}"? ${!isChild ? 'כל תתי-הקטגוריות יימחקו גם.' : ''} פעולה זו לא ניתנת לביטול.`
                : `Are you sure you want to delete "${cat.hebrew_name}"? ${!isChild ? 'All subcategories will also be deleted.' : ''} This action cannot be undone.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDelete(cat.id)}
                disabled={saving}
                className="rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isRTL ? 'מחק' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isRTL ? 'ביטול' : 'Cancel'}
              </button>
            </div>
          </div>
        )}
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
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/admin`}
          className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">
            {isRTL ? 'ניהול קטגוריות' : 'Manage Categories'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRTL ? `${categories.length} קטגוריות ראשיות` : `${categories.length} top-level categories`}
          </p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Success / Error messages */}
      {successMsg && (
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
          <p className="text-sm font-medium text-primary">{successMsg}</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-destructive/70 hover:text-destructive mt-1 underline"
          >
            {isRTL ? 'סגור' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Create button */}
      <button
        type="button"
        onClick={() => setShowCreateForm(!showCreateForm)}
        className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/20 transition-colors w-full justify-center"
      >
        <Plus className="h-4 w-4" />
        <span>{isRTL ? 'הוסף קטגוריה' : 'Add Category'}</span>
      </button>

      {/* Create form (collapsible) */}
      {showCreateForm && (
        <div className="rounded-xl bg-[hsl(var(--surface-elevated))] border border-border/50 p-5 space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            {isRTL ? 'קטגוריה חדשה' : 'New Category'}
          </h2>

          {renderFormFields(createForm, setCreateForm)}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !createForm.hebrew_name.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>{isRTL ? 'שמור' : 'Save'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setCreateForm({ hebrew_name: '', name: '', description: '', icon: '', parent_id: '' });
              }}
              className="rounded-lg bg-[hsl(var(--surface-highlight))] px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isRTL ? 'ביטול' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Category tree list */}
      <div className="space-y-3">
        {categories.length === 0 ? (
          <div className="rounded-xl bg-[hsl(var(--surface-elevated))] border border-border/50 p-8 text-center">
            <FolderTree className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {isRTL ? 'אין קטגוריות עדיין. צור את הראשונה!' : 'No categories yet. Create the first one!'}
            </p>
          </div>
        ) : (
          categories.map((parent, parentIndex) => (
            <div key={parent.id} className="space-y-1.5">
              {/* Parent category row */}
              {renderCategoryRow(parent, parentIndex, categories, null, false)}

              {/* Children */}
              {parent.children.length > 0 && (
                <div className="space-y-1.5">
                  {parent.children.map((child, childIndex) =>
                    renderCategoryRow(child, childIndex, parent.children, parent.id, true)
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
