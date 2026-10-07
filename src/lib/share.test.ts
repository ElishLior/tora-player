import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, shareLesson, shareLessonWithResult } from './share';

vi.mock('@/i18n/routing', () => ({ routing: { locales: ['he', 'en'], defaultLocale: 'he' } }));

const data = { title: 'שיעור תורה', url: 'https://example.test/he/lessons/lesson-id' };

describe('lesson sharing', () => {
  const writeText = vi.fn();
  const execCommand = vi.fn();
  const remove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    execCommand.mockReturnValue(false);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('Element', class Element {});
    vi.stubGlobal('HTMLElement', class HTMLElement {});
    vi.stubGlobal('document', {
      activeElement: null,
      body: { appendChild: vi.fn() },
      createElement: () => ({ style: {}, focus: vi.fn(), select: vi.fn(), remove }),
      execCommand,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('calls native share synchronously and does not copy after success', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    const result = shareLessonWithResult(data);
    expect(share).toHaveBeenCalledWith({ ...data, text: '' });
    expect(await result).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns cancelled silently without clipboard access for AbortError', async () => {
    Object.assign(navigator, { share: vi.fn().mockRejectedValue({ name: 'AbortError' }) });
    expect(await shareLessonWithResult(data)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('copies after a native share error', async () => {
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(new Error('unavailable')) });
    expect(await shareLessonWithResult(data)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it('reports failed when clipboard rejects and execCommand returns false', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    expect(await shareLessonWithResult(data)).toBe('failed');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(remove).toHaveBeenCalledOnce();
  });

  it('copies when canShare rejects the data', async () => {
    const share = vi.fn();
    Object.assign(navigator, { share, canShare: vi.fn().mockReturnValue(false) });
    expect(await shareLessonWithResult(data)).toBe('copied');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it('copies when canShare throws', async () => {
    const share = vi.fn();
    Object.assign(navigator, {
      share,
      canShare: () => {
        throw new Error('unsupported');
      },
    });
    expect(await shareLessonWithResult(data)).toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('accepts a successful legacy copy after clipboard rejection', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    execCommand.mockReturnValue(true);
    expect(await copyToClipboard(data.url)).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
  });

  it('reports a legacy command exception and removes the temporary field', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    execCommand.mockImplementation(() => {
      throw new Error('unsupported');
    });
    expect(await copyToClipboard(data.url)).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
  });

  it('preserves the existing boolean share interface and timestamp support', async () => {
    expect(await shareLesson({ ...data, timestamp: 42.6 })).toBe(true);
    expect(writeText).toHaveBeenCalledWith(`${data.url}?t=43`);
  });
});
