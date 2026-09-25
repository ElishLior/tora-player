import { NOINDEX_METADATA } from '@/lib/seo';

/** Driving mode (player UI only): never indexed. */
export const metadata = NOINDEX_METADATA;

export default function DrivingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
