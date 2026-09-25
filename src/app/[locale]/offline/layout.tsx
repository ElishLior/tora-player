import { NOINDEX_METADATA } from '@/lib/seo';

/** Device-only offline library: never indexed. */
export const metadata = NOINDEX_METADATA;

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
