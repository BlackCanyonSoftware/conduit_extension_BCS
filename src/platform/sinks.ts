import { deliveryUrl, handshakeUrl } from '../core/sinks/host';
import { deliveryPayload, type PendingDelivery } from '../core/sinks/delivery';

/** A problem talking to an app, worded so the person can act on it. */
export class SinkError extends Error {
  override name = 'SinkError';
}

const MAX_ANSWER_CHARACTERS = 100_000;
const HANDSHAKE_TIMEOUT_MS = 5000;
const PROBE_TIMEOUT_MS = 1500;
const DELIVERY_TIMEOUT_MS = 10_000;

/** The ports Conduit looks at on this computer, starting from the one the first receiver used. */
export const PROBE_PORTS = [8778, 8779, 8780, 8781, 8782, 8783, 8784, 8785, 8786, 8787] as const;

async function send(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new SinkError('The app did not answer in time.');
    }
    throw new SinkError('Could not reach the app. Is it running?');
  }
}

/** Asks an app who it is and what it wants. Returns its answer, unchecked. */
export async function fetchHandshake(
  base: string,
  timeoutMs = HANDSHAKE_TIMEOUT_MS,
): Promise<unknown> {
  const response = await send(
    handshakeUrl(base),
    { method: 'GET', headers: { Accept: 'application/json' } },
    timeoutMs,
  );
  if (response.status !== 200) throw new SinkError(`The app answered ${String(response.status)}.`);
  const text = await response.text();
  if (text.length > MAX_ANSWER_CHARACTERS) throw new SinkError("The app's answer is too large.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SinkError('The app answered, but not with JSON.');
  }
}

/** Looks for apps on this computer's usual ports. Returns the ones that answered. */
export async function probeLoopback(): Promise<{ url: string; answer: unknown }[]> {
  const results = await Promise.allSettled(
    PROBE_PORTS.map(async (port) => {
      const url = `http://127.0.0.1:${String(port)}`;
      return { url, answer: await fetchHandshake(url, PROBE_TIMEOUT_MS) };
    }),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/** Posts one captured value. Anything other than 204 No Content is a failure, and says why. */
export async function postDelivery(
  base: string,
  route: string | undefined,
  pending: PendingDelivery,
): Promise<void> {
  const response = await send(
    deliveryUrl(base, route),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deliveryPayload(pending)),
    },
    DELIVERY_TIMEOUT_MS,
  );
  if (response.status !== 204) throw new SinkError(`The app answered ${String(response.status)}.`);
}
