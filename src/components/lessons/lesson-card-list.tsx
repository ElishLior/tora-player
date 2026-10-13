import { cn } from '@/lib/utils';

/**
 * The container for a list of LessonCards. Columns follow the centre pane's width,
 * not the viewport: Tailwind 3.4 has no container queries here (the plugin is not
 * installed), so the breakpoints are the viewport widths at which the pane is wide enough.
 *
 * Pane outer width = vw − 16 (shell padding) − side menu − 16 (gaps) − now-playing panel, minus 48px inner padding.
 * - side menu: 240px (lg), 256px (xl and up); panel: none below 1280px, 320px to 1799px, 360px from 1800px.
 * A row needs about 380px (date tile, title, two part chips, play button).
 * - 1100–1279 (no panel): content ≈ 790–970px: two columns.
 * - 1280–1399 (panel appears): content ≈ 620–740px: one column.
 * - 1400–1899: content ≈ 750–1200px: two columns.
 * - 1900–2399: content ≈ 1210–1680px: three columns.
 * - 2400 and up: content capped at 1680px: four columns.
 * Phones and tablets: one column, as before. Rows keep equal heights (grid stretch).
 * Week headers and other full-width blocks sit outside the grid, so they span the pane.
 */
export function LessonCardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-y-0.5 min-[1100px]:max-[1279px]:grid-cols-2 min-[1100px]:gap-x-6 min-[1400px]:grid-cols-2 min-[1900px]:grid-cols-3 min-[2400px]:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
