/**
 * Rules for the in-app "turn on new-lesson notifications?" question.
 * Pure: the component reads/writes localStorage and passes the results in.
 */

/** Same union as `PushStatus` in `use-push-notifications.ts`. */
export type PromptStatus = 'checking' | 'unavailable' | 'ios-install' | 'denied' | 'off' | 'on';

/** Which question to ask: a permission request, or the Add-to-Home-Screen steps on iOS. */
export type PromptView = 'enable' | 'ios-install' | null;

/**
 * Sections where the card gets in the way: admin, the upload page, the account page
 * (it has its own toggle) and driving mode. Matched by whole path segments.
 */
const QUIET_SECTIONS = ['/admin', '/lessons/upload', '/me', '/driving'] as const;

/** `pathname` as next/navigation's usePathname returns it, with the locale prefix (`/he/me`). */
export function isPromptRoute(pathname: string, locale: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  const root = `/${locale}`;
  const inner = path === root ? '/' : path.startsWith(`${root}/`) ? path.slice(root.length) : path;
  return !QUIET_SECTIONS.some((section) => inner === section || inner.startsWith(`${section}/`));
}

export const NEVER_AGAIN_KEY = 'tora-notification-prompt-never';
export const SNOOZED_UNTIL_KEY = 'tora-notification-prompt-snoozed-until';
export const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export interface PromptMemory {
  neverAgain: boolean;
  /** Epoch ms before which the prompt stays hidden, or null. */
  snoozedUntil: number | null;
}

export function notificationPromptView(input: {
  status: PromptStatus;
  neverAgain: boolean;
  snoozedUntil: number | null;
  now: number;
}): PromptView {
  if (input.neverAgain) return null;
  if (input.snoozedUntil !== null && input.now < input.snoozedUntil) return null;
  if (input.status === 'off') return 'enable';
  if (input.status === 'ios-install') return 'ios-install';
  return null;
}

/** Reads the stored memory. A missing or malformed snooze value counts as "no snooze". */
export function readPromptMemory(storage: Pick<Storage, 'getItem'>): PromptMemory {
  const snoozed = Number(storage.getItem(SNOOZED_UNTIL_KEY));
  return {
    neverAgain: storage.getItem(NEVER_AGAIN_KEY) === '1',
    snoozedUntil: storage.getItem(SNOOZED_UNTIL_KEY) !== null && Number.isFinite(snoozed) ? snoozed : null,
  };
}

/** "Not now". With the "don't show again" box checked it never shows again; otherwise it snoozes for SNOOZE_MS. */
export function rememberNotNow(
  storage: Pick<Storage, 'setItem'>,
  input: { neverAgain: boolean; now: number },
): PromptMemory {
  if (input.neverAgain) {
    storage.setItem(NEVER_AGAIN_KEY, '1');
    return { neverAgain: true, snoozedUntil: null };
  }
  const snoozedUntil = input.now + SNOOZE_MS;
  storage.setItem(SNOOZED_UNTIL_KEY, String(snoozedUntil));
  return { neverAgain: false, snoozedUntil };
}

/** Notifications were turned on on this device: never ask again, even if they are turned off later. */
export function rememberEnabled(storage: Pick<Storage, 'setItem'>): PromptMemory {
  storage.setItem(NEVER_AGAIN_KEY, '1');
  return { neverAgain: true, snoozedUntil: null };
}
