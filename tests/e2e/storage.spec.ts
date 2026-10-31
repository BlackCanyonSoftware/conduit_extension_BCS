import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import type { BrowserContext } from '@playwright/test';
import { connectApp, deliveryRows, logRows } from './helpers';

type Capture = 'cookie' | 'request' | 'response' | 'local' | 'session';
interface Keep {
  type: 'regex' | 'jsonpath';
  text: string;
}

/**
 * Opens a page on the test site and leaves it open, as a person browsing does. Conduit reads a
 * page's storage once it has loaded, so the tab has to be there for that.
 */
async function visit(context: BrowserContext, url: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(url);
}

/** Fills in and approves a rule through the page, as a person would. */
async function createRuleOf(
  options: Page,
  capture: Capture,
  names: string,
  keep?: Keep,
): Promise<void> {
  await options.getByRole('button', { name: 'New rule' }).click();
  await options.getByLabel('What to capture').selectOption(capture);
  await options.getByLabel('Site', { exact: true }).fill('localhost');
  await options.getByLabel(/^(Cookie names|Header names|Storage keys)$/).fill(names);
  if (keep) {
    await options.getByLabel('Keep').selectOption(keep.type);
    await options.getByLabel(/^(Pattern|Path)$/).fill(keep.text);
  }
  await options.getByRole('button', { name: 'Review rule' }).click();
  await options.getByRole('button', { name: 'Approve and save' }).click();
  await expect(options.getByText('Rule saved and switched on.')).toBeVisible();
}

test.describe('storage reads (US-013)', () => {
  test('shows a storage rule as one sentence before it is approved', async ({ openOptions }) => {
    const options = await openOptions();
    await options.getByRole('button', { name: 'New rule' }).click();
    await options.getByLabel('What to capture').selectOption('session');
    await options.getByLabel('Site', { exact: true }).fill('localhost');
    await options.getByLabel('Storage keys').fill('Token draft');
    await options.getByRole('button', { name: 'Review rule' }).click();

    await expect(
      options.getByText(
        "Save the sessionStorage keys Token and draft from localhost to Conduit's local log.",
      ),
    ).toBeVisible();
    await expect(options.getByText('No rules yet.')).toBeVisible();
  });

  test('explains what is wrong with the keys', async ({ openOptions }) => {
    const options = await openOptions();
    await options.getByRole('button', { name: 'New rule' }).click();
    await options.getByLabel('What to capture').selectOption('local');
    await options.getByRole('button', { name: 'Review rule' }).click();

    await expect(options.getByText('Enter at least one key.')).toBeVisible();
  });

  test('records the named localStorage key when a page loads, and not the others', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRuleOf(options, 'local', 'conduit-local');

    await visit(context, `${site.url}?local=local-secret-0123456789`);

    await expect(logRows(options)).toHaveCount(2);
    const entry = logRows(options).nth(1);
    await expect(entry.getByText('loca…6789')).toBeVisible();
    await expect(entry.getByText('local-secret-0123456789')).toHaveCount(0);
    await expect(
      entry.getByText(
        "Save the localStorage key conduit-local from localhost to Conduit's local log.",
      ),
    ).toBeVisible();
    await entry.getByRole('button', { name: /Show captured value of conduit-local/ }).click();
    await expect(entry.getByText('local-secret-0123456789')).toBeVisible();
    await expect(options.getByRole('table').getByText('conduit-other')).toHaveCount(0);
    await expect(options.getByRole('table').getByText('conduit-session')).toHaveCount(0);
  });

  test('records sessionStorage separately, and only new values', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRuleOf(options, 'session', 'conduit-session');

    await visit(context, `${site.url}?session=first-session-0001`);
    await expect(logRows(options)).toHaveCount(2);
    await visit(context, `${site.url}?session=first-session-0001`);
    await options.waitForTimeout(800);
    await expect(logRows(options)).toHaveCount(2);
    await visit(context, `${site.url}?session=second-session-0002`);
    await expect(logRows(options)).toHaveCount(3);
  });

  test('"Capture now" reads an open page, and asks for one when there is none', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRuleOf(options, 'local', 'conduit-local');

    await options.getByRole('button', { name: 'Capture now' }).click();
    await expect(
      options.getByText('Open a page on localhost first, then run the rule again.'),
    ).toBeVisible();

    const page = await context.newPage();
    await page.goto(`${site.url}?local=open-page-value-77`);
    await expect(logRows(options)).toHaveCount(2);
    await options.getByRole('button', { name: 'Capture now' }).click();
    await expect(
      options.getByText('Nothing new to capture: the values have not changed.'),
    ).toBeVisible();
    await page.close();
  });

  test('stops when the rule is switched off', async ({ context, openOptions, site }) => {
    const options = await openOptions();
    await createRuleOf(options, 'local', 'conduit-local');
    await visit(context, `${site.url}?local=one-local-value-01`);
    await expect(logRows(options)).toHaveCount(2);

    await options.getByRole('switch', { name: 'On' }).uncheck();
    await visit(context, `${site.url}?local=two-local-value-02`);
    await options.waitForTimeout(800);
    await expect(logRows(options)).toHaveCount(2);
  });

  test('an app can ask for a storage key, and receives only that key', async ({
    context,
    openOptions,
    site,
    testSink,
  }) => {
    (testSink.handshake.wants as unknown[]).push({
      id: 'local-want',
      kind: 'storage',
      area: 'local',
      origin: 'http://localhost',
      names: ['conduit-local'],
      why: 'The test app wants the value the page keeps.',
    });
    const options = await openOptions();

    await connectApp(options, testSink.url);
    await options
      .getByRole('checkbox', { name: /the localStorage key conduit-local from localhost/ })
      .check();
    await options.getByRole('button', { name: 'Add app and approve 1 request' }).click();
    await expect(options.getByText(/1 request approved\./)).toBeVisible();

    await visit(context, `${site.url}?local=sent-local-value-9`);

    await expect.poll(() => testSink.received.length).toBe(1);
    expect(testSink.received[0]).toMatchObject({
      status: 204,
      body: {
        id: 'local-want',
        origin: site.url.replace(/\/$/, ''),
        data: { 'conduit-local': 'sent-local-value-9' },
      },
    });
    await expect(
      deliveryRows(options).nth(1).getByText('Delivered', { exact: true }),
    ).toBeVisible();
    expect(await options.getByRole('table', { name: 'Delivery log' }).innerText()).not.toContain(
      'sent-local-value-9',
    );
  });
});

test.describe('extractors (US-014)', () => {
  test('a rule keeps only one field of a JSON value, and says so in its sentence', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRuleOf(options, 'local', 'conduit-json', { type: 'jsonpath', text: '$.token' });

    await visit(context, `${site.url}?tok=field-token-abcdef`);

    await expect(logRows(options)).toHaveCount(2);
    const entry = logRows(options).nth(1);
    await expect(
      entry.getByText(
        "Save the localStorage key conduit-json from localhost, keeping only the field $.token, to Conduit's local log.",
      ),
    ).toBeVisible();
    await entry.getByRole('button', { name: /Show captured value of conduit-json/ }).click();
    await expect(entry.getByText('field-token-abcdef', { exact: true })).toBeVisible();
    await expect(entry.getByText('visits')).toHaveCount(0);
  });

  test('a change elsewhere in the value is not a new capture', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRuleOf(options, 'local', 'conduit-json', { type: 'jsonpath', text: '$.token' });

    // The page stores a new timestamp in the same JSON on every visit.
    await visit(context, `${site.url}?tok=same-token-123456`);
    await expect(logRows(options)).toHaveCount(2);
    await visit(context, `${site.url}?tok=same-token-123456`);
    await options.waitForTimeout(800);
    await expect(logRows(options)).toHaveCount(2);
    await visit(context, `${site.url}?tok=other-token-654321`);
    await expect(logRows(options)).toHaveCount(3);
  });

  test('a pattern keeps the first group of a cookie', async ({ context, openOptions, site }) => {
    const options = await openOptions();
    await createRuleOf(options, 'cookie', 'sid', { type: 'regex', text: 'def(\\d+)' });

    await visit(context, `${site.url}?sid=abc123def456ghi789`);

    await expect(logRows(options)).toHaveCount(2);
    const entry = logRows(options).nth(1);
    await entry.getByRole('button', { name: /Show captured value of sid/ }).click();
    await expect(entry.getByText('456', { exact: true })).toBeVisible();
    await expect(entry.getByText('abc123def456ghi789')).toHaveCount(0);
  });

  test('a value the extractor cannot be applied to is not captured', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRuleOf(options, 'local', 'conduit-local', { type: 'jsonpath', text: '$.token' });

    await visit(context, site.url);
    await options.waitForTimeout(800);

    await expect(options.getByText('Nothing captured yet.')).toBeVisible();
  });

  test('an app receives only the extracted field', async ({
    context,
    openOptions,
    site,
    testSink,
  }) => {
    (testSink.handshake.wants as unknown[]).push({
      id: 'json-want',
      kind: 'storage',
      origin: 'http://localhost',
      names: ['conduit-json'],
      extract: { type: 'jsonpath', path: '$.token' },
      why: 'The test app only needs the token inside the stored value.',
    });
    const options = await openOptions();

    await connectApp(options, testSink.url);
    await expect(
      options.getByText(/keeping only the field \$\.token, to 127\.0\.0\.1/),
    ).toBeVisible();
    await options.getByRole('checkbox', { name: /conduit-json/ }).check();
    await options.getByRole('button', { name: 'Add app and approve 1 request' }).click();
    await expect(options.getByText(/1 request approved\./)).toBeVisible();

    await visit(context, `${site.url}?tok=app-token-4242`);

    await expect.poll(() => testSink.received.length).toBe(1);
    expect(testSink.received[0]).toMatchObject({
      body: { id: 'json-want', data: { 'conduit-json': 'app-token-4242' } },
    });
  });

  test('explains what is wrong with a pattern or a path', async ({ openOptions }) => {
    const options = await openOptions();
    await options.getByRole('button', { name: 'New rule' }).click();
    await options.getByLabel('Site', { exact: true }).fill('example.com');
    await options.getByLabel('Cookie names').fill('sid');

    await options.getByLabel('Keep').selectOption('regex');
    await options.getByLabel('Pattern').fill('(a+)+$');
    await options.getByRole('button', { name: 'Review rule' }).click();
    await expect(options.getByText(/repeats a repeat/)).toBeVisible();
    await expect(options.getByLabel('Pattern')).toHaveAttribute('aria-invalid', 'true');

    await options.getByLabel('Keep').selectOption('jsonpath');
    await options.getByLabel('Path').fill('user.name');
    await options.getByRole('button', { name: 'Review rule' }).click();
    await expect(options.getByText(/must start with \$/)).toBeVisible();
    await expect(options.getByText('No rules yet.')).toBeVisible();
  });

  test('storage rules and extractors survive export and import, switched off', async ({
    openOptions,
  }) => {
    const options = await openOptions();
    await createRuleOf(options, 'session', 'conduit-session', {
      type: 'jsonpath',
      text: '$.a.b',
    });

    const [download] = await Promise.all([
      options.waitForEvent('download'),
      options.getByRole('button', { name: 'Export rules' }).click(),
    ]);
    const path = await download.path();
    const file = JSON.parse(readFileSync(path, 'utf8')) as { rules: unknown[] };
    expect(file.rules).toEqual([
      {
        kind: 'storage',
        area: 'session',
        extract: { type: 'jsonpath', path: '$.a.b' },
        site: 'localhost',
        names: ['conduit-session'],
        destination: { kind: 'log' },
      },
    ]);

    await options.getByRole('button', { name: 'Delete' }).click();
    await options.getByRole('button', { name: 'Confirm delete' }).click();
    await options.locator('input[type=file]').setInputFiles(path);
    const rule = options.getByRole('listitem').filter({ hasText: 'sessionStorage key' });
    await expect(rule.getByText('Needs approval')).toBeVisible();
    await expect(rule.getByText(/keeping only the field \$\.a\.b/)).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the form with storage and an extractor has no accessibility violations (${scheme})`, async ({
      openOptions,
    }) => {
      const options = await openOptions();
      await options.emulateMedia({ colorScheme: scheme });
      await options.getByRole('button', { name: 'New rule' }).click();
      await options.getByLabel('What to capture').selectOption('local');
      await options.getByLabel('Keep').selectOption('regex');
      await options.getByLabel('Pattern').fill('(');
      await options.getByRole('button', { name: 'Review rule' }).click();
      await expect(options.getByText('That is not a valid pattern.')).toBeVisible();

      const results = await new AxeBuilder({ page: options })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
