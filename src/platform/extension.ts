import type { WorkerRequest, WorkerResponse } from '../background/messages';

/** Opens Conduit's rules and log page in a tab. */
export function openOptionsPage(): Promise<void> {
  return chrome.runtime.openOptionsPage();
}

async function askWorker(request: WorkerRequest): Promise<WorkerResponse> {
  const response: unknown = await chrome.runtime.sendMessage(request);
  const reply = response as Partial<WorkerResponse> | undefined;
  if (reply?.ok === true && typeof reply.count === 'number')
    return { ok: true, count: reply.count };
  return {
    ok: false,
    reason:
      reply?.ok === false && typeof reply.reason === 'string'
        ? reply.reason
        : 'No answer from Conduit.',
  };
}

/** Asks the service worker to capture (or send) a rule's cookies right now. */
export function requestCaptureNow(ruleId: string): Promise<WorkerResponse> {
  return askWorker({ type: 'capture-now', ruleId });
}

/** Asks the service worker to try deliveries again now: one, or all. */
export function requestRetry(pendingId?: string): Promise<WorkerResponse> {
  return askWorker(
    pendingId === undefined
      ? { type: 'retry-deliveries' }
      : { type: 'retry-deliveries', pendingId },
  );
}

/** Asks the service worker to drop queued deliveries matching the filter (none: every failed one). */
export function requestDiscard(
  filter: { pendingId?: string; ruleId?: string; sinkId?: string } = {},
): Promise<WorkerResponse> {
  return askWorker({ type: 'discard-deliveries', ...filter });
}
