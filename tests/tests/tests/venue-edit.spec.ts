import { test, expect } from '@playwright/test';

test('venue профиль сохраняет изменения', async ({ page }) => {
  await page.goto('http://localhost:8080/profile');

  // Ждём кнопку редактирования
  await page.waitForSelector('[data-testid="profile-edit-button"]');

  // Кликаем
  await page.getByTestId('profile-edit-button').click();

  // Ждём появления формы
  await page.waitForSelector('[data-testid="venue-name-input"]');

  const newName = `Venue ${Date.now()}`;
  const newContact = `@venue_${Date.now()}`;

  await page.getByTestId('venue-name-input').fill(newName);
  await page.getByTestId('venue-contact-input').fill(newContact);

  await page.getByTestId('profile-save-button').click();

  // Ждём обновления UI (вот это важно)
  await page.waitForTimeout(2000);

  await expect(page.getByTestId('venue-name-input')).toHaveValue(newName);
  await expect(page.getByTestId('venue-contact-input')).toHaveValue(newContact);
});