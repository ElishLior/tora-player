import {
  Bookmark,
  BookOpen,
  Download,
  FolderTree,
  Hash,
  Home,
  Library,
  ListMusic,
  Scissors,
  Search,
  type LucideIcon,
} from 'lucide-react';

/*
 * The app's sections, shared by the mobile bottom bar and the desktop side
 * menu so both always list the same places in the same order.
 */

export interface NavItem {
  /** Path after the locale prefix ('' = home). */
  href: string;
  /** Key in the `nav` messages. */
  label:
    | 'home'
    | 'lessons'
    | 'shorts'
    | 'bookmarks'
    | 'playlists'
    | 'downloads'
    | 'search'
    | 'tags'
    | 'library'
    | 'categories';
  icon: LucideIcon;
}

/** The main sections: the whole bottom bar on phones, the top group of the side menu. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '', label: 'home', icon: Home },
  { href: '/lessons', label: 'lessons', icon: BookOpen },
  { href: '/shorts', label: 'shorts', icon: Scissors },
  { href: '/bookmarks', label: 'bookmarks', icon: Bookmark },
  { href: '/playlists', label: 'playlists', icon: ListMusic },
  { href: '/offline', label: 'downloads', icon: Download },
];

/** Extra places the side menu has room for (phones reach them from the header). */
export const BROWSE_NAV: readonly NavItem[] = [
  { href: '/categories', label: 'categories', icon: FolderTree },
  { href: '/search', label: 'search', icon: Search },
  { href: '/tags', label: 'tags', icon: Hash },
  { href: '/me', label: 'library', icon: Library },
];

/** Whether `pathname` (with locale prefix) is inside the section. Home matches only itself. */
export function isNavActive(pathname: string, locale: string, href: string): boolean {
  const root = `/${locale}`;
  if (href === '') return pathname === root || pathname === `${root}/`;
  const section = `${root}${href}`;
  return pathname === section || pathname.startsWith(`${section}/`);
}
