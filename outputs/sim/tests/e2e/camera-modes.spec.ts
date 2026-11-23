import { test, expect } from './fixtures';

test.describe('Dual-Reference-Frame Camera System & Cinema Mode', () => {
  test('camera mode reflects satellite inspection and reset to planet view via Home / Escape', async ({ simPage }) => {
    const viewCanvas = simPage.locator('#view');
    await expect(viewCanvas).toBeVisible();

    // Select satellite #1 (Cartosat) to inspect
    const firstSat = simPage.locator('.obj[data-kind="sat"]').first();
    await firstSat.click();
    await expect(firstSat).toHaveClass(/sel/);

    // Press Escape or Home to smoothly reset to planet view
    await simPage.keyboard.press('Escape');
    await expect(viewCanvas).toBeVisible();
  });

  test('cinema mode toggles smoothly via CINEMA button and restores via exit button', async ({ simPage }) => {
    const cinemaBtn = simPage.locator('#cinemaBtn');
    const exitBtn = simPage.locator('#exitCinemaBtn');
    const body = simPage.locator('body');

    await expect(cinemaBtn).toBeVisible();
    await expect(exitBtn).toBeHidden();
    await expect(body).not.toHaveAttribute('data-cinema', 'true');

    // Click CINEMA button
    await cinemaBtn.click();
    await expect(body).toHaveAttribute('data-cinema', 'true');
    await expect(exitBtn).toBeVisible();

    // Click Exit Cinema button
    await exitBtn.click();
    await expect(body).not.toHaveAttribute('data-cinema', 'true');
    await expect(exitBtn).toBeHidden();
  });
});
