import { test, expect } from './fixtures';

test.describe('Flow 5: Precision Speed Slider & Playback Controls', () => {
  test('adjusting speed slider updates rate and aria attributes', async ({ simPage }) => {
    const speedSlider = simPage.locator('#speedSlider');
    await expect(speedSlider).toBeVisible();

    // Verify initial slider configuration
    await expect(speedSlider).toHaveAttribute('min', '0');
    await expect(speedSlider).toHaveAttribute('max', '500');

    // Change speed to 100x via input event
    await speedSlider.fill('100');
    await speedSlider.dispatchEvent('input');

    const speedVal = simPage.locator('#speedVal');
    await expect(speedVal).toHaveText('100×');
    await expect(speedSlider).toHaveAttribute('aria-valuenow', '100');

    // Map 0 to strictly 1x real-time
    await speedSlider.fill('0');
    await speedSlider.dispatchEvent('input');
    await expect(speedVal).toHaveText('1×');
    await expect(speedSlider).toHaveAttribute('aria-valuenow', '1');
  });
});
