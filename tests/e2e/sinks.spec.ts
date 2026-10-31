import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, startSink, test } from './fixtures';
import { addAppApproving, connectApp, createRule, deliveryRows, visit } from './helpers';

const sentence = (cookie: string, target: string, name = 'Test App'): string =>
  `Send the cookie ${cookie} from localhost to ${target} (${name}).`;

async function scan(page: Page): Promise<unknown[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations;
}

test.describe('apps that receive captures (US-008 to US-011)', () => {
  test('US-008: shows what an app asks for, with its reason word for word, before anything is approved', async ({
    openOptions,
    testSink,
  }) => {
    const options = await openOptions();
    await connectApp(options, testSink.url);

    await expect(options.getByRole('heading', { name: 'Test App' })).toBeVisible();
    await expect(options.getByText('On this computer', { exact: true })).toBeVisible();
    const requests = options.getByRole('list', { name: 'Requests from Test App' });
    await expect(
      requests.getByText(sentence('sid', `127.0.0.1:${String(testSink.port)}`)),
    ).toBeVisible();
    await expect(
      requests.getByText('The test app wants the sid cookie to check delivery.'),
    ).toBeVisible();
    await expect(requests.getByText('The test app also wants the theme cookie.')).toBeVisible();

    await options.getByRole('button', { name: 'Cancel' }).click();
    await expect(options.getByText('No apps yet.')).toBeVisible();
    await expect(options.getByText('No rules yet.')).toBeVisible();
  });

  test('US-008: approving some requests creates only those rules', async ({
    openOptions,
    testSink,
  }) => {
    const options = await openOptions();

    await addAppApproving(options, testSink.url, ['sid']);

    const rules = options.getByRole('list', { name: 'Rules' });
    await expect(rules.getByRole('listitem')).toHaveCount(1);
    await expect(
      rules.getByText(sentence('sid', `127.0.0.1:${String(testSink.port)}`)),
    ).toBeVisible();
    await expect(rules.getByText('Active', { exact: true })).toBeVisible();
    const app = options.getByRole('list', { name: 'Apps' }).getByRole('listitem');
    await expect(app.getByText('1 rule')).toBeVisible();
    await expect(app.getByText('On this computer')).toBeVisible();
  });

  test('US-009: a changed cookie is delivered as the contract describes, and logged without its value', async ({
    context,
    openOptions,
    site,
    testSink,
  }) => {
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid']);

    await visit(context, `${site.url}?sid=delivered-value-123`);

    await expect.poll(() => testSink.received.length).toBe(1);
    const [delivery] = testSink.received;
    expect(delivery?.path).toBe('/conduit/deliver');
    expect(delivery?.status).toBe(204);
    expect(delivery?.body).toEqual({
      conduit: 1,
      id: 'sid-want',
      captured_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/),
      origin: 'http://localhost',
      data: { sid: 'delivered-value-123' },
    });
    const row = deliveryRows(options).nth(1);
    await expect(row.getByText('Delivered', { exact: true })).toBeVisible();
    await expect(row.getByText(`Test App (127.0.0.1:${String(testSink.port)})`)).toBeVisible();
    await expect(row.getByText(/^\d+ bytes$/)).toBeVisible();
    await expect(options.locator('body')).not.toContainText('delivered-value-123');
  });

  test('US-009: a failure is shown at once, in the page, the popup and the toolbar, and Retry now sends it', async ({
    context,
    openOptions,
    openPopup,
    site,
    testSink,
  }) => {
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid']);
    testSink.failNext(1, 500);

    await visit(context, `${site.url}?sid=will-fail-first-1234`);

    await expect(options.getByText('1 delivery has not gone through')).toBeVisible();
    await expect(options.getByText(/Trying again at/)).toBeVisible();
    const row = deliveryRows(options).nth(1);
    await expect(row.getByText('Retrying', { exact: true })).toBeVisible();
    await expect(row.getByText('The app answered 500.')).toBeVisible();
    const popup = await openPopup();
    await expect(popup.getByText(/A delivery has not gone through\./)).toBeVisible();
    await expect.poll(() => popup.evaluate(() => chrome.action.getBadgeText({}))).toBe('!');

    await options.getByRole('button', { name: 'Retry now' }).click();

    await expect(
      deliveryRows(options).nth(1).getByText('Delivered', { exact: true }),
    ).toBeVisible();
    await expect(options.getByText(/delivery has not gone through/)).toHaveCount(0);
    await expect.poll(() => popup.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    expect(testSink.received.map((item) => item.status)).toEqual([500, 204]);
  });

  test('US-009: Conduit tries again on its own, from an alarm', async ({
    context,
    openOptions,
    site,
    testSink,
  }) => {
    test.setTimeout(120_000);
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid']);
    testSink.failNext(1, 503);

    await visit(context, `${site.url}?sid=retry-by-alarm-1234`);
    await expect(options.getByText('The app answered 503.').first()).toBeVisible();

    await expect(deliveryRows(options).nth(1).getByText('Delivered', { exact: true })).toBeVisible({
      timeout: 75_000,
    });
    expect(testSink.received.map((item) => item.status)).toEqual([503, 204]);
  });

  test('US-005: pausing stops delivery, and resuming restores it', async ({
    context,
    openOptions,
    openPopup,
    site,
    testSink,
  }) => {
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid']);
    const popup = await openPopup();
    await popup.getByRole('button', { name: 'Pause all capture' }).click();
    await expect(popup.getByText('Capture is paused.')).toBeVisible();

    await visit(context, `${site.url}?sid=while-paused-1234567`);
    await options.waitForTimeout(800);
    expect(testSink.received).toHaveLength(0);

    await options.getByRole('button', { name: 'Resume capture' }).click();
    await visit(context, `${site.url}?sid=after-resume-7654321`);

    await expect.poll(() => testSink.received.length).toBe(1);
    expect(testSink.received[0]?.body).toMatchObject({ data: { sid: 'after-resume-7654321' } });
  });

  test('US-005: "Send now" sends the current value even if it was sent before', async ({
    context,
    openOptions,
    site,
    testSink,
  }) => {
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid']);
    await visit(context, `${site.url}?sid=send-it-again-1234`);
    await expect.poll(() => testSink.received.length).toBe(1);

    await options.getByRole('button', { name: 'Send now' }).click();

    await expect(options.getByText(/^Sent 1 value\./)).toBeVisible();
    await expect.poll(() => testSink.received.length).toBe(2);
    expect(testSink.received[1]?.body).toMatchObject({ data: { sid: 'send-it-again-1234' } });
  });

  test('US-011: delivers to the path the app has chosen instead', async ({
    context,
    openOptions,
    site,
    testSink,
  }) => {
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid'], '/api/integrity');
    await expect(options.getByText('Delivers to /api/integrity')).toBeVisible();

    await visit(context, `${site.url}?sid=custom-path-12345`);

    await expect.poll(() => testSink.received.length).toBe(1);
    expect(testSink.received[0]?.path).toBe('/api/integrity');
    expect(testSink.received[0]?.body).toMatchObject({ id: 'sid-want' });
  });

  test('US-010: an app on another computer needs its name typed first', async ({ openOptions }) => {
    const options = await openOptions();

    await connectApp(options, 'http://192.0.2.10:9443');
    await expect(options.locator('#app-url-error')).toHaveText(
      /Apps on other computers must use https\./,
    );

    await options.getByLabel('Address of the app').fill('https://192.0.2.10:9443');
    await options.getByRole('button', { name: 'Connect' }).click();
    await expect(options.getByText('This app is not on this computer')).toBeVisible();
    const proceed = options.getByRole('button', { name: 'Continue' });
    await expect(proceed).toBeDisabled();
    await options.getByLabel('Type 192.0.2.10 to confirm').fill('yes');
    await expect(proceed).toBeDisabled();
    await options.getByLabel('Type 192.0.2.10 to confirm').fill('192.0.2.10');
    await expect(proceed).toBeEnabled();

    await options.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(options.getByLabel('Address of the app')).toHaveValue('https://192.0.2.10:9443');
  });

  test('US-010: an app on another computer stays marked, and its rule says so', async ({
    openOptions,
  }) => {
    const options = await openOptions();
    const stamp = '2026-11-01T00:00:00.000Z';

    await options.evaluate(
      async ({ stamp }) => {
        await chrome.storage.local.set({
          sinks: [
            {
              id: 'far',
              name: 'Far App',
              url: 'https://sink.example.net',
              loopback: false,
              confirmedAt: stamp,
              addedAt: stamp,
            },
          ],
          rules: [
            {
              id: 'far-rule',
              kind: 'cookie',
              site: 'example.com',
              names: ['sid'],
              destination: { kind: 'sink', sinkId: 'far', wantId: 'w' },
              enabled: true,
              createdAt: stamp,
              approvedAt: stamp,
            },
          ],
        });
      },
      { stamp },
    );

    const app = options.getByRole('list', { name: 'Apps' }).getByRole('listitem');
    await expect(app.getByText('Not on this computer')).toBeVisible();
    await expect(
      options.getByText(
        'Send the cookie sid from example.com to sink.example.net (Far App), which is not on this computer.',
      ),
    ).toBeVisible();
  });

  test('US-008: "Look on this computer" finds an app on the usual ports', async ({
    openOptions,
  }) => {
    let sink;
    for (let port = 8778; port <= 8787 && !sink; port += 1) {
      sink = await startSink(port).catch(() => undefined);
    }
    test.skip(!sink, 'none of ports 8778 to 8787 is free on this computer');
    if (!sink) return;
    try {
      const options = await openOptions();

      await options.getByRole('button', { name: 'Look on this computer' }).click();
      await expect(options.getByText(`Test App at ${sink.url}`)).toBeVisible();
      await options.getByRole('button', { name: `Add Test App at ${sink.url}` }).click();
      await options.getByRole('checkbox', { name: /the cookie sid from/ }).check();
      await options.getByRole('button', { name: 'Add app and approve 1 request' }).click();

      await expect(options.getByRole('list', { name: 'Apps' }).getByText('Test App')).toBeVisible();
    } finally {
      await sink.close();
    }
  });

  test('US-008: "Refresh requests" offers what is new and keeps what is approved', async ({
    openOptions,
    testSink,
  }) => {
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid']);
    (testSink.handshake.wants as unknown[]).push({
      id: 'token-want',
      kind: 'cookie',
      origin: 'http://localhost',
      names: ['token'],
      why: 'A newer version of the app also wants the token.',
    });

    await options.getByRole('button', { name: 'Refresh requests from Test App' }).click();

    const requests = options.getByRole('list', { name: 'Requests from Test App' });
    await expect(requests.getByRole('checkbox', { name: /the cookie sid from/ })).toBeDisabled();
    await expect(requests.getByRole('checkbox', { name: /the cookie sid from/ })).toBeChecked();
    await expect(requests.getByText('Approved', { exact: true })).toBeVisible();
    await requests.getByRole('checkbox', { name: /the cookie token from/ }).check();
    await options.getByRole('button', { name: 'Approve 1 request' }).click();

    await expect(options.getByRole('list', { name: 'Rules' }).getByRole('listitem')).toHaveCount(2);
  });

  test('US-008: says what went wrong when an app cannot be reached or does not follow the contract', async ({
    openOptions,
    testSink,
  }) => {
    const options = await openOptions();

    await connectApp(options, 'http://127.0.0.1:1');
    await expect(options.getByText('Could not reach the app. Is it running?')).toBeVisible();

    await options.getByLabel('Address of the app').fill(testSink.url);
    const answers = [
      { text: 'not json', status: 200, message: 'The app answered, but not with JSON.' },
      { text: '', status: 404, message: 'The app answered 404.' },
      {
        text: JSON.stringify({ conduit: 2, name: 'x' }),
        status: 200,
        message: 'This app speaks a different version of Conduit (version 2).',
      },
      {
        text: JSON.stringify({ hello: 1 }),
        status: 200,
        message: 'That address answered, but not as a Conduit app.',
      },
    ];
    for (const { text, status, message } of answers) {
      testSink.answerHandshakeWith(text, status);
      await options.getByRole('button', { name: 'Connect' }).click();
      await expect(options.getByText(message)).toBeVisible();
    }
    await expect(options.getByText('No apps yet.')).toBeVisible();
  });

  test('US-008: a request that cannot be approved is shown with the reason, and no rule is made', async ({
    openOptions,
    testSink,
  }) => {
    (testSink.handshake.wants as unknown[]).push(
      { id: 'no-reason', kind: 'cookie', origin: 'http://localhost', names: ['token'] },
      {
        id: 'indexeddb',
        kind: 'indexeddb',
        origin: 'http://localhost',
        keys: ['X'],
        why: 'Because.',
      },
    );
    const options = await openOptions();

    await connectApp(options, testSink.url);

    const requests = options.getByRole('list', { name: 'Requests from Test App' });
    await expect(
      requests.getByText('The app gave no reason for this request, so it cannot be approved.'),
    ).toBeVisible();
    await expect(requests.getByText('This kind of request is not supported.')).toBeVisible();
    await expect(requests.getByRole('checkbox', { name: 'Request no-reason' })).toBeDisabled();
    await expect(requests.getByRole('checkbox', { name: 'Request indexeddb' })).toBeDisabled();
  });

  test('removing an app removes its rules, after asking', async ({ openOptions, testSink }) => {
    const options = await openOptions();
    await addAppApproving(options, testSink.url, ['sid', 'theme']);

    await options.getByRole('button', { name: 'Remove Test App' }).click();
    await options.getByRole('button', { name: 'Keep app' }).click();
    await expect(options.getByRole('list', { name: 'Rules' }).getByRole('listitem')).toHaveCount(2);

    await options.getByRole('button', { name: 'Remove Test App' }).click();
    await options.getByRole('button', { name: 'Confirm remove (and 2 rules)' }).click();

    await expect(options.getByText('No apps yet.')).toBeVisible();
    await expect(options.getByText('No rules yet.')).toBeVisible();
  });

  test('US-007: an exported rules file leaves out rules that send to an app, and says so', async ({
    openOptions,
    testSink,
  }) => {
    const options = await openOptions();
    await createRule(options, 'localhost', 'sid');
    await addAppApproving(options, testSink.url, ['theme']);

    const downloading = options.waitForEvent('download');
    await options.getByRole('button', { name: 'Export rules' }).click();
    const exported = JSON.parse(readFileSync((await (await downloading).path()) || '', 'utf8')) as {
      rules: { destination: { kind: string } }[];
    };

    expect(exported.rules).toHaveLength(1);
    expect(exported.rules[0]?.destination.kind).toBe('log');
    await expect(options.getByText(/1 rule that sends to an app was left out/)).toBeVisible();
  });

  test('the reference app in examples/ works with Conduit', async ({
    context,
    openOptions,
    site,
  }) => {
    const python = process.platform === 'win32' ? 'python' : 'python3';
    test.skip(
      spawnSync(python, ['--version']).error !== undefined,
      'Python is not available on this computer',
    );
    const app = spawn(
      python,
      ['examples/reference_sink.py', '--port', '0', '--site', 'localhost', '--names', 'sid'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    app.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    try {
      await expect
        .poll(() => output, { timeout: 15_000 })
        .toMatch(/listening on http:\/\/127\.0\.0\.1:\d+/);
      const address = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1] ?? '';
      const options = await openOptions();

      await addAppApproving(options, address, ['sid']);
      await visit(context, `${site.url}?sid=reference-value-12345`);

      await expect
        .poll(() => output, { timeout: 15_000 })
        .toContain('received session from http://localhost: sid');
      expect(output).not.toContain('reference-value-12345');
      await expect(
        deliveryRows(options).nth(1).getByText('Delivered', { exact: true }),
      ).toBeVisible();
    } finally {
      app.kill();
    }
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the apps section has no accessibility violations in any state (${scheme})`, async ({
      context,
      openOptions,
      site,
      testSink,
    }) => {
      const options = await openOptions();
      await options.emulateMedia({ colorScheme: scheme });
      await addAppApproving(options, testSink.url, ['sid']);
      testSink.failNext(1, 500);
      await visit(context, `${site.url}?sid=scan-the-failure-123`);
      await expect(options.getByText('1 delivery has not gone through')).toBeVisible();
      (testSink.handshake.wants as unknown[]).push({
        id: 'indexeddb',
        kind: 'indexeddb',
        origin: 'http://localhost',
        keys: ['X'],
        why: 'Because.',
      });

      await options.getByRole('button', { name: 'Refresh requests from Test App' }).click();
      await expect(options.getByText('This kind of request is not supported.')).toBeVisible();
      expect(await scan(options), 'review').toEqual([]);

      await options.getByRole('button', { name: 'Cancel' }).click();
      await options.getByRole('button', { name: 'Add app' }).click();
      await options.getByRole('button', { name: 'Connect' }).click();
      await expect(options.getByText(/Enter the address of the app/).first()).toBeVisible();
      expect(await scan(options), 'add form with errors').toEqual([]);

      await options.getByLabel('Address of the app').fill('https://192.0.2.10:9443');
      await options.getByRole('button', { name: 'Connect' }).click();
      await expect(options.getByText('This app is not on this computer').first()).toBeVisible();
      expect(await scan(options), 'confirmation').toEqual([]);
    });
  }
});
