/*
 * How a category is coloured on lists (the coloured dot of concept B). Keyed by the
 * category's icon name, so a category keeps its colour wherever it is listed: the home
 * page's categories list and the categories page. Pure.
 */
const DOT_CLASS: Record<string, string> = {
  BookOpen: 'bg-primary',
  Wrench: 'bg-blue-400',
  Sparkles: 'bg-purple-400',
  Music: 'bg-amber-400',
  Scissors: 'bg-rose-400',
};

/** The Tailwind background class of a category's dot; a neutral dot when its icon has no colour. */
export function categoryDotClass(icon: string | null | undefined): string {
  return DOT_CLASS[icon ?? ''] ?? 'bg-muted-foreground';
}
