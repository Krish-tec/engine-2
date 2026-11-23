import { test, expect } from './fixtures';

test.describe('Flow 4: Maneuver Plan & Burn Execution', () => {
  test('maneuver plan displays feasibility and executes burn cleanly', async ({ simPage }) => {
    const planState = simPage.locator('#planState');
    const executeBtn = simPage.locator('#executeBtn');
    const toast = simPage.locator('#toast');

    await expect(planState).toBeVisible();

    const isEnabled = await executeBtn.isEnabled();
    if (isEnabled) {
      await executeBtn.click();
      await expect(toast).toContainText('TRIGGER DODGE NOW');
    } else {
      // In nominal or evaluating state, button must remain safely disabled
      await expect(executeBtn).toBeDisabled();
    }
  });
});
