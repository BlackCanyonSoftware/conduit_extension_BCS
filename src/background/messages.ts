/** Messages the pages send the service worker. */
export type WorkerRequest =
  /** Save (log rules) or send (app rules) the rule's cookies as they are right now. */
  | { type: 'capture-now'; ruleId: string }
  /** Try waiting or given-up deliveries again now: one by id, or all of them. */
  | { type: 'retry-deliveries'; pendingId?: string }
  /** Drop queued deliveries: by id, by rule, by app, or (with no filter) every one that has failed. */
  | { type: 'discard-deliveries'; pendingId?: string; ruleId?: string; sinkId?: string };

export type WorkerResponse = { ok: true; count: number } | { ok: false; reason: string };

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function isWorkerRequest(message: unknown): message is WorkerRequest {
  if (typeof message !== 'object' || message === null) return false;
  const request = message as Record<string, unknown>;
  switch (request.type) {
    case 'capture-now':
      return typeof request.ruleId === 'string';
    case 'retry-deliveries':
      return optionalString(request.pendingId);
    case 'discard-deliveries':
      return (
        optionalString(request.pendingId) &&
        optionalString(request.ruleId) &&
        optionalString(request.sinkId)
      );
    default:
      return false;
  }
}
