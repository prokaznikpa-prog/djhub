import { test, expect } from '@playwright/test';

test('регистрация с пустыми полями не проходит', async ({ page }) => {
  await page.goto('/signup');

  await page.getByRole('button', { name: 'DJ' }).click();
  await page.locator('button[type="submit"]').click();

 await expect(page).toHaveURL(/signup/);
});