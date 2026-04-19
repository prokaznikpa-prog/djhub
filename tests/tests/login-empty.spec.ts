import { test, expect } from '@playwright/test';

test('логин с пустыми полями не проходит', async ({ page }) => {
  await page.goto('/login');

  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/login/);
});