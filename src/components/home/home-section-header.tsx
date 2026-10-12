import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';

interface HomeSectionHeaderProps {
  id: string;
  title: string;
  /** "All lessons" style link at the end of the header. */
  href?: string;
  linkLabel?: string;
}

/** Heading row of a home section, with its optional "all" link. Server-safe. */
export function HomeSectionHeader({ id, title, href, linkLabel }: HomeSectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-xl font-extrabold tracking-tight text-foreground">
        {title}
      </h2>
      {href && linkLabel && (
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
        >
          {linkLabel}
          <ChevronLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
        </Link>
      )}
    </div>
  );
}
