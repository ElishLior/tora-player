import { NOINDEX_METADATA } from '@/lib/seo';

/** Admin area (incl. login): never indexed. Access control stays in middleware and each page. */
export const metadata = NOINDEX_METADATA;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
