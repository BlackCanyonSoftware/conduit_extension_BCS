import type { Rule } from '../../src/core/rules/types';
import type { DeliveryEntry, PendingDelivery } from '../../src/core/sinks/delivery';
import type { Sink } from '../../src/core/sinks/types';
import { makeRule } from '../fixtures/rules';
import { expect, test, type Extension } from './fixtures';

// US-017: delivery to an app (US-008 to US-011), checked in Firefox: the worker sends from its
// event page, and the retry schedule runs from `alarms`.

const at = '2026-11-08T09:00:00.000Z';

function sinkAt(url: string): Sink {
  return { id: 'sink-1', name: 'Test App', url, loopback: true, addedAt: at };
}

const toApp = (overrides: Partial<Rule> = {}): Rule =>
  makeRule({
    id: 'to-app',
    site: 'localhost',
    destination: { kind: 'sink', sinkId: 'sink-1', wantId: 'sid-want' },
    ...overrides,
  });

async function deliveries(extension: Extension): Promise<DeliveryEntry[]> {
  return ((await extension.get(['deliveries'])).deliveries ?? []) as DeliveryEntry[];
}

async function queue(extension: Extension): Promise<PendingDelivery[]> {
  return ((await extension.get(['queue'])).queue ?? []) as PendingDelivery[];
}

test.describe('delivering to an app in Firefox', () => {
  test('sends a changed cookie as the contract describes, and logs it without the value', async ({
    extension,
    visit,
    testSink,
  }) => {
    await extension.set({ sinks: [sinkAt(testSink.url)], rules: [toApp()] });

    await visit('?sid=firefox-delivered-0001');

    await expect.poll(() => testSink.received.length).toBe(1);
    expect(testSink.received[0]).toMatchObject({
      path: '/conduit/deliver',
      status: 204,
      body: {
        conduit: 1,
        id: 'sid-want',
        origin: 'http://localhost',
        data: { sid: 'firefox-delivered-0001' },
      },
    });
    await expect.poll(async () => (await deliveries(extension)).at(-1)?.result).toBe('delivered');
    expect(JSON.stringify(await deliveries(extension))).not.toContain('firefox-delivered-0001');
    expect(await queue(extension)).toEqual([]);
  });

  test('a failure is kept, and "Retry now" sends it', async ({ extension, visit, testSink }) => {
    await extension.set({ sinks: [sinkAt(testSink.url)], rules: [toApp()] });
    testSink.failNext(1, 500);

    await visit('?sid=firefox-retried-0001');

    await expect.poll(() => testSink.received.length).toBe(1);
    expect(testSink.received[0]?.status).toBe(500);
    await expect.poll(async () => (await queue(extension))[0]?.lastError).toBeDefined();
    expect((await deliveries(extension)).at(-1)?.result).toBe('retrying');

    expect(await extension.worker({ type: 'retry-deliveries' })).toEqual({ ok: true, count: 1 });
    await expect.poll(() => testSink.received.length).toBe(2);
    expect(testSink.received[1]?.status).toBe(204);
    await expect.poll(async () => (await queue(extension)).length).toBe(0);
  });

  test('tries again on its own, from an alarm', async ({ extension, visit, testSink }) => {
    test.setTimeout(150_000);
    await extension.set({ sinks: [sinkAt(testSink.url)], rules: [toApp()] });
    testSink.failNext(1, 500);

    await visit('?sid=firefox-alarm-0001');

    await expect.poll(() => testSink.received.length).toBe(1);
    // The first retry is due after 30 seconds; the browser may round that up to a minute.
    await expect.poll(() => testSink.received.length, { timeout: 120_000 }).toBe(2);
    expect(testSink.received[1]?.status).toBe(204);
  });

  test('pausing capture holds deliveries, and resuming sends them', async ({
    extension,
    visit,
    testSink,
  }) => {
    await extension.set({ sinks: [sinkAt(testSink.url)], rules: [toApp()], killSwitch: true });

    await visit('?sid=firefox-paused-0001');
    await new Promise((wait) => setTimeout(wait, 1500));
    expect(testSink.received).toEqual([]);

    await extension.set({ killSwitch: false });
    await visit('?sid=firefox-resumed-0001');
    await expect.poll(() => testSink.received.length).toBe(1);
  });

  test('sends a header and a storage key, and only the part a rule keeps', async ({
    extension,
    visit,
    testSink,
  }) => {
    await extension.set({
      sinks: [sinkAt(testSink.url)],
      rules: [
        toApp({
          id: 'header',
          kind: 'header',
          direction: 'response',
          names: ['x-conduit-resp'],
          destination: { kind: 'sink', sinkId: 'sink-1', wantId: 'header-want' },
        }),
        toApp({
          id: 'storage',
          kind: 'storage',
          area: 'local',
          names: ['conduit-json'],
          extract: { type: 'jsonpath', path: '$.token' },
          destination: { kind: 'sink', sinkId: 'sink-1', wantId: 'storage-want' },
        }),
      ],
    });

    await visit('?resp=firefox-header-0001&tok=firefox-field-0001');

    await expect.poll(() => testSink.received.length).toBe(2);
    const bodies = testSink.received.map((delivery) => delivery.body);
    expect(bodies).toContainEqual(
      expect.objectContaining({
        id: 'header-want',
        data: { 'x-conduit-resp': 'firefox-header-0001' },
      }),
    );
    expect(bodies).toContainEqual(
      expect.objectContaining({
        id: 'storage-want',
        data: { 'conduit-json': 'firefox-field-0001' },
      }),
    );
  });
});
