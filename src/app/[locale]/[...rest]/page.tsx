import { notFound } from 'next/navigation';

/** Unknown paths under a locale (e.g. /he/foo) render the localized [locale]/not-found.tsx inside the app layout. */
export default function UnknownPathPage() {
  notFound();
}
