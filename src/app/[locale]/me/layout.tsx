import { NOINDEX_METADATA } from '@/lib/seo';

/** Personal library: never indexed. */
export const metadata = NOINDEX_METADATA;

export default function PersonalLibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
