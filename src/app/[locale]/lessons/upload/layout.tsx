import { NOINDEX_METADATA } from '@/lib/seo';

/** Admin upload: never indexed. */
export const metadata = NOINDEX_METADATA;

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
