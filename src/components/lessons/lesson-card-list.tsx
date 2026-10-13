import { CardGrid } from '@/components/shared/card-grid';

/**
 * The container for a list of lesson rows (LessonCard). Its columns are the `rows` grid
 * of CardGrid: one column on phones and up to 1100px of pane, two from there, three from
 * 1900px and four from 2400px, so a row never stretches across a wide screen. Week headers
 * and other full-width blocks sit outside the grid.
 */
export function LessonCardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <CardGrid variant="rows" className={className}>
      {children}
    </CardGrid>
  );
}
