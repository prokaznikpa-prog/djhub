import { test, expect } from '@playwright/test';

test('логин с неправильным паролем не проходит', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('email@example.com').fill('test@test.com');
  await page.locator('input[type="password"]').fill('wrongpassword');

  await page.locator('button[type="submit"]').click();

  await page.waitForTimeout(2000);

  await expect(page).toHaveURL(/login/);
});