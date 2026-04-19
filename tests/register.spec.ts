import { test, expect } from '@playwright/test';

test('регистрация работает', async ({ page }) => {
  await page.goto('/register');

  const email = `test${Date.now()}@test.com`;

  // выбираем роль
  await page.getByRole('button', { name: 'DJ' }).click();

  await page.getByPlaceholder('email@example.com').fill(email);
  await page.locator('input[type="password"]').nth(0).fill('12345678');
  await page.locator('input[type="password"]').nth(1).fill('12345678');

  await page.locator('button[type="submit"]').click();

  await page.waitForTimeout(3000);

  await expect(page).not.toHaveURL(/register/);
});