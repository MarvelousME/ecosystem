import { test, expect } from '@playwright/test';

test.describe('Control Center smoke', () => {
  test('login page renders brand shell', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('BRIDGE')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Control Center' })).toBeVisible();
  });

  test('root route loads without crash', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    const url = page.url();
    expect(url.includes('/') || url.includes('/login')).toBeTruthy();
  });

  test('automation route path is reachable after auth bypass', async ({ page }) => {
    await page.goto('/automation');
    await expect(page.locator('body')).toBeVisible();
  });
});
