import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Visits the test site so the browser stores its cookies, then opens the popup on it. */
async function openOnSite(
  context: { newPage: () => Promise<Page> },
  openPopup: (url?: string) => Promise<Page>,
  siteUrl: string,
): Promise<Page> {
  const sitePage = await context.newPage();
  await sitePage.goto(siteUrl);
  return openPopup(siteUrl);
}

test.describe('cookie export (US-001, US-002, US-003)', () => {
  test('US-001: lists the site cookies, including HttpOnly ones', async ({
    context,
    openPopup,
    site,
  }) => {
    const popup = await openOnSite(context, openPopup, site.url);

    await expect(popup.getByText('localhost and its subdomains: 3 cookies')).toBeVisible();
    const rows = popup.getByRole('list', { name: 'Cookies for localhost' }).getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: 'sid' }).getByText('HttpOnly')).toBeVisible();
    await expect(rows.filter({ hasText: 'token' }).getByText('Secure')).toBeVisible();
  });

  test('US-003: values are redacted until revealed', async ({ context, openPopup, site }) => {
    const popup = await openOnSite(context, openPopup, site.url);
    const sid = popup.getByRole('listitem').filter({ hasText: 'sid' });

    await expect(sid.getByText('abc1…i789')).toBeVisible();
    await expect(popup.getByText('abc123def456ghi789')).toHaveCount(0);
    await expect(
      popup.getByRole('listitem').filter({ hasText: 'theme' }).getByText('••••••••'),
    ).toBeVisible();

    await sid.getByRole('button', { name: 'Show value of sid' }).click();
    await expect(sid.getByText('abc123def456ghi789')).toBeVisible();
    await sid.getByRole('button', { name: 'Hide value of sid' }).click();
    await expect(sid.getByText('abc1…i789')).toBeVisible();
  });

  test('US-002: only the cookies you tick are copied', async ({ context, openPopup, site }) => {
    const popup = await openOnSite(context, openPopup, site.url);

    await popup.getByRole('checkbox', { name: 'theme' }).uncheck();
    await expect(popup.getByText('2 of 3 selected')).toBeVisible();
    await popup.getByRole('button', { name: 'Cookie header' }).click();
    await popup.getByRole('button', { name: 'Copy' }).click();
    await expect(popup.getByText('Copied 2 cookies as Cookie header.')).toBeVisible();

    const copied = await popup.evaluate(
      () => (window as unknown as { copiedText?: string }).copiedText ?? '',
    );
    expect(copied).toContain('sid=abc123def456ghi789');
    expect(copied).toContain('token=0123456789abcdefXYZ');
    expect(copied).not.toContain('theme=');
    expect(copied.startsWith('Cookie: ')).toBe(true);
  });

  test('US-002: nothing can be exported with no cookies selected', async ({
    context,
    openPopup,
    site,
  }) => {
    const popup = await openOnSite(context, openPopup, site.url);

    await popup.getByRole('checkbox', { name: 'Select all' }).uncheck();

    await expect(popup.getByText('0 of 3 selected')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Copy' })).toBeDisabled();
    await expect(popup.getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  test('US-001: downloads a Netscape cookies.txt that marks HttpOnly cookies', async ({
    context,
    openPopup,
    site,
  }) => {
    const popup = await openOnSite(context, openPopup, site.url);

    const downloading = popup.waitForEvent('download');
    await popup.getByRole('button', { name: 'Download' }).click();
    const download = await downloading;
    const text = readFileSync((await download.path()) || '', 'utf8');

    expect(download.suggestedFilename()).toBe('cookies-localhost.txt');
    expect(text.startsWith('# Netscape HTTP Cookie File\n')).toBe(true);
    expect(text).toContain('#HttpOnly_localhost\tFALSE\t/\tFALSE\t0\tsid\tabc123def456ghi789\n');
    expect(text).toMatch(/localhost\tFALSE\t\/\tFALSE\t\d{10}\ttheme\tdark\n/);
  });

  test('US-001: the JSON format is a parseable array', async ({ context, openPopup, site }) => {
    const popup = await openOnSite(context, openPopup, site.url);

    await popup.getByRole('button', { name: 'JSON' }).click();
    const downloading = popup.waitForEvent('download');
    await popup.getByRole('button', { name: 'Download' }).click();
    const download = await downloading;
    const parsed = JSON.parse(readFileSync((await download.path()) || '', 'utf8')) as {
      name: string;
      httpOnly: boolean;
    }[];

    expect(download.suggestedFilename()).toBe('cookies-localhost.json');
    expect(parsed.map((cookie) => cookie.name).sort()).toEqual(['sid', 'theme', 'token']);
    expect(parsed.find((cookie) => cookie.name === 'sid')?.httpOnly).toBe(true);
  });

  test('says so when the site has no cookies', async ({ openPopup, site }) => {
    const popup = await openPopup(site.url);

    await expect(popup.getByText('No cookies for localhost')).toBeVisible();
  });

  test('asks before reading a site it has not been allowed to read', async ({ openPopup }) => {
    const popup = await openPopup('https://www.not-allowed.example/page');

    await expect(
      popup.getByText('Allow Conduit to read not-allowed.example cookies?'),
    ).toBeVisible();
    await expect(
      popup.getByRole('button', { name: 'Allow access to not-allowed.example' }),
    ).toBeVisible();
    await expect(popup.getByRole('list', { name: /Cookies for/ })).toHaveCount(0);
  });

  test('explains what to do on a page that is not a website', async ({ openPopup }) => {
    const popup = await openPopup();

    await expect(popup.getByText('Open a website first')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`has no accessibility violations in any state (${scheme})`, async ({
      context,
      openPopup,
      site,
    }) => {
      const ready = await openOnSite(context, openPopup, site.url);
      await ready.emulateMedia({ colorScheme: scheme });
      await ready.getByRole('button', { name: 'Show value of sid' }).click();
      const needsAccess = await openPopup('https://not-allowed.example/');
      await needsAccess.emulateMedia({ colorScheme: scheme });
      await expect(needsAccess.getByText('Allow Conduit to read')).toBeVisible();
      const noSite = await openPopup();
      await noSite.emulateMedia({ colorScheme: scheme });
      await expect(noSite.getByText('Open a website first')).toBeVisible();

      for (const page of [ready, needsAccess, noSite]) {
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations, page.url()).toEqual([]);
      }
    });
  }
});
