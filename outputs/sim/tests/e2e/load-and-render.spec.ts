import { test, expect } from './fixtures';

test.describe('Flow 1: Load and Render', () => {
  test('app loads and renders the canvas without console or page errors', async ({ simPage }) => {
    const viewCanvas = simPage.locator('#view');
    await expect(viewCanvas).toBeVisible();

    // Verify Swiss-minimal status badge is populated with valid state
    const statusBadge = simPage.locator('#statusBadge');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveText(/SAFE|RISK/);

    // Verify loading overlay has disappeared
    const loading = simPage.locator('#loading');
    await expect(loading).toBeHidden();

    // Verify MET is running
    const met = simPage.locator('#met');
    await expect(met).toBeVisible();
    await expect(met).not.toHaveText('—');
  });
});
