/** Messages the pages send the service worker. */
export interface CaptureNowRequest {
  type: 'capture-now';
  ruleId: string;
}

export type CaptureNowResponse = { ok: true; captured: number } | { ok: false; reason: string };

export function isCaptureNowRequest(message: unknown): message is CaptureNowRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'capture-now' &&
    typeof (message as { ruleId?: unknown }).ruleId === 'string'
  );
}
