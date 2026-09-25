import { NOINDEX_METADATA } from '@/lib/seo';

/** Personal bookmarks: never indexed. */
export const metadata = NOINDEX_METADATA;

export default function BookmarksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
