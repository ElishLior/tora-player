/*
 * Satori (next/og) has no bidi support: it lays every string out left to
 * right, so Hebrew renders reversed. rtlVisualWords turns a right-to-left
 * paragraph into word items that are each already in visual order; laid out
 * in a wrapping `row-reverse` flex row, Satori still measures and wraps them.
 */

const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
const LATIN = /[A-Za-z\u00C0-\u024F]/;
const DIGIT = /[0-9]/;
const LTR_CHAR = '[A-Za-z0-9\\u00C0-\\u024F]';
const LTR_CHUNK = new RegExp(LTR_CHAR);
/** Latin/number runs inside a word, including joiners like `10:30`, `22.09.2026`, `a-b`. */
const WORD_CHUNKS = new RegExp(`${LTR_CHAR}+(?:[.,:/\\-]${LTR_CHAR}+)*|(?:(?!${LTR_CHAR})[^])+`, 'gu');
const MIRRORED: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
};

const graphemes = new Intl.Segmenter('he', { granularity: 'grapheme' });

/** A right-to-left word in visual order: chunk order reversed, Latin/number chunks kept, other characters reversed and brackets mirrored. */
function visualRtlWord(word: string): string {
  return (word.match(WORD_CHUNKS) ?? [])
    .reverse()
    .map((chunk) =>
      LTR_CHUNK.test(chunk)
        ? chunk
        : Array.from(graphemes.segment(chunk), ({ segment }) => MIRRORED[segment] ?? segment)
            .reverse()
            .join(''),
    )
    .join('');
}

/**
 * Words of a right-to-left paragraph in reading order, each in visual
 * (left-to-right) character order. Latin words start a left-to-right run that
 * also takes the numbers and neutral words between them (`Part - 2`); outside
 * such a run each number is its own item, as the Unicode bidi rules place
 * numbers in right-to-left text.
 */
export function rtlVisualWords(text: string): string[] {
  const items: string[] = [];
  let ltrRun: string[] = [];
  let neutrals: string[] = [];

  const flush = () => {
    if (ltrRun.length > 0) items.push(ltrRun.join(' '));
    items.push(...neutrals.map(visualRtlWord));
    ltrRun = [];
    neutrals = [];
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (HEBREW.test(word)) {
      flush();
      items.push(visualRtlWord(word));
    } else if (LATIN.test(word) || (DIGIT.test(word) && ltrRun.length > 0)) {
      // Neutrals only wait while a Latin run is open; between two of its words they join it.
      ltrRun.push(...neutrals, word);
      neutrals = [];
    } else if (ltrRun.length > 0) {
      neutrals.push(word);
    } else {
      items.push(visualRtlWord(word));
    }
  }
  flush();
  return items;
}
