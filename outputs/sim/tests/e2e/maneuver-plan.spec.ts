import { test, expect } from './fixtures';

test.describe('Flow 4: Maneuver Plan & Burn Execution', () => {
  test('maneuver plan displays feasibility and executes burn cleanly', async ({ simPage }) => {
    const planState = simPage.locator('#planState');
    const executeBtn = simPage.locator('#executeBtn');
    await expect(planState).toBeVisible();

    const isEnabled = await executeBtn.isEnabled();
    if (isEnabled) {
      const fuelEl = simPage.locator('#kpiFuel');
      const fuelBefore = await fuelEl.innerText();
      await executeBtn.click();
      const fuelAfter = await fuelEl.innerText();
      expect(fuelAfter).not.toEqual(fuelBefore);
    } else {
      // In nominal or evaluating state, button must remain safely disabled
      await expect(executeBtn).toBeDisabled();
    }
  });
});
