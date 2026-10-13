import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The one lesson row. Pure layout: a leading tile, a body (title, meta line, part lengths,
 * tags, progress) and trailing actions. LessonCard binds it to a lesson (lessons, shorts,
 * playlists, search); the saved-lessons list binds it to an offline copy. Callers pass the
 * slots as elements, so the row holds no data and no hooks.
 *
 * Desktop affordances (lg and up, pointer devices only). The row is a named group
 * (`lesson`), so an outer `group` never lights up every row. Only background, colour and
 * opacity change: no transform or filter on any element between the title link and the row,
 * because a transform would become the containing block of the stretched link (::before).
 */
// Full class names on purpose: Tailwind only generates utilities it finds as literal text in the source.
const ROW_LIFT =
  'lg:[@media(hover:hover)]:hover:bg-[hsl(var(--surface-highlight))] lg:has-[a:focus-visible]:bg-[hsl(var(--surface-highlight))]';
const ROW_BASE =
  'group/lesson relative flex items-center gap-3 rounded-2xl p-2.5 transition-colors duration-150 motion-reduce:transition-none sm:p-3';

export interface LessonRowProps {
  /** The leading tile: a date tile, the shorts accent tile, or a saved lesson's tile. */
  tile: ReactNode;
  /** The title element: a stretched link, or plain text in a bulk-select row. */
  title: ReactNode;
  /** The line under the title (reading, badges, the date link). */
  meta?: ReactNode;
  /** Part lengths (PartDurations): a sibling of the title link, never inside it. */
  parts?: ReactNode;
  tags?: ReactNode;
  progress?: ReactNode;
  /** Trailing controls (play, play next, chevron, checkbox). Each already keeps its own z-index. */
  actions?: ReactNode;
  /** Full-width content below the row (e.g. a saved lesson's file list). */
  footer?: ReactNode;
  /** A toggle row (bulk select): a click handler instead of links, no hover lift. */
  onClick?: () => void;
  /** Extra classes on the row (selected state). */
  className?: string;
  /** Linked rows lift on hover and focus; toggle rows do not. */
  interactive?: boolean;
}

export function LessonRow({
  tile,
  title,
  meta,
  parts,
  tags,
  progress,
  actions,
  footer,
  onClick,
  className,
  interactive = true,
}: LessonRowProps) {
  const body = (
    <>
      {tile}
      <div className="grid min-w-0 flex-1 gap-1.5">
        <h3 className="text-base font-bold leading-snug text-foreground">{title}</h3>
        {meta}
        {parts}
        {tags}
        {progress}
      </div>
      {actions}
    </>
  );
  const rootClass = cn(ROW_BASE, footer && 'flex-wrap', className);

  if (onClick) {
    return (
      <div onClick={onClick} className={rootClass}>
        {body}
        {footer && <div className="basis-full">{footer}</div>}
      </div>
    );
  }

  return (
    <article
      className={cn(
        rootClass,
        interactive &&
          'hover:bg-[hsl(var(--surface-elevated))] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary/50',
        interactive && ROW_LIFT,
      )}
    >
      {body}
      {footer && <div className="basis-full">{footer}</div>}
    </article>
  );
}

/** A date tile: day and month on the reading's gradient (the hue of the row's reading). */
export function DateTile({ hue, day, month }: { hue: number; day: string; month: string }) {
  return (
    <span
      className="flex h-full w-full flex-col items-center justify-center rounded-xl border text-center"
      style={{
        background: `linear-gradient(150deg, hsl(${hue} 40% 24%), hsl(${hue} 25% 14%))`,
        borderColor: `hsl(${hue} 40% 40% / 0.35)`,
      }}
    >
      <b className="text-[19px] leading-none" style={{ color: `hsl(${hue} 75% 82%)` }}>
        {day}
      </b>
      <span className="text-[13px] leading-tight" style={{ color: `hsl(${hue} 30% 74%)` }}>
        {month}
      </span>
    </span>
  );
}
