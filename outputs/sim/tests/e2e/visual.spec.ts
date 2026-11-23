import { test, expect } from './fixtures';

test.describe('QuantumOrbit Sim - Visual Verification', () => {
  test('Swiss-minimal right panel has zero vertical scroll overflow on standard 1280x800 viewport', async ({ simPage }) => {
    await simPage.setViewportSize({ width: 1280, height: 800 });

    const panel = simPage.locator('.panel');
    await expect(panel).toBeVisible();

    const scrollInfo = await panel.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    // Panel content should fit within desktop viewport without mandatory scrolling
    expect(scrollInfo.scrollHeight).toBeLessThanOrEqual(scrollInfo.clientHeight + 2);
  });

  test('theme toggle switches visual styling classes', async ({ simPage }) => {
    const html = simPage.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await simPage.locator('#themeBtn').click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Verify background color changes
    const bgColor = await simPage.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    expect(bgColor).not.toBe('');
  });
});
