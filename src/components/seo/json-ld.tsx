import { serializeJsonLd } from '@/lib/seo';

/** Structured data for search engines (schema.org), rendered by server pages. */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
