import { cn } from '@/lib/utils';

/**
 * The container for a list of LessonCards. Columns follow the centre pane's width,
 * not the viewport: Tailwind 3.4 has no container queries here (the plugin is not
 * installed), so the breakpoints are the viewport widths at which the pane is wide enough.
 *
 * Pane outer width = vw − 16 (shell padding) − side menu − 16 (gaps) − now-playing panel.
 * - side menu: 240px (lg), 256px (xl and up); panel: none below 1280px, 320px to 1799px, 360px from 1800px.
 * - 1024–1279: no panel, pane 760–1015px: one column.
 * - 1280–1711: pane 672–1103px: one column (two columns need 1100px).
 * - 1712 and up: pane ≥ 1100px (1712 − 16 − 256 − 16 − 320 = 1104): two columns.
 * - 2352 and up: pane ≥ 1700px (2352 − 16 − 256 − 16 − 360 = 1704): three columns.
 * The centre content is capped at 1680px, so three columns still fill at 2560 (cap, not pane).
 *
 * Phones and tablets: one column, as before. Rows keep equal heights (grid stretch).
 * Week headers and other full-width blocks sit outside the grid, so they span the pane.
 */
export function LessonCardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-y-0.5 min-[1712px]:grid-cols-2 min-[1712px]:gap-x-6 min-[2352px]:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
