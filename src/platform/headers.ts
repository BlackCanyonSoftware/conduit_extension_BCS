import type { HeaderObservation } from '../core/headers';

type Listener = (observation: HeaderObservation) => void;

/** Requests Conduit's own extension pages and worker make are not the person's browsing. */
function isOwnRequest(initiator: string | undefined): boolean {
  return initiator?.startsWith(`chrome-extension://${chrome.runtime.id}`) === true;
}

/**
 * Calls `listener` with the headers the browser sends and receives. The browser only reports
 * requests to sites the person has allowed, and Conduit only watches: it never changes a request.
 * The listeners are added when the worker starts, so the browser can wake the worker for them.
 */
export function onHeaders(listener: Listener): void {
  const filter = { urls: ['<all_urls>'] };
  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      if (isOwnRequest(details.initiator)) return;
      listener({
        url: details.url,
        direction: 'request',
        headers: details.requestHeaders ?? [],
      });
    },
    filter,
    ['requestHeaders', 'extraHeaders'],
  );
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (isOwnRequest(details.initiator)) return;
      listener({
        url: details.url,
        direction: 'response',
        headers: details.responseHeaders ?? [],
      });
    },
    filter,
    ['responseHeaders', 'extraHeaders'],
  );
}
