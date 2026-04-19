import { test, expect } from '@playwright/test';

test('главная страница открывается', async ({ page }) => {
  await page.goto(' http://localhost:8080/');

  // проверка что страница реально загрузилась
  await expect(page.locator('body')).toBeVisible();
});