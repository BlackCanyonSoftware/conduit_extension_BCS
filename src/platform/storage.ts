import { readStoredLog, type CaptureEntry } from '../core/capture';
import { readStoredRules } from '../core/rules/transfer';
import type { Rule } from '../core/rules/types';
import {
  readStoredDeliveries,
  readStoredQueue,
  readStoredSinks,
  type DeliveryEntry,
  type PendingDelivery,
  type SeenDigests,
} from '../core/sinks/delivery';
import type { Sink } from '../core/sinks/types';

/** Everything Conduit keeps in the browser's local extension storage. */
export interface StoredState {
  rules: Rule[];
  /** While true, nothing is captured and nothing is sent. */
  killSwitch: boolean;
  log: CaptureEntry[];
  sinks: Sink[];
  /** Captured values waiting to be sent to an app. */
  queue: PendingDelivery[];
  /** What happened to each delivery. Never holds the values. */
  deliveries: DeliveryEntry[];
}

export type StateKey = keyof StoredState;

/** The state of a fresh install, and what a page shows before storage has answered. */
export function emptyState(): StoredState {
  return { rules: [], killSwitch: false, log: [], sinks: [], queue: [], deliveries: [] };
}

const STATE_KEYS: StateKey[] = ['rules', 'killSwitch', 'log', 'sinks', 'queue', 'deliveries'];

export async function loadState(): Promise<StoredState> {
  const stored = await chrome.storage.local.get(STATE_KEYS);
  return {
    rules: readStoredRules(stored.rules),
    killSwitch: stored.killSwitch === true,
    log: readStoredLog(stored.log),
    sinks: readStoredSinks(stored.sinks),
    queue: readStoredQueue(stored.queue),
    deliveries: readStoredDeliveries(stored.deliveries),
  };
}

/** Just the rules and the pause switch: a light read for work done on every web request. */
export async function loadRulesAndSwitch(): Promise<{ rules: Rule[]; killSwitch: boolean }> {
  const stored = await chrome.storage.local.get(['rules', 'killSwitch']);
  return { rules: readStoredRules(stored.rules), killSwitch: stored.killSwitch === true };
}

export function saveRules(rules: readonly Rule[]): Promise<void> {
  return chrome.storage.local.set({ rules });
}

export function saveKillSwitch(killSwitch: boolean): Promise<void> {
  return chrome.storage.local.set({ killSwitch });
}

export function saveLog(log: readonly CaptureEntry[]): Promise<void> {
  return chrome.storage.local.set({ log });
}

export function saveSinks(sinks: readonly Sink[]): Promise<void> {
  return chrome.storage.local.set({ sinks });
}

export function saveQueue(queue: readonly PendingDelivery[]): Promise<void> {
  return chrome.storage.local.set({ queue });
}

export function saveDeliveries(deliveries: readonly DeliveryEntry[]): Promise<void> {
  return chrome.storage.local.set({ deliveries });
}

/** Digests of values already sent. Only the service worker reads and writes this. */
export async function loadSeen(): Promise<SeenDigests> {
  const { seen } = await chrome.storage.local.get('seen');
  return typeof seen === 'object' && seen !== null ? (seen as SeenDigests) : {};
}

export function saveSeen(seen: SeenDigests): Promise<void> {
  return chrome.storage.local.set({ seen });
}

/** Calls `listener` with the parts of the state that changed, from any page or the worker. */
export function onStateChanged(listener: (changed: StateKey[]) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = STATE_KEYS.filter((key) => key in changes);
    if (keys.length > 0) listener(keys);
  });
}
