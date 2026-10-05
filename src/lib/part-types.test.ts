import { describe, expect, it } from 'vitest';
import { BUILT_IN_PART_TYPES, normalizePartType, partTypeOptions } from './part-types';

describe('normalizePartType', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePartType('  ליקוטי   מוהר״ן ')).toBe('ליקוטי מוהר״ן');
  });

  it('treats empty input as no type', () => {
    expect(normalizePartType('   ')).toBeNull();
    expect(normalizePartType(null)).toBeNull();
  });

  it('caps the length', () => {
    expect(normalizePartType('א'.repeat(80))).toHaveLength(50);
  });
});

describe('partTypeOptions', () => {
  it('lists the built-in types first even when nothing uses them', () => {
    expect(partTypeOptions([])).toEqual([...BUILT_IN_PART_TYPES]);
  });

  it('adds types the admin typed in, most used first, each once', () => {
    const options = partTypeOptions(['סידור', 'זוהר', 'ליקוטי מוהר״ן', ' ליקוטי מוהר״ן', null, 'עץ חיים', '']);
    expect(options).toEqual([...BUILT_IN_PART_TYPES, 'ליקוטי מוהר״ן', 'זוהר']);
  });
});
