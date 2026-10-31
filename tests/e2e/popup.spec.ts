import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test.describe('popup (US-015, US-016)', () => {
  test('shows the Conduit heading, with no console errors', async ({ popup: page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Cookies for this site' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('US-015: the theme toggle switches theme and remembers the choice', async ({
    popup: page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    const toggle = page.locator('#bk-theme');

    await expect(toggle).toHaveAttribute('aria-label', 'Switch to a dark background');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to a light background');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('US-015: the toggle describes the current theme on first load in a dark system', async ({
    popup: page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    const toggle = page.locator('#bk-theme');

    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to a light background');
  });

  test('US-016: the info button shows and hides its text, by keyboard', async ({ popup: page }) => {
    const info = page.getByRole('button', { name: 'About this screen' });
    const panel = page.locator('#info-status');

    await expect(panel).toBeHidden();
    await info.focus();
    await page.keyboard.press('Enter');
    await expect(info).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(info).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`has no automatically detectable accessibility violations (${scheme}, info open)`, async ({
      popup: page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.reload();
      await page.getByRole('button', { name: 'About this screen' }).click();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
