import { captureBytes, cookieOrigin, matchRuleCookies } from '../capture';
import type { Cookie } from '../cookies/types';
import { isRecord } from '../records';
import { describeRule } from '../rules/describe';
import type { Rule } from '../rules/types';
import { parseSinkUrl } from './host';
import type { Sink } from './types';

/** A captured value waiting to be sent to an app, with where it has got to. */
export interface PendingDelivery {
  id: string;
  ruleId: string;
  ruleText: string;
  sinkId: string;
  wantId: string;
  origin: string;
  capturedAt: string;
  data: Record<string, string>;
  bytes: number;
  /** How many times sending has been tried. */
  attempts: number;
  /** When to try again. Absent for a first try, and once Conduit has given up. */
  nextAttemptAt?: string;
  lastError?: string;
  /** True once the scheduled tries have run out; the person can still retry by hand. */
  gaveUp: boolean;
}

/** One line of the delivery log. It never holds the values that were sent. */
export interface DeliveryEntry {
  id: string;
  at: string;
  ruleId: string;
  ruleText: string;
  sinkName: string;
  target: string;
  bytes: number;
  result: 'delivered' | 'retrying' | 'failed';
  detail?: string;
}

export interface DeliveryContext {
  now: number;
  newId: () => string;
}

/** Digests of the values already sent, by rule and cookie name, so values are not kept twice. */
export type SeenDigests = Record<string, Record<string, string>>;

/** After each failed try, how long to wait before the next one. Five tries in all. */
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000] as const;

export const DELIVERY_LOG_CAP = 500;
export const QUEUE_CAP = 200;

/** How long to wait after this many failed tries, or undefined when the tries have run out. */
export function retryDelay(attemptsMade: number): number | undefined {
  return RETRY_DELAYS_MS[attemptsMade - 1];
}

/** The body posted to an app, as the integration contract describes it. */
export function deliveryPayload(pending: PendingDelivery): {
  conduit: 1;
  id: string;
  captured_at: string;
  origin: string;
  data: Record<string, string>;
} {
  return {
    conduit: 1,
    id: pending.wantId,
    captured_at: pending.capturedAt,
    origin: pending.origin,
    data: pending.data,
  };
}

/** Records a failed try and schedules the next one, or marks the delivery as given up. */
export function afterFailure(
  pending: PendingDelivery,
  now: number,
  detail: string,
): PendingDelivery {
  const attempts = pending.attempts + 1;
  const delay = retryDelay(attempts);
  const next: PendingDelivery = {
    ...pending,
    attempts,
    lastError: detail,
    gaveUp: delay === undefined,
  };
  if (delay === undefined) delete next.nextAttemptAt;
  else next.nextAttemptAt = new Date(now + delay).toISOString();
  return next;
}

/** The deliveries that should be tried now. Ones that gave up wait for the person. */
export function dueDeliveries(queue: readonly PendingDelivery[], now: number): PendingDelivery[] {
  return queue.filter(
    (item) =>
      !item.gaveUp && (item.nextAttemptAt === undefined || Date.parse(item.nextAttemptAt) <= now),
  );
}

/** When to wake up next: the earliest time a waiting delivery falls due. */
export function nextWake(queue: readonly PendingDelivery[]): number | undefined {
  const times = queue
    .filter((item) => !item.gaveUp && item.nextAttemptAt !== undefined)
    .map((item) => Date.parse(item.nextAttemptAt ?? ''));
  return times.length === 0 ? undefined : Math.min(...times);
}

/** A short fingerprint of a value, hex-encoded. Used to tell "changed" from "same" without keeping the value. */
export async function digestOf(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The deliveries a rule that sends to an app produces for these cookies. A value that is
 * the same as the last one sent is skipped unless `force` is set ("Send now").
 */
export async function planSinkDeliveries(
  rule: Rule,
  sink: Sink,
  cookies: readonly Cookie[],
  seen: SeenDigests,
  context: DeliveryContext,
  options: { force?: boolean } = {},
): Promise<{ pending: PendingDelivery[]; seen: SeenDigests }> {
  if (rule.destination.kind !== 'sink') throw new Error('The rule does not send to an app.');
  const { sinkId, wantId } = rule.destination;
  const known = { ...(seen[rule.id] ?? {}) };
  const pending: PendingDelivery[] = [];
  for (const cookie of matchRuleCookies(rule, cookies)) {
    const digest = await digestOf(`${cookie.name}\u0000${cookie.value}`);
    if (options.force !== true && known[cookie.name] === digest) continue;
    known[cookie.name] = digest;
    const data = { [cookie.name]: cookie.value };
    pending.push({
      id: context.newId(),
      ruleId: rule.id,
      ruleText: describeRule(rule, sink),
      sinkId,
      wantId,
      origin: cookieOrigin(cookie),
      capturedAt: new Date(context.now).toISOString(),
      data,
      bytes: captureBytes(data),
      attempts: 0,
      gaveUp: false,
    });
  }
  return { pending, seen: { ...seen, [rule.id]: known } };
}

/** Adds a line to the delivery log and drops the oldest beyond the cap. */
export function appendDelivery(
  log: readonly DeliveryEntry[],
  entry: DeliveryEntry,
  cap: number = DELIVERY_LOG_CAP,
): DeliveryEntry[] {
  return [...log, entry].slice(-cap);
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

/** Reads the saved apps, skipping any record that is damaged. The address is checked again. */
export function readStoredSinks(raw: unknown): Sink[] {
  if (!Array.isArray(raw)) return [];
  const sinks: Sink[] = [];
  for (const item of raw as unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.url !== 'string' ||
      typeof item.addedAt !== 'string' ||
      (item.confirmedAt !== undefined && typeof item.confirmedAt !== 'string') ||
      (item.route !== undefined && typeof item.route !== 'string')
    ) {
      continue;
    }
    const address = parseSinkUrl(item.url);
    if (!address.ok || address.url !== item.url) continue;
    sinks.push({
      id: item.id,
      name: item.name,
      url: address.url,
      loopback: address.loopback,
      addedAt: item.addedAt,
      ...(item.confirmedAt === undefined ? {} : { confirmedAt: item.confirmedAt }),
      ...(item.route === undefined ? {} : { route: item.route }),
    });
  }
  return sinks;
}

/** Reads the queue of waiting deliveries, skipping any record that is damaged. */
export function readStoredQueue(raw: unknown): PendingDelivery[] {
  if (!Array.isArray(raw)) return [];
  const queue: PendingDelivery[] = [];
  for (const item of raw as unknown[]) {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.ruleId === 'string' &&
      typeof item.ruleText === 'string' &&
      typeof item.sinkId === 'string' &&
      typeof item.wantId === 'string' &&
      typeof item.origin === 'string' &&
      typeof item.capturedAt === 'string' &&
      isStringMap(item.data) &&
      typeof item.bytes === 'number' &&
      typeof item.attempts === 'number' &&
      typeof item.gaveUp === 'boolean' &&
      (item.nextAttemptAt === undefined || typeof item.nextAttemptAt === 'string') &&
      (item.lastError === undefined || typeof item.lastError === 'string')
    ) {
      queue.push({
        id: item.id,
        ruleId: item.ruleId,
        ruleText: item.ruleText,
        sinkId: item.sinkId,
        wantId: item.wantId,
        origin: item.origin,
        capturedAt: item.capturedAt,
        data: item.data,
        bytes: item.bytes,
        attempts: item.attempts,
        gaveUp: item.gaveUp,
        ...(item.nextAttemptAt === undefined ? {} : { nextAttemptAt: item.nextAttemptAt }),
        ...(item.lastError === undefined ? {} : { lastError: item.lastError }),
      });
    }
  }
  return queue;
}

/** Reads the delivery log, skipping any line that is damaged. */
export function readStoredDeliveries(raw: unknown): DeliveryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: DeliveryEntry[] = [];
  for (const item of raw as unknown[]) {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.at === 'string' &&
      typeof item.ruleId === 'string' &&
      typeof item.ruleText === 'string' &&
      typeof item.sinkName === 'string' &&
      typeof item.target === 'string' &&
      typeof item.bytes === 'number' &&
      (item.result === 'delivered' || item.result === 'retrying' || item.result === 'failed') &&
      (item.detail === undefined || typeof item.detail === 'string')
    ) {
      entries.push({
        id: item.id,
        at: item.at,
        ruleId: item.ruleId,
        ruleText: item.ruleText,
        sinkName: item.sinkName,
        target: item.target,
        bytes: item.bytes,
        result: item.result,
        ...(item.detail === undefined ? {} : { detail: item.detail }),
      });
    }
  }
  return entries;
}
