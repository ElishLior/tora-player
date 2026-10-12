/**
 * The "turn on new-lesson notifications?" card.
 *
 * The visible-card tests need NEXT_PUBLIC_VAPID_PUBLIC_KEY at build time. Without it the
 * push status is "unavailable" and the card never shows, so those tests are skipped
 * (the negative tests still run). The dev server reads the key from .env.local.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import he from '../../messages/he.json';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const NEVER_AGAIN_KEY = 'tora-notification-prompt-never';
const SNOOZED_UNTIL_KEY = 'tora-notification-prompt-snoozed-until';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
// The prompt waits 2.5s after load; wait past that before asserting it stayed hidden.
const PAST_SHOW_DELAY_MS = 3500;

function vapidKeyConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return true;
  const envFile = path.join(process.cwd(), '.env.local');
  return fs.existsSync(envFile) && /^NEXT_PUBLIC_VAPID_PUBLIC_KEY=\S/m.test(fs.readFileSync(envFile, 'utf8'));
}

/** Visible-card tests; skipped when the card cannot show (no VAPID key). */
const cardTest = vapidKeyConfigured() ? test : test.skip;

function promptDialog(page: Page) {
  return page.getByRole('dialog', { name: he.notificationPrompt.title });
}

async function readStorage(page: Page, key: string) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/**
 * Headless Chromium reports Notification.permission as "denied" even when the
 * permission is granted, so the device state is set explicitly. "default" is a
 * device that has never been asked; no real push subscription is created.
 */
async function setNotificationPermission(page: Page, value: 'default' | 'denied') {
  await page.addInitScript((permission) => {
    Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => permission });
  }, value);
}

test.beforeEach(async ({ page }) => {
  await setNotificationPermission(page, 'default');
});

cardTest('asks the new-lesson question on the home page for a fresh device', async ({ page }) => {
  await page.goto(`${BASE_URL}/he`);

  const dialog = promptDialog(page);
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: he.notificationPrompt.enable })).toBeVisible();
  await expect(dialog.getByRole('button', { name: he.notificationPrompt.notNow })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: he.notificationPrompt.neverAgain })).not.toBeChecked();
});

cardTest('"not now" with "don\'t show again" never brings it back', async ({ page }) => {
  await page.goto(`${BASE_URL}/he`);
  const dialog = promptDialog(page);
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  await dialog.getByRole('checkbox', { name: he.notificationPrompt.neverAgain }).check();
  await dialog.getByRole('button', { name: he.notificationPrompt.notNow }).click();
  await expect(dialog).toBeHidden();
  expect(await readStorage(page, NEVER_AGAIN_KEY)).toBe('1');

  await page.reload();
  await page.waitForTimeout(PAST_SHOW_DELAY_MS);
  await expect(dialog).toBeHidden();
});

cardTest('"not now" without the checkbox hides it and snoozes for three days', async ({ page }) => {
  await page.goto(`${BASE_URL}/he`);
  const dialog = promptDialog(page);
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  const before = Date.now();
  await dialog.getByRole('button', { name: he.notificationPrompt.notNow }).click();
  await expect(dialog).toBeHidden();

  const snoozedUntil = Number(await readStorage(page, SNOOZED_UNTIL_KEY));
  expect(snoozedUntil).toBeGreaterThanOrEqual(before + THREE_DAYS_MS - 1_000);
  expect(snoozedUntil).toBeLessThanOrEqual(Date.now() + THREE_DAYS_MS + 1_000);
  expect(await readStorage(page, NEVER_AGAIN_KEY)).toBeNull();

  await page.reload();
  await page.waitForTimeout(PAST_SHOW_DELAY_MS);
  await expect(dialog).toBeHidden();
});

cardTest('Escape closes it the same way as "not now"', async ({ page }) => {
  await page.goto(`${BASE_URL}/he`);
  const dialog = promptDialog(page);
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(Number(await readStorage(page, SNOOZED_UNTIL_KEY))).toBeGreaterThan(Date.now());
});

test('does not show when the browser has blocked notifications', async ({ page }) => {
  await setNotificationPermission(page, 'denied');
  await page.goto(`${BASE_URL}/he`);
  await page.waitForTimeout(PAST_SHOW_DELAY_MS);
  await expect(promptDialog(page)).toBeHidden();
});

cardTest('does not show on the account page, which has its own toggle', async ({ page }) => {
  await page.goto(`${BASE_URL}/he/me`);
  await page.waitForTimeout(PAST_SHOW_DELAY_MS);
  await expect(promptDialog(page)).toBeHidden();
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  cardTest('sits above the bottom navigation without covering it', async ({ page }) => {
    await page.goto(`${BASE_URL}/he`);
    const dialog = promptDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const dialogBox = await dialog.boundingBox();
    const navBox = await page.getByRole('navigation', { name: he.nav.label }).boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(375);
  });
});
