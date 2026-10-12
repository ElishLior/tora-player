import { cn } from '@/lib/utils';

/**
 * The container for a list of LessonCards: one column on phones and tablets,
 * two columns from xl so a row never stretches across a wide screen. Order
 * reads row by row in the page direction.
 */
export function LessonCardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-y-0.5 xl:grid-cols-2 xl:gap-x-6', className)}>{children}</div>;
}
