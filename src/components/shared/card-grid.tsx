import { cn } from '@/lib/utils';

/*
 * Responsive column grids for the centre pane. Columns follow the pane's width, not the
 * viewport: Tailwind 3.4 has no container queries here (the plugin is not installed), so
 * the breakpoints are the viewport widths at which the pane is wide enough.
 *
 * Pane outer width = vw − 16 (shell padding) − side menu − 16 (gaps) − now-playing panel, minus 48px inner padding.
 * - side menu: 240px (lg), 256px (xl and up); panel: none below 1280px, 320px to 1799px, 360px from 1800px.
 * - 1100–1279 (no panel): content ≈ 790–970px.
 * - 1280–1399 (panel appears): content ≈ 620–740px.
 * - 1400–1899: content ≈ 750–1200px.
 * - 1900–2399: content ≈ 1210–1680px.
 * - 2400 and up: content capped at 1680px.
 *
 * - `rows` (lesson rows, bookmark groups): one column on phones; two at 1100px of pane,
 *   three at 1900px, four at 2400px. A row needs about 380px.
 * - `tiles` (playlists, series): two columns on phones (a cover on top, the title beside a chevron);
 *   three from 1100px, four from 1900px. A tile needs about 220px.
 * - `cards` (categories, with a leading mark and footer links): one column on phones, two from
 *   640px, three from 1400px, four from 1900px. A title beside its mark needs about 260px on phones.
 * Grid items stretch to equal heights in a row. Full-width blocks sit outside the grid.
 */
const VARIANT = {
  rows: 'grid grid-cols-1 gap-y-0.5 min-[1100px]:max-[1279px]:grid-cols-2 min-[1100px]:gap-x-6 min-[1400px]:grid-cols-2 min-[1900px]:grid-cols-3 min-[2400px]:grid-cols-4',
  tiles:
    'grid grid-cols-2 gap-3 sm:gap-4 min-[1100px]:max-[1279px]:grid-cols-3 min-[1400px]:grid-cols-3 min-[1900px]:grid-cols-4',
  cards: 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 min-[1400px]:grid-cols-3 min-[1900px]:grid-cols-4',
} as const;

export function CardGrid({
  children,
  variant = 'rows',
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANT;
  className?: string;
}) {
  return <div className={cn(VARIANT[variant], className)}>{children}</div>;
}
