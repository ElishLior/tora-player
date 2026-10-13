import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

interface CollectionCardProps {
  /** The card's link. The whole card is its target, except the footer. */
  href: string;
  title: string;
  description?: string | null;
  /** A short fact (a count), at the inline end of the title row. */
  meta?: ReactNode;
  /** A block across the top of the card (a cover tile). Decorative. */
  cover?: ReactNode;
  /** A small tile or dot before the title (for cards without a cover). */
  leading?: ReactNode;
  /** Links inside the card, below the title (sub-categories). The footer sits above the stretched link. */
  footer?: ReactNode;
}

/*
 * A card for a collection (a playlist, a series, a category): an optional cover, the
 * title as the stretched link, a count, an optional description and an optional footer
 * of its own links. Server-safe (no hooks). Used in a CardGrid (`tiles`).
 */
export function CollectionCard({ href, title, description, meta, cover, leading, footer }: CollectionCardProps) {
  return (
    <article
      className={cn(
        'group/collection relative flex flex-col gap-3 rounded-2xl bg-[hsl(var(--surface-elevated))] p-3 transition-colors duration-150 motion-reduce:transition-none',
        'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary/50',
        'lg:[@media(hover:hover)]:hover:bg-[hsl(var(--surface-highlight))]',
      )}
    >
      {cover}
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <h2 className="min-w-0 flex-1">
          <Link
            href={href}
            dir="auto"
            className="line-clamp-2 text-base font-bold leading-snug text-foreground before:absolute before:inset-0 before:content-[''] focus-visible:outline-none lg:[@media(hover:hover)]:group-hover/collection:text-primary"
          >
            {title}
          </Link>
        </h2>
        <ChevronLeft aria-hidden="true" className="h-5 w-5 flex-shrink-0 text-muted-foreground ltr:rotate-180" />
      </div>
      {/* The count and the description sit under the title, so a narrow tile keeps the title's width. */}
      {(meta || description) && (
        <div className="space-y-0.5">
          {meta && <p className="text-[13px] tabular-nums text-muted-foreground">{meta}</p>}
          {description && (
            <p dir="auto" className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {footer && <div className="relative z-10">{footer}</div>}
    </article>
  );
}
