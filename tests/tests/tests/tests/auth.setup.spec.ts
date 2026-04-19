import { test as setup, expect } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('http://localhost:8080/login');

  await page.getByPlaceholder('email@example.com').fill('test15@test.ru');
  await page.locator('input[type="password"]').fill('еуыееуые');

  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/profile');
  await expect(page).toHaveURL(/\/profile/);

  await page.context().storageState({ path: 'storageState.json' });
});