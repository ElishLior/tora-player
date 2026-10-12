'use client';

import type { ReactNode } from 'react';
import { useAudioStore } from '@/stores/audio-store';
import { SHELL_MAIN_PADDING_BOTTOM, SHELL_PANE_SURFACE, shellPaneHeight } from '@/lib/desktop-shell';
import { cn } from '@/lib/utils';

interface DesktopShellProps {
  /** The side menu (SideNav): the first pane, at the inline start. */
  sidebar: ReactNode;
  /** The now-playing panel (NowPlayingPanel): the last pane, at the inline end, from xl. */
  panel: ReactNode;
  children: ReactNode;
}

/**
 * The desktop app shell (lg and up): side menu, centre page and now-playing panel
 * as three panes in one row, with the page background behind them (layout). Below lg
 * the row is only the page, so phones and tablets keep their layout. The centre pane
 * is the page's scroll surface: it grows with its content (the window scrolls) and
 * its minimum height matches the side panes, so all three end on the same line.
 */
export function DesktopShell({ sidebar, panel, children }: DesktopShellProps) {
  const hasPlayerBar = useAudioStore((s) => s.currentTrack !== null);
  return (
    <div className="flex flex-1 lg:items-start lg:gap-2 lg:px-2 lg:pt-2">
      {sidebar}
      <main
        className={cn(
          'min-w-0 flex-1 px-4 py-4 pb-36 lg:px-6 lg:py-6',
          SHELL_PANE_SURFACE,
          SHELL_MAIN_PADDING_BOTTOM,
          shellPaneHeight(hasPlayerBar, 'min'),
        )}
      >
        {children}
      </main>
      {panel}
    </div>
  );
}
