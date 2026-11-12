import { expect, test } from './fixtures';
import { addAppApproving, deliveryRows, visit } from './helpers';

// Chrome stops an extension's background worker when it has been idle and starts it again when
// something needs it. A delivery that is waiting to be retried has to survive that: the retry is
// scheduled with an alarm, and the waiting value is kept in extension storage, not in the worker.
// The test stops the worker the way the browser's own tools do ("Stop" on
// chrome://serviceworker-internals) while a delivery is waiting.

interface WorkerVersion {
  versionId: string;
  scriptURL: string;
  runningStatus: string;
}

test('US-009: a delivery waiting to be retried still goes out after the worker is stopped', async ({
  context,
  extensionId,
  openOptions,
  site,
  testSink,
}) => {
  test.setTimeout(120_000);
  const options = await openOptions();
  await addAppApproving(options, testSink.url, ['sid']);

  const cdp = await context.newCDPSession(options);
  const versions = new Map<string, WorkerVersion>();
  cdp.on(
    'ServiceWorker.workerVersionUpdated',
    ({ versions: updated }: { versions: WorkerVersion[] }) => {
      for (const version of updated) versions.set(version.versionId, version);
    },
  );
  await cdp.send('ServiceWorker.enable');

  testSink.failNext(1, 503);
  await visit(context, `${site.url}?sid=survives-a-stop-1234`);
  await expect(options.getByText('The app answered 503.').first()).toBeVisible();
  expect(testSink.received.map((item) => item.status)).toEqual([503]);

  // Stop Conduit's worker, and see that it did stop.
  const ours = (): WorkerVersion[] =>
    [...versions.values()].filter((version) =>
      version.scriptURL.startsWith(`chrome-extension://${extensionId}/`),
    );
  await expect
    .poll(() => ours().length, { message: 'finding the extension worker' })
    .toBeGreaterThan(0);
  for (const version of ours()) {
    await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
  }
  await expect
    .poll(() => ours().every((version) => version.runningStatus === 'stopped'), {
      message: 'waiting for the worker to stop',
    })
    .toBe(true);

  // The alarm wakes it, and the waiting value is sent.
  await expect(deliveryRows(options).nth(1).getByText('Delivered', { exact: true })).toBeVisible({
    timeout: 75_000,
  });
  expect(testSink.received.map((item) => item.status)).toEqual([503, 204]);
  expect(testSink.received[1]?.body).toMatchObject({ data: { sid: 'survives-a-stop-1234' } });
});
