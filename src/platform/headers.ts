import type { HeaderObservation } from '../core/headers';

type Listener = (observation: HeaderObservation) => void;

/**
 * Requests Conduit's own extension pages and worker make are not the person's browsing. Chrome
 * names where a request came from in `initiator`, Firefox in `originUrl`.
 */
function isOwnRequest(details: { initiator?: string; originUrl?: string }): boolean {
  const own = chrome.runtime.getURL('').replace(/\/$/, '');
  return [details.initiator, details.originUrl].some((from) => from?.startsWith(own) === true);
}

const FILTER = { urls: ['<all_urls>'] };

/**
 * Calls `listener` with the headers the browser sends and receives. The browser only reports
 * requests to sites the person has allowed, and Conduit only watches: it never changes a request.
 * The listeners are added when the worker starts, so the browser can wake the worker for them.
 *
 * Chrome hides some headers (Cookie and others) unless `extraHeaders` is asked for. Firefox does
 * not know that word and refuses it, and shows those headers anyway, so each listener is added
 * with it first and again without it if the browser refuses.
 */
export function onHeaders(listener: Listener): void {
  const sent = (details: chrome.webRequest.OnSendHeadersDetails): void => {
    if (isOwnRequest(details)) return;
    listener({ url: details.url, direction: 'request', headers: details.requestHeaders ?? [] });
  };
  try {
    chrome.webRequest.onSendHeaders.addListener(sent, FILTER, ['requestHeaders', 'extraHeaders']);
  } catch {
    chrome.webRequest.onSendHeaders.addListener(sent, FILTER, ['requestHeaders']);
  }

  // This event's callback may answer with a change to the response; Conduit never does.
  const received = (
    details: chrome.webRequest.OnHeadersReceivedDetails,
  ): chrome.webRequest.BlockingResponse | undefined => {
    if (!isOwnRequest(details)) {
      listener({ url: details.url, direction: 'response', headers: details.responseHeaders ?? [] });
    }
    return undefined;
  };
  try {
    chrome.webRequest.onHeadersReceived.addListener(received, FILTER, [
      'responseHeaders',
      'extraHeaders',
    ]);
  } catch {
    chrome.webRequest.onHeadersReceived.addListener(received, FILTER, ['responseHeaders']);
  }
}
