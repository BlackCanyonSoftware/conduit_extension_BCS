import type { CaptureNowRequest, CaptureNowResponse } from '../background/messages';

/** Opens Conduit's rules and log page in a tab. */
export function openOptionsPage(): Promise<void> {
  return chrome.runtime.openOptionsPage();
}

/** Asks the service worker to capture a rule's cookies right now. */
export async function requestCaptureNow(ruleId: string): Promise<CaptureNowResponse> {
  const request: CaptureNowRequest = { type: 'capture-now', ruleId };
  const response: unknown = await chrome.runtime.sendMessage(request);
  const reply = response as Partial<CaptureNowResponse> | undefined;
  if (reply?.ok === true && typeof reply.captured === 'number') {
    return { ok: true, captured: reply.captured };
  }
  return {
    ok: false,
    reason:
      reply?.ok === false && typeof reply.reason === 'string'
        ? reply.reason
        : 'No answer from Conduit.',
  };
}
