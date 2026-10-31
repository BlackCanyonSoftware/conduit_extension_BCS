import { readStoredLog, type CaptureEntry } from '../core/capture';
import { readStoredRules } from '../core/rules/transfer';
import type { Rule } from '../core/rules/types';

/** Everything Conduit keeps in the browser's local extension storage. */
export interface StoredState {
  rules: Rule[];
  /** While true, no rule captures anything. */
  killSwitch: boolean;
  log: CaptureEntry[];
}

export type StateKey = keyof StoredState;

export async function loadState(): Promise<StoredState> {
  const stored = await chrome.storage.local.get(['rules', 'killSwitch', 'log']);
  return {
    rules: readStoredRules(stored.rules),
    killSwitch: stored.killSwitch === true,
    log: readStoredLog(stored.log),
  };
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

/** Calls `listener` with the parts of the state that changed, from any page or the worker. */
export function onStateChanged(listener: (changed: StateKey[]) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = (['rules', 'killSwitch', 'log'] as const).filter((key) => key in changes);
    if (keys.length > 0) listener(keys);
  });
}
