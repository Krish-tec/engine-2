import { test, expect } from './fixtures';

test.describe('Flow 3: Conjunction Analysis', () => {
  test('Swiss-minimal conjunction telemetry & KPI grid render properly', async ({ simPage }) => {
    // Status badge is rendered with an active risk/safe status
    const statusBadge = simPage.locator('#statusBadge');
    await expect(statusBadge).toBeVisible();

    // Active conjunction pair line is rendered
    const pairLabel = simPage.locator('#pairLabel');
    await expect(pairLabel).toBeVisible();
    await expect(pairLabel).not.toHaveText('—');

    // KPI grid cells are populated
    const kpiMiss = simPage.locator('#kpiMiss');
    await expect(kpiMiss).toBeVisible();
    await expect(kpiMiss).not.toHaveText('—');

    const kpiSpeed = simPage.locator('#kpiSpeed');
    await expect(kpiSpeed).toBeVisible();
    await expect(kpiSpeed).not.toHaveText('—');

    const kpiFuel = simPage.locator('#kpiFuel');
    await expect(kpiFuel).toBeVisible();
    await expect(kpiFuel).not.toHaveText('—');
  });
});
