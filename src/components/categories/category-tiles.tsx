import { FolderOpen, ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { categoryDotClass } from '@/lib/category-display';
import { categoryLabel, categoryLessonTotal, childrenOf } from '@/lib/category-tree';
import { CardGrid } from '@/components/shared/card-grid';
import { CollectionCard } from '@/components/shared/collection-card';
import { cn } from '@/lib/utils';
import type { CategoryWithChildren } from '@/types/database';

interface CategoryTilesProps {
  /** The categories shown as tiles (the top level, or one category's subcategories). */
  nodes: CategoryWithChildren[];
  /** The whole tree and counts: a category's count covers its branch (categoryLessonTotal). */
  tree: CategoryWithChildren[];
  counts: Record<string, number>;
  locale: string;
  /** Shown instead of a count when a branch has no lessons. */
  emptyLabel: string;
  /** Top-level categories show their colour dot; subcategories a folder. */
  leading: 'dot' | 'folder';
}

/**
 * Categories as a tile grid (the categories page and a category's subcategories): each
 * tile links to its category, shows its count and lists its own subcategories as links
 * inside the tile, nested by level. Server-safe (no hooks).
 */
export function CategoryTiles({ nodes, tree, counts, locale, emptyLabel, leading }: CategoryTilesProps) {
  return (
    <CardGrid variant="cards">
      {nodes.map((node) => {
        const total = categoryLessonTotal(counts, node.id);
        return (
          <CollectionCard
            key={node.id}
            href={`/categories/${node.id}`}
            title={categoryLabel(node, locale)}
            description={node.description}
            meta={total > 0 ? String(total) : emptyLabel}
            leading={<LeadingMark kind={leading} icon={node.icon} />}
            footer={
              childrenOf(tree, node.id).length > 0 ? (
                <CategoryRows
                  nodes={childrenOf(tree, node.id)}
                  tree={tree}
                  counts={counts}
                  locale={locale}
                  emptyLabel={emptyLabel}
                  depth={0}
                />
              ) : undefined
            }
          />
        );
      })}
    </CardGrid>
  );
}

function LeadingMark({ kind, icon }: { kind: 'dot' | 'folder'; icon: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--surface-highlight))]"
    >
      {kind === 'dot' ? (
        <span className={cn('h-3 w-3 rounded-full', categoryDotClass(icon))} />
      ) : (
        <FolderOpen className="h-4 w-4 text-primary" />
      )}
    </span>
  );
}

/** A tile's subcategories: one link row each, their own subcategories indented below. */
function CategoryRows({
  nodes,
  tree,
  counts,
  locale,
  emptyLabel,
  depth,
}: {
  nodes: CategoryWithChildren[];
  tree: CategoryWithChildren[];
  counts: Record<string, number>;
  locale: string;
  emptyLabel: string;
  depth: number;
}) {
  return (
    <ul className={cn('space-y-0.5', depth > 0 && 'ms-4')}>
      {nodes.map((node) => {
        const total = categoryLessonTotal(counts, node.id);
        return (
          <li key={node.id}>
            <Link
              href={`/categories/${node.id}`}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-foreground transition-colors duration-150 hover:bg-[hsl(var(--surface-highlight))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
            >
              <span className="min-w-0 flex-1 truncate">{categoryLabel(node, locale)}</span>
              <span className="flex-shrink-0 text-[13px] tabular-nums text-muted-foreground">
                {total > 0 ? String(total) : emptyLabel}
              </span>
              <ChevronLeft aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-muted-foreground ltr:rotate-180" />
            </Link>
            {childrenOf(tree, node.id).length > 0 && (
              <CategoryRows
                nodes={childrenOf(tree, node.id)}
                tree={tree}
                counts={counts}
                locale={locale}
                emptyLabel={emptyLabel}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
