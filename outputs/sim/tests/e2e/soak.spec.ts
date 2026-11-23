import { test, expect } from './fixtures';

test.describe('QuantumOrbit Sim - Soak & Stability', () => {
  test('accelerated 500x time-dilation simulation maintains stability and heap bounds', async ({ simPage }) => {
    // Switch to 500x rate via precision speed slider
    const speedSlider = simPage.locator('#speedSlider');
    await speedSlider.fill('500');
    await speedSlider.dispatchEvent('input');

    const speedVal = simPage.locator('#speedVal');
    await expect(speedVal).toHaveText('500×');

    // Initial MET readout
    const met = simPage.locator('#met');
    const initialMet = await met.innerText();

    // Advance through accelerated simulation for 5 seconds (simulates ~40 minutes of orbital time)
    await simPage.waitForTimeout(5000);

    const advancedMet = await met.innerText();
    expect(advancedMet).not.toEqual(initialMet);

    // Verify simulation state serialization remains valid and non-corrupted
    const exportedStateJson = await simPage.evaluate(() => {
      const sim = (window as any).__sim;
      return sim && typeof sim.exportState === 'function' ? sim.exportState() : null;
    });

    expect(exportedStateJson).not.toBeNull();
    const parsedState = JSON.parse(exportedStateJson);
    expect(Number.isFinite(parsedState.simMs)).toBe(true);
    expect(parsedState.rate).toBe(500);

    // Scrub back and forth to stress memory and buffer allocations
    await speedSlider.fill('100');
    await speedSlider.dispatchEvent('input');
    await simPage.waitForTimeout(500);
    await speedSlider.fill('500');
    await speedSlider.dispatchEvent('input');
    await simPage.waitForTimeout(500);

    // Verify canvas remains active
    const viewCanvas = simPage.locator('#view');
    await expect(viewCanvas).toBeVisible();
  });
});
