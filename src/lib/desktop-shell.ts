/*
 * Desktop app shell geometry (lg and up). Pure class strings, so the layout, the
 * side menu, the now-playing panel and the centre pane agree on one set of numbers.
 *
 * Vertical: the header is 3rem (h-12). The panes start 0.5rem below it (top 3.5rem)
 * and end 0.5rem above the bottom. The desktop player bar (6rem plus the safe-area
 * inset) covers the bottom only while a track is loaded, so the panes shrink by it then.
 *
 * Horizontal (see the grid math in lesson-card-list.tsx): outer padding 0.5rem per
 * side, 0.5rem gaps between panes, side menu 240px (lg) / 256px (xl), now-playing
 * panel 320px (xl) / 360px (1800px and up).
 *
 * The side panes are sticky and scroll their own content; the page itself scrolls
 * (no inner scroll container on <main>, so route changes and scroll restoration work
 * as on every other page). Never put transform, filter, contain or overflow:hidden
 * on a pane wrapper: that breaks sticky and clips share menus.
 */

/** Sticky side panes sit just below the header. */
export const SHELL_PANE_TOP = 'lg:top-[3.5rem]';

/** Surface of every pane (side menu, centre, now-playing) on lg and up; the page behind them is darker. */
export const SHELL_PANE_SURFACE = 'lg:rounded-2xl lg:bg-[hsl(0_0%_9.5%)]';

/** The page background behind the panes (root of the layout). */
export const SHELL_PAGE_BACKGROUND = 'lg:bg-[hsl(0_0%_4.5%)]';

/**
 * Height of a sticky pane (`sticky`) or the centre pane's minimum height (`min`), so
 * all panes end on the same line. Without a track the bar is absent.
 */
export function shellPaneHeight(hasPlayerBar: boolean, role: 'sticky' | 'min'): string {
  if (role === 'sticky') {
    return hasPlayerBar ? 'lg:h-[calc(100dvh-10rem-env(safe-area-inset-bottom))]' : 'lg:h-[calc(100dvh-4rem)]';
  }
  return hasPlayerBar ? 'lg:min-h-[calc(100dvh-10rem-env(safe-area-inset-bottom))]' : 'lg:min-h-[calc(100dvh-4rem)]';
}

/** Bottom padding of the centre pane: clears the desktop player bar while it is loaded. */
export const SHELL_MAIN_PADDING_BOTTOM = 'lg:pb-[calc(6rem+env(safe-area-inset-bottom)+1.5rem)]';
