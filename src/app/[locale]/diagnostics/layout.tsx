import { NOINDEX_METADATA } from '@/lib/seo';

/** Device-only playback log: never indexed. */
export const metadata = NOINDEX_METADATA;

export default function DiagnosticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
