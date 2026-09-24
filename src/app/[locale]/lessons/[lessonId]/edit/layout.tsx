import { NOINDEX_METADATA } from '@/lib/seo';

/** Admin lesson editor: never indexed. */
export const metadata = NOINDEX_METADATA;

export default function EditLessonLayout({ children }: { children: React.ReactNode }) {
  return children;
}
