import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { connectApp, deliveryRows, logRows, visit } from './helpers';

/**
 * Opens a page on the test site and leaves it open, as a person browsing does. The test page asks
 * for /ping with a header of its own after it loads; closing the tab the moment it has loaded can
 * cancel that request before the browser has sent it, so there would be nothing to see.
 */
async function browse(context: BrowserContext, url: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(url);
}

/** Fills in and approves a header rule through the page, as a person would. */
async function createHeaderRule(
  options: Page,
  capture: 'request' | 'response',
  site: string,
  names: string,
): Promise<void> {
  await options.getByRole('button', { name: 'New rule' }).click();
  await options.getByLabel('What to capture').selectOption(capture);
  await options.getByLabel('Site', { exact: true }).fill(site);
  await options.getByLabel('Header names').fill(names);
  await options.getByRole('button', { name: 'Review rule' }).click();
  await options.getByRole('button', { name: 'Approve and save' }).click();
  await expect(options.getByText('Rule saved and switched on.')).toBeVisible();
}

test.describe('header capture (US-012)', () => {
  test('a fresh install records no headers', async ({ context, openOptions, site }) => {
    const options = await openOptions();
    await visit(context, site.url);
    await options.waitForTimeout(800);

    await expect(options.getByText('Nothing captured yet.')).toBeVisible();
  });

  test('shows a header rule as one sentence before it is approved', async ({ openOptions }) => {
    const options = await openOptions();
    await options.getByRole('button', { name: 'New rule' }).click();
    await options.getByLabel('What to capture').selectOption('request');
    await options.getByLabel('Site', { exact: true }).fill('localhost');
    await options.getByLabel('Header names').fill('X-Conduit-Req, Authorization');
    await options.getByRole('button', { name: 'Review rule' }).click();

    await expect(
      options.getByText(
        "Save the request headers x-conduit-req and authorization from localhost to Conduit's local log.",
      ),
    ).toBeVisible();
    await expect(options.getByText('No rules yet.')).toBeVisible();
  });

  test('explains what is wrong with a header name', async ({ openOptions }) => {
    const options = await openOptions();
    await options.getByRole('button', { name: 'New rule' }).click();
    await options.getByLabel('What to capture').selectOption('request');
    await options.getByRole('button', { name: 'Review rule' }).click();
    await expect(options.getByText('Enter at least one header name.')).toBeVisible();

    await options.getByLabel('Site', { exact: true }).fill('example.com');
    await options.getByLabel('Header names').fill('bad:name');
    await options.getByRole('button', { name: 'Review rule' }).click();
    await expect(options.getByText(/"bad:name" is not a valid header name/)).toBeVisible();
  });

  test('records only the request header a rule names, and not the others', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createHeaderRule(options, 'request', 'localhost', 'x-conduit-req');

    await browse(context, `${site.url}?req=request-secret-0123456789`);

    await expect(logRows(options)).toHaveCount(2);
    const entry = logRows(options).nth(1);
    await expect(entry.getByText('requ…6789')).toBeVisible();
    await expect(entry.getByText('request-secret-0123456789')).toHaveCount(0);
    await expect(
      entry.getByText(
        "Save the request header x-conduit-req from localhost to Conduit's local log.",
      ),
    ).toBeVisible();
    await entry.getByRole('button', { name: /Show captured value of x-conduit-req/ }).click();
    await expect(entry.getByText('request-secret-0123456789')).toBeVisible();

    await expect(options.getByRole('table').getByText('x-not-asked')).toHaveCount(0);
    await expect(options.getByRole('table').getByText('user-agent')).toHaveCount(0);
  });

  test('records a response header, once for each new value', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createHeaderRule(options, 'response', 'localhost', 'x-conduit-resp');

    await visit(context, `${site.url}?resp=first-response-1234`);
    await expect(logRows(options)).toHaveCount(2);
    await visit(context, `${site.url}?resp=first-response-1234`);
    await options.waitForTimeout(800);
    await expect(logRows(options)).toHaveCount(2);
    await visit(context, `${site.url}?resp=second-response-5678`);
    await expect(logRows(options)).toHaveCount(3);

    await expect(options.getByRole('table').getByText('x-other')).toHaveCount(0);
  });

  test('does not record the other direction', async ({ context, openOptions, site }) => {
    const options = await openOptions();
    await createHeaderRule(options, 'request', 'localhost', 'x-conduit-resp');

    await visit(context, site.url);
    await options.waitForTimeout(800);

    await expect(options.getByText('Nothing captured yet.')).toBeVisible();
  });

  test('stops when the rule is switched off, and starts again when it is switched on', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createHeaderRule(options, 'response', 'localhost', 'x-conduit-resp');
    await visit(context, `${site.url}?resp=one-response-0001`);
    await expect(logRows(options)).toHaveCount(2);

    await options.getByRole('switch', { name: 'On' }).uncheck();
    await visit(context, `${site.url}?resp=two-response-0002`);
    await options.waitForTimeout(800);
    await expect(logRows(options)).toHaveCount(2);

    await options.getByRole('switch', { name: 'On' }).check();
    await visit(context, `${site.url}?resp=three-response-0003`);
    await expect(logRows(options)).toHaveCount(3);
  });

  test('has no capture-now button, because headers are read as pages load', async ({
    openOptions,
  }) => {
    const options = await openOptions();
    await createHeaderRule(options, 'request', 'localhost', 'x-conduit-req');

    await expect(options.getByRole('button', { name: 'Capture now' })).toHaveCount(0);
  });

  test('an app can ask for a header, and receives only that header', async ({
    context,
    openOptions,
    site,
    testSink,
  }) => {
    (testSink.handshake.wants as unknown[]).push({
      id: 'req-header',
      kind: 'header',
      direction: 'request',
      origin: 'http://localhost',
      names: ['X-Conduit-Req'],
      why: 'The test app wants to see the header the page sends.',
    });
    const options = await openOptions();

    await connectApp(options, testSink.url);
    await expect(
      options.getByText(
        `Send the request header x-conduit-req from localhost to 127.0.0.1:${String(testSink.port)} (Test App).`,
      ),
    ).toBeVisible();
    await expect(
      options.getByText('The app says: The test app wants to see the header the page sends.'),
    ).toBeVisible();
    await options.getByRole('checkbox', { name: /the request header x-conduit-req/ }).check();
    await options.getByRole('button', { name: 'Add app and approve 1 request' }).click();
    await expect(options.getByText(/1 request approved\./)).toBeVisible();

    await browse(context, `${site.url}?req=delivered-header-4242`);

    await expect.poll(() => testSink.received.length).toBe(1);
    expect(testSink.received[0]).toMatchObject({
      path: '/conduit/deliver',
      status: 204,
      body: {
        conduit: 1,
        id: 'req-header',
        origin: site.url.replace(/\/$/, ''),
        data: { 'x-conduit-req': 'delivered-header-4242' },
      },
    });
    await expect(
      deliveryRows(options).nth(1).getByText('Delivered', { exact: true }),
    ).toBeVisible();
    expect(JSON.stringify(await deliveryText(options))).not.toContain('delivered-header-4242');
  });

  test('header rules are exported with their direction and come back switched off', async ({
    openOptions,
  }) => {
    const options = await openOptions();
    await createHeaderRule(options, 'response', 'localhost', 'x-conduit-resp');

    const [download] = await Promise.all([
      options.waitForEvent('download'),
      options.getByRole('button', { name: 'Export rules' }).click(),
    ]);
    const path = await download.path();
    const file = JSON.parse(readFileSync(path, 'utf8')) as { rules: Record<string, unknown>[] };
    expect(file.rules).toEqual([
      {
        kind: 'header',
        direction: 'response',
        site: 'localhost',
        names: ['x-conduit-resp'],
        destination: { kind: 'log' },
      },
    ]);

    await options.getByRole('button', { name: 'Delete' }).click();
    await options.getByRole('button', { name: 'Confirm delete' }).click();
    await options.locator('input[type=file]').setInputFiles(path);
    const rule = options
      .getByRole('listitem')
      .filter({ hasText: 'response header x-conduit-resp' });
    await expect(rule.getByText('Needs approval')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the header rule form has no accessibility violations (${scheme})`, async ({
      openOptions,
    }) => {
      const options = await openOptions();
      await options.emulateMedia({ colorScheme: scheme });
      await options.getByRole('button', { name: 'New rule' }).click();
      await options.getByLabel('What to capture').selectOption('response');
      await options.getByRole('button', { name: 'Review rule' }).click();
      await expect(options.getByText('Enter at least one header name.')).toBeVisible();

      const results = await new AxeBuilder({ page: options })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

async function deliveryText(page: Page): Promise<string> {
  return page.getByRole('table', { name: 'Delivery log' }).innerText();
}
