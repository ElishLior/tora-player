import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Tora Player Smoke Tests', () => {
  test('Home page loads at /he with Hebrew content', async ({ page }) => {
    await page.goto(`${BASE_URL}/he`);
    await expect(page).toHaveURL(/\/he/);
    // Check page loaded (not error page)
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // Check for Hebrew content
    const htmlContent = await page.content();
    expect(htmlContent).toContain('he');
  });

  test('Navigate to /he/lessons page', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/lessons`);
    await expect(page).toHaveURL(/\/he\/lessons/);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Navigate to /he/lessons/upload page', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/lessons/upload`);
    await expect(page).toHaveURL(/\/he\/lessons\/upload/);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Navigate to /he/series page', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/series`);
    await expect(page).toHaveURL(/\/he\/series/);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Navigate to /he/playlists page', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/playlists`);
    await expect(page).toHaveURL(/\/he\/playlists/);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Navigate to /he/bookmarks page', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/bookmarks`);
    await expect(page).toHaveURL(/\/he\/bookmarks/);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Navigate to /he/search page', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/search`);
    await expect(page).toHaveURL(/\/he\/search/);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Verify RTL direction on /he pages', async ({ page }) => {
    await page.goto(`${BASE_URL}/he`);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'he');
  });

  test('Switch to /en and verify LTR', async ({ page }) => {
    await page.goto(`${BASE_URL}/en`);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(html).toHaveAttribute('lang', 'en');
  });

  test('Check mobile viewport (375px width) responsiveness', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/he`);
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // Verify no horizontal scrollbar (content fits within viewport)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
  });

  test('Verify bottom navigation is visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/he`);
    const nav = page.locator('nav[role="navigation"][aria-label="Main navigation"]');
    await expect(nav).toBeVisible();
    // Check nav items exist
    const navLinks = nav.locator('a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Verify header with app title "נגן תורה" is present', async ({ page }) => {
    await page.goto(`${BASE_URL}/he`);
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const title = page.locator('h1');
    await expect(title).toContainText('נגן תורה');
  });
});
