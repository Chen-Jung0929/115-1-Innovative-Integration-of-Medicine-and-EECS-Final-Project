import { test, expect } from '@playwright/test';
import { verifySite } from './site';

test('published HTTPS site serves this commit and its assets', async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  expect(new URL(baseURL!).protocol).toBe('https:');
  // Pages edges may briefly serve the preceding release after a successful deployment.
  await expect(async () => {
    await verifySite(page, baseURL!);
  }).toPass({ timeout: 120_000, intervals: [3_000, 8_000, 15_000] });
});
