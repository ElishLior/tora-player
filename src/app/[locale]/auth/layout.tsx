import { NOINDEX_METADATA } from '@/lib/seo';

/** Sign-in and account flows: never indexed. */
export const metadata = NOINDEX_METADATA;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
