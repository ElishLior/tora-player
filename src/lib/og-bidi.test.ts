import { describe, expect, it } from 'vitest';
import { rtlVisualWords } from './og-bidi';

describe('rtlVisualWords', () => {
  it('reverses each Hebrew word and keeps reading order of words', () => {
    expect(rtlVisualWords('נגן  תורה')).toEqual(['ןגנ', 'הרות']);
  });

  it('keeps numbers and dates left-to-right, also inside a Hebrew word', () => {
    expect(rtlVisualWords('שיעור 12 · 22.09.2026 · 2:03:10')).toEqual(['רועיש', '12', '·', '22.09.2026', '·', '2:03:10']);
    expect(rtlVisualWords('פרק10')).toEqual(['10קרפ']);
  });

  it('mirrors brackets inside right-to-left words', () => {
    expect(rtlVisualWords('חלק (עץ חיים)')).toEqual(['קלח', 'ץע)', '(םייח']);
  });

  it('keeps a run of Latin words, with the neutrals between them, as one item', () => {
    expect(rtlVisualWords('שיעור Part - 2 | סוף')).toEqual(['רועיש', 'Part - 2', '|', 'ףוס']);
  });

  it('keeps vowel points and gershayim attached to their letters', () => {
    // בָּרוּךְ is the graphemes בָּ ר וּ ךְ; visual order reverses graphemes, not code points.
    expect(rtlVisualWords('בָּרוּךְ י״א')).toEqual(['ךְ' + 'וּ' + 'ר' + 'בָּ', 'א״י']);
  });
});
