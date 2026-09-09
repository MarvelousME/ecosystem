import { test, expect } from '@playwright/test';

/**
 * Visual baselines are OS-specific (Playwright embeds platform in snapshot names).
 * Generate locally: `npm run test:e2e:update`
 * Skip in CI unless LINUX/WIN baselines for that runner are committed.
 */
test.describe('Visual regression', () => {
  test.skip(!!process.env.CI, 'Commit platform-matched snapshots before enabling in CI');

  test('login visual snapshot', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('visual-login.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });
});
