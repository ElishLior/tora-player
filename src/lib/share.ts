'use client';

interface ShareOptions {
  title: string;
  text?: string;
  url: string;
  timestamp?: number;
}

export async function shareLesson(options: ShareOptions): Promise<boolean> {
  const url = options.timestamp
    ? `${options.url}?t=${Math.round(options.timestamp)}`
    : options.url;

  // Try Web Share API first (mobile)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: options.title,
        text: options.text || '',
        url,
      });
      return true;
    } catch (error) {
      // User cancelled - not an error
      if ((error as Error).name === 'AbortError') return false;
    }
  }

  // Fallback: copy to clipboard
  return copyToClipboard(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

export function getLessonShareUrl(lessonId: string, timestamp?: number): string {
  const base = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || '';
  const url = `${base}/he/lessons/${lessonId}`;
  return timestamp ? `${url}?t=${Math.round(timestamp)}` : url;
}
