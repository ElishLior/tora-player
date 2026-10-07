'use client';

import { SITE_URL, lessonPath, localePath } from '@/config/site';

export interface ShareOptions {
  title: string;
  text?: string;
  url: string;
  timestamp?: number;
}

export type LessonShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Invoke directly from a click: navigator.share runs before the first await. */
export async function shareLessonWithResult(options: ShareOptions): Promise<LessonShareResult> {
  const url = options.timestamp ? `${options.url}?t=${Math.round(options.timestamp)}` : options.url;

  const data = { title: options.title, text: options.text || '', url };
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      if (!navigator.canShare || navigator.canShare(data)) {
        await navigator.share(data);
        return 'shared';
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  return (await copyToClipboard(url)) ? 'copied' : 'failed';
}

/** Keep the lesson-page share UI's boolean interface. */
export async function shareLesson(options: ShareOptions): Promise<boolean> {
  const result = await shareLessonWithResult(options);
  return result === 'shared' || result === 'copied';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Try the legacy copy command when clipboard access is denied.
  }

  if (typeof document === 'undefined') return false;
  const previousFocus = document.activeElement;
  let textarea: HTMLTextAreaElement | undefined;
  try {
    // Keep the temporary field in the active modal's focus scope.
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    const container = previousFocus instanceof Element ? previousFocus.closest('[role="dialog"]') : null;
    (container || document.body).appendChild(textarea);
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea?.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }
}

/**
 * Absolute link to a lesson page (`?t=` starts playback there). In the browser
 * it uses the current origin, so previews and localhost share links to themselves.
 */
export function getLessonShareUrl(lessonId: string, timestamp?: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  const url = `${origin}${localePath(lessonPath(lessonId))}`;
  return timestamp ? `${url}?t=${Math.round(timestamp)}` : url;
}
