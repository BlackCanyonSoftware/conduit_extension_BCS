// TEST-ONLY. Built into the extension only with `--test-bridge` (the Firefox end-to-end tests);
// a release build never contains it.
//
// Playwright's Firefox cannot open an extension's own pages, so the Firefox tests reach the
// extension through a page on the local test site instead: the test posts a message, this
// content script (which runs in that page, as the extension) does the work, and answers.
//
//   { conduitTest: 'request', id, command: 'storage-get', keys? }
//   { conduitTest: 'request', id, command: 'storage-set', items }
//   { conduitTest: 'request', id, command: 'storage-clear' }
//   { conduitTest: 'request', id, command: 'worker', message }   (what a page sends the worker)
//
// The answer is posted back as { conduitTest: 'response', id, result } or { ..., error }.

interface BridgeRequest {
  conduitTest: 'request';
  id: number;
  command: string;
  keys?: string[];
  items?: Record<string, unknown>;
  message?: unknown;
}

function isRequest(data: unknown): data is BridgeRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { conduitTest?: unknown }).conduitTest === 'request' &&
    typeof (data as { id?: unknown }).id === 'number'
  );
}

async function run(request: BridgeRequest): Promise<unknown> {
  switch (request.command) {
    case 'storage-get':
      return chrome.storage.local.get(request.keys ?? null);
    case 'storage-set':
      await chrome.storage.local.set(request.items ?? {});
      return null;
    case 'storage-clear':
      await chrome.storage.local.clear();
      return null;
    case 'worker':
      return chrome.runtime.sendMessage(request.message);
    default:
      throw new Error(`unknown command ${request.command}`);
  }
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || !isRequest(event.data)) return;
  const { id } = event.data;
  run(event.data).then(
    (result) => {
      window.postMessage({ conduitTest: 'response', id, result }, '*');
    },
    (error: unknown) => {
      window.postMessage({ conduitTest: 'response', id, error: String(error) }, '*');
    },
  );
});
