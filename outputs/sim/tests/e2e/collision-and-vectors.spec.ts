import { test, expect } from './fixtures';

test.describe('Dual Vector Arrows & True Collision Destruction Physics', () => {
  test('Auto-Avoidance AI toggles cleanly between ON and OFFLINE states', async ({ simPage }) => {
    const autoDodgeBtn = simPage.locator('#autoDodgeBtn');
    const planState = simPage.locator('#planState');

    await expect(autoDodgeBtn).toBeVisible();
    await expect(autoDodgeBtn).toHaveAttribute('aria-checked', 'true');

    // Toggle OFF
    await autoDodgeBtn.click();
    await expect(autoDodgeBtn).toHaveAttribute('aria-checked', 'false');
    await expect(planState).toHaveText('OFFLINE');

    // Toggle back ON
    await autoDodgeBtn.click();
    await expect(autoDodgeBtn).toHaveAttribute('aria-checked', 'true');
    await expect(planState).toHaveText('STANDBY');
  });

  test('Test Crash triggers direct collision, impact announcement, and camera recovery', async ({ simPage }) => {
    const testCrashBtn = simPage.locator('#testCrashBtn');
    const autoDodgeBtn = simPage.locator('#autoDodgeBtn');
    const toast = simPage.locator('#toast');

    await expect(testCrashBtn).toBeVisible();

    // Click SIMULATE CRASH
    await testCrashBtn.click();

    // Auto-dodge should immediately switch to OFF
    await expect(autoDodgeBtn).toHaveAttribute('aria-checked', 'false');

    // Toast displays direct collision simulation announcement
    await expect(toast).toContainText('CRASH');

    // Wait for the physical collision & dissolution sequence
    await expect(toast).toContainText('KINETIC IMPACT', { timeout: 15000 });
  });
});
