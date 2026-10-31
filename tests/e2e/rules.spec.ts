import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { createRule, logRows, visit } from './helpers';

test.describe('rules and capture (US-004 to US-007)', () => {
  test('US-005: a fresh install captures nothing', async ({ context, openOptions, site }) => {
    const options = await openOptions();
    await visit(context, site.url);
    await options.waitForTimeout(800);

    await expect(options.getByText('No rules yet.')).toBeVisible();
    await expect(options.getByText('Nothing captured yet.')).toBeVisible();
  });

  test('US-004: shows the rule as one sentence and saves it only once approved', async ({
    openOptions,
  }) => {
    const options = await openOptions();
    await options.getByRole('button', { name: 'New rule' }).click();
    await options.getByLabel('Site', { exact: true }).fill('http://localhost:8080/page');
    await options.getByLabel('Cookie names').fill('sid theme');
    await options.getByRole('button', { name: 'Review rule' }).click();

    await expect(
      options.getByText("Save the cookies sid and theme from localhost to Conduit's local log."),
    ).toBeVisible();
    await expect(options.getByText('No rules yet.')).toBeVisible();

    await options.getByRole('button', { name: 'Approve and save' }).click();
    const rule = options.getByRole('listitem').filter({ hasText: 'sid and theme' });
    await expect(rule.getByText('Active', { exact: true })).toBeVisible();
  });

  test('US-004: explains what is wrong with what was typed', async ({ openOptions }) => {
    const options = await openOptions();
    await options.getByRole('button', { name: 'New rule' }).click();

    await options.getByRole('button', { name: 'Review rule' }).click();
    await expect(options.getByText('Enter a site, for example example.com.')).toBeVisible();
    await expect(options.getByText('Enter at least one cookie name.')).toBeVisible();

    await options.getByLabel('Site', { exact: true }).fill('example.com');
    await options.getByLabel('Cookie names').fill('a=b');
    await options.getByRole('button', { name: 'Review rule' }).click();
    await expect(options.getByText(/"a=b" is not a valid cookie name/)).toBeVisible();
    await expect(options.getByLabel('Cookie names')).toHaveAttribute('aria-invalid', 'true');
  });

  test('US-006: an approved rule saves each new value to the log, hidden until shown', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');

    await visit(context, `${site.url}?sid=first-value-123456`);
    await expect(logRows(options)).toHaveCount(2);
    const entry = logRows(options).nth(1);
    await expect(entry.getByText('firs…3456')).toBeVisible();
    await expect(entry.getByText('first-value-123456')).toHaveCount(0);
    await expect(entry.getByText(/^\d+ bytes$/)).toBeVisible();
    await expect(entry.getByText('Conduit log')).toBeVisible();
    await expect(
      entry.getByText("Save the cookie sid from localhost to Conduit's local log."),
    ).toBeVisible();

    await entry.getByRole('button', { name: /Show captured value of sid/ }).click();
    await expect(entry.getByText('first-value-123456')).toBeVisible();

    await visit(context, `${site.url}?sid=second-value-654321`);
    await expect(logRows(options)).toHaveCount(3);
    await expect(logRows(options).nth(1).getByText('seco…4321')).toBeVisible();

    await visit(context, `${site.url}?sid=second-value-654321`);
    await options.waitForTimeout(800);
    await expect(logRows(options)).toHaveCount(3);
  });

  test('US-006: only the cookies a rule names are captured', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');

    await visit(context, site.url);

    await expect(logRows(options)).toHaveCount(2);
    await expect(options.getByRole('table').getByText('theme')).toHaveCount(0);
    await expect(options.getByRole('table').getByText('token')).toHaveCount(0);
  });

  test('US-005: "Capture now" saves the current value once', async ({
    context,
    openOptions,
    site,
  }) => {
    await visit(context, `${site.url}?sid=already-there-9876`);
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');

    await options.getByRole('button', { name: 'Capture now' }).click();
    await expect(options.getByText('Captured 1 new value.')).toBeVisible();
    await expect(logRows(options)).toHaveCount(2);

    await options.getByRole('button', { name: 'Capture now' }).click();
    await expect(
      options.getByText('Nothing new to capture: the values have not changed.'),
    ).toBeVisible();
    await expect(logRows(options)).toHaveCount(2);
  });

  test('US-005: the kill switch halts capture and shows in the popup, the page and the toolbar badge', async ({
    context,
    openOptions,
    openPopup,
    site,
  }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');
    const popup = await openPopup();
    await expect(popup.getByText('1 of 1 rule is capturing.')).toBeVisible();

    await popup.getByRole('button', { name: 'Pause all capture' }).click();
    await expect(popup.getByText('Capture is paused.')).toBeVisible();
    await expect(options.getByText('Capture is paused', { exact: true })).toBeVisible();
    await expect(options.getByText('Paused', { exact: true })).toBeVisible();
    await expect.poll(() => popup.evaluate(() => chrome.action.getBadgeText({}))).toBe('OFF');

    await visit(context, `${site.url}?sid=while-paused-1234567`);
    await options.waitForTimeout(800);
    await expect(options.getByText('Nothing captured yet.')).toBeVisible();

    await options.getByRole('button', { name: 'Resume capture' }).click();
    await expect(options.getByText('Active', { exact: true })).toBeVisible();
    await expect.poll(() => popup.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    await visit(context, `${site.url}?sid=after-resume-7654321`);
    await expect(logRows(options)).toHaveCount(2);
    await expect(logRows(options).nth(1).getByText('afte…4321')).toBeVisible();
  });

  test('US-005: a rule switched off captures nothing until switched back on', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');

    await options.getByRole('switch', { name: 'On' }).uncheck();
    await expect(options.getByText('Off', { exact: true })).toBeVisible();
    await visit(context, `${site.url}?sid=while-off-1234567`);
    await options.waitForTimeout(800);
    await expect(options.getByText('Nothing captured yet.')).toBeVisible();

    await options.getByRole('switch', { name: 'On' }).check();
    await visit(context, `${site.url}?sid=back-on-7654321`);
    await expect(logRows(options)).toHaveCount(2);
  });

  test('US-005: deleting a rule asks first', async ({ openOptions }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');

    await options.getByRole('button', { name: 'Delete' }).click();
    await options.getByRole('button', { name: 'Keep rule' }).click();
    await expect(options.getByRole('listitem')).toHaveCount(1);

    await options.getByRole('button', { name: 'Delete' }).click();
    await options.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(options.getByText('No rules yet.')).toBeVisible();
  });

  test('US-007: exporting a rule writes what it does, not its approval', async ({
    openOptions,
  }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid theme');

    const downloading = options.waitForEvent('download');
    await options.getByRole('button', { name: 'Export rules' }).click();
    const download = await downloading;
    const exported = JSON.parse(readFileSync((await download.path()) || '', 'utf8')) as unknown;

    expect(download.suggestedFilename()).toBe('conduit-rules.json');
    expect(exported).toEqual({
      conduit: 1,
      kind: 'rules',
      rules: [
        {
          kind: 'cookie',
          site: 'localhost',
          names: ['sid', 'theme'],
          destination: { kind: 'log' },
        },
      ],
    });
  });

  test('US-007: an imported rule arrives off, whatever the file claims, until approved', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    const hostile = {
      conduit: 1,
      kind: 'rules',
      rules: [
        {
          kind: 'cookie',
          site: 'localhost',
          names: ['sid'],
          destination: { kind: 'log' },
          enabled: true,
          approvedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    };
    await options.locator('input[type=file]').setInputFiles({
      name: 'rules.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(hostile)),
    });

    const rule = options.getByRole('listitem').filter({ hasText: 'sid from localhost' });
    await expect(rule.getByText('Needs approval')).toBeVisible();
    await expect(rule.getByRole('switch', { name: 'On' })).toBeDisabled();
    await visit(context, `${site.url}?sid=imported-value-123`);
    await options.waitForTimeout(800);
    await expect(options.getByText('Nothing captured yet.')).toBeVisible();

    await rule.getByRole('button', { name: 'Review and approve' }).click();
    await expect(
      rule.getByText("Save the cookie sid from localhost to Conduit's local log.").first(),
    ).toBeVisible();
    await rule.getByRole('button', { name: 'Approve and switch on' }).click();
    await expect(rule.getByText('Active', { exact: true })).toBeVisible();

    await visit(context, `${site.url}?sid=approved-value-123`);
    await expect(logRows(options)).toHaveCount(2);
  });

  test('US-007: a file that is not a rules file is refused with a reason', async ({
    openOptions,
  }) => {
    const options = await openOptions();

    await options.locator('input[type=file]').setInputFiles({
      name: 'rules.json',
      mimeType: 'application/json',
      buffer: Buffer.from('nope'),
    });

    await expect(options.getByText('That file is not valid JSON.')).toBeVisible();
    await expect(options.getByText('No rules yet.')).toBeVisible();
  });

  test('US-006: the downloaded log has the values, and clearing asks first', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');
    await visit(context, `${site.url}?sid=download-me-1234567`);
    await expect(logRows(options)).toHaveCount(2);

    const downloading = options.waitForEvent('download');
    await options.getByRole('button', { name: 'Download log' }).click();
    const download = await downloading;
    const saved = JSON.parse(readFileSync((await download.path()) || '', 'utf8')) as {
      entries: { data: Record<string, string> }[];
    };
    expect(saved.entries[0]?.data).toEqual({ sid: 'download-me-1234567' });

    await options.getByRole('button', { name: 'Clear log' }).click();
    await options.getByRole('button', { name: 'Keep log' }).click();
    await expect(logRows(options)).toHaveCount(2);
    await options.getByRole('button', { name: 'Clear log' }).click();
    await options.getByRole('button', { name: 'Confirm clear log' }).click();
    await expect(options.getByText('Nothing captured yet.')).toBeVisible();
  });

  test('US-005: the popup says when there are no rules, and opens the rules page', async ({
    context,
    openPopup,
  }) => {
    const popup = await openPopup();
    await expect(popup.getByText('No rules yet, so nothing is being captured.')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Pause all capture' })).toBeHidden();

    const opening = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'Manage rules' }).click();
    const page = await opening;
    await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible();
  });

  test("the popup fits Chrome's 600px popup height with rules and cookies showing", async ({
    context,
    openOptions,
    openPopup,
    site,
  }) => {
    await createRule(await openOptions(), 'localhost', 'sid');
    await visit(context, site.url);
    const popup = await openPopup(site.url);
    await popup.setViewportSize({ width: 380, height: 300 });
    await expect(popup.getByText('1 of 1 rule is capturing.')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Download' })).toBeVisible();

    const height = await popup.evaluate(() => document.documentElement.scrollHeight);

    expect(height).toBeLessThanOrEqual(600);
  });

  test('the page fits a phone-width screen without sideways scrolling', async ({
    context,
    openOptions,
    site,
  }) => {
    const options = await openOptions();
    await options.setViewportSize({ width: 375, height: 800 });
    await createRule(options, 'localhost', 'sid theme');
    await visit(context, `${site.url}?sid=narrow-screen-1234567`);
    await expect(logRows(options)).toHaveCount(3);

    const overflow = await options.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the rules page has no accessibility violations (${scheme})`, async ({
      context,
      openOptions,
      site,
    }) => {
      const options = await openOptions();
      await options.emulateMedia({ colorScheme: scheme });
      await createRule(options, 'localhost', 'sid');
      await visit(context, `${site.url}?sid=scan-value-1234567`);
      await expect(logRows(options)).toHaveCount(2);
      await logRows(options)
        .nth(1)
        .getByRole('button', { name: /Show captured value/ })
        .click();
      await options.locator('input[type=file]').setInputFiles({
        name: 'rules.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            conduit: 1,
            kind: 'rules',
            rules: [
              { kind: 'cookie', site: 'example.com', names: ['a'], destination: { kind: 'log' } },
            ],
          }),
        ),
      });
      await options.getByRole('button', { name: 'Review and approve' }).click();
      await options.getByRole('button', { name: 'New rule' }).click();
      await options.getByRole('button', { name: 'Review rule' }).click();
      await options.getByRole('button', { name: 'About rules' }).click();
      await expect(options.getByText('Enter a site, for example example.com.')).toBeVisible();

      const results = await new AxeBuilder({ page: options })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
