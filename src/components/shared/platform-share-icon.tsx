'use client';

import { Share2 } from 'lucide-react';
import { useHydrated } from '@/hooks/use-hydrated';
import { sharePlatform } from '@/lib/share-platform';

/** Apple's share symbol (SF Symbols `square.and.arrow.up`), stroked like lucide. */
function AppleShareGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 6H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
    </svg>
  );
}

function currentSharePlatform() {
  return sharePlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/**
 * The share glyph of the user's OS: Apple's square-with-arrow on Apple devices,
 * lucide `Share2` (the Material share glyph) elsewhere. The server and the first
 * client render always use `Share2`; the OS glyph switches in after hydration.
 * Decorative only: the surrounding button keeps its label.
 */
export function PlatformShareIcon({ className }: { className?: string }) {
  const hydrated = useHydrated();
  if (hydrated && currentSharePlatform() === 'apple') {
    return <AppleShareGlyph className={className} />;
  }
  return <Share2 className={className} aria-hidden="true" />;
}
