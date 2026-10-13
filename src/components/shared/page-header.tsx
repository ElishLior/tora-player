import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** The page's single h1. */
  title: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  /** One line under the title (a count, a hint). */
  subtitle?: ReactNode;
  /** Actions at the inline end (a play-all button, a create button). Wrap on phones. */
  actions?: ReactNode;
  /** Before the title (a back link). */
  leading?: ReactNode;
  className?: string;
}

/**
 * The header of a list page: title (with its icon) and subtitle on the start side, actions
 * on the end side. One row from sm, stacked on phones. Server-safe (no hooks).
 */
export function PageHeader({
  title,
  icon: Icon,
  iconClassName,
  subtitle,
  actions,
  leading,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0 space-y-1">
          <h1 className="flex min-w-0 items-center gap-2.5 text-2xl font-extrabold leading-tight tracking-tight text-foreground lg:text-[28px]">
            {Icon && <Icon aria-hidden="true" className={cn('h-6 w-6 flex-shrink-0', iconClassName)} />}
            <span className="min-w-0 break-words">{title}</span>
          </h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
