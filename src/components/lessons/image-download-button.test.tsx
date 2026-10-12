import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import he from '../../../messages/he.json';
import en from '../../../messages/en.json';
import { ImageDownloadButton } from './image-download-button';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof he.imageDownload, values?: Record<string, string | number>) =>
    Object.entries(values ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      he.imageDownload[key],
    ),
}));

describe('ImageDownloadButton', () => {
  // Tests use the classic JSX runtime, which needs React in scope (as player-controls.test.tsx does).
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => vi.unstubAllGlobals());

  it('is a labelled button that names the image number for screen readers', () => {
    const markup = renderToStaticMarkup(<ImageDownloadButton imageId="img-1" number={3} />);

    expect(markup).toContain('<button');
    expect(markup).toContain('type="button"');
    expect(markup).toContain(`aria-label="${he.imageDownload.ariaLabel.replace('{number}', '3')}"`);
    expect(markup).toContain(he.imageDownload.label);
    expect(markup).not.toMatch(/ disabled=/);
  });

  it('keeps an empty status region in the DOM so announcements have a live target', () => {
    const markup = renderToStaticMarkup(<ImageDownloadButton imageId="img-1" number={1} />);

    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('role="alert"');
  });

  it('has English copy for every key it uses', () => {
    for (const key of ['label', 'ariaLabel', 'preparing', 'started', 'iosHint', 'error', 'lightboxLabel'] as const) {
      expect(en.imageDownload[key]).toBeTruthy();
      expect(he.imageDownload[key]).toBeTruthy();
    }
  });

  it('never promises a save to the photo library', () => {
    const copy = Object.values({ ...he.imageDownload, ...en.imageDownload }).join(' ');

    expect(copy).not.toMatch(/saved|נשמר|photos|תמונות מהגלריה/i);
  });
});
