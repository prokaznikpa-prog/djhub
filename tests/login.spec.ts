import { test, expect } from '@playwright/test';

test('логин работает', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('email@example.com').fill('test@test.com');
  await page.locator('input[type="password"]').fill('12345678');

  await page.locator('button[type="submit"]').click();

  await page.waitForTimeout(3000);

  await expect(page).not.toHaveURL(/login/);
});