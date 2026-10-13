import { describe, expect, it } from 'vitest';
import { categoryDotClass } from './category-display';

describe('categoryDotClass', () => {
  it('colours a category by its icon, the same on every list', () => {
    expect(categoryDotClass('BookOpen')).toBe('bg-primary');
    expect(categoryDotClass('Scissors')).toBe('bg-rose-400');
  });

  it('falls back to a neutral dot for an unknown or missing icon', () => {
    expect(categoryDotClass('Unknown')).toBe('bg-muted-foreground');
    expect(categoryDotClass(null)).toBe('bg-muted-foreground');
    expect(categoryDotClass(undefined)).toBe('bg-muted-foreground');
  });
});
