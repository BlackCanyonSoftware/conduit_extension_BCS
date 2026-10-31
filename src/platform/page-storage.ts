import type { StorageObservation } from '../core/page-storage';
import type { StorageArea } from '../core/rules/types';

/**
 * Runs inside the page (its top frame only) and reads just the keys it is given. It lives in
 * this file because the browser serialises it, so it cannot use anything from outside.
 * It answers with pairs rather than an object, so a key like `__proto__` stays an ordinary key.
 */
function readKeys(area: StorageArea, keys: string[]): { url: string; items: [string, string][] } {
  const items: [string, string][] = [];
  try {
    const store = area === 'local' ? window.localStorage : window.sessionStorage;
    for (const key of keys) {
      const value = store.getItem(key);
      if (value !== null) items.push([key, value]);
    }
  } catch {
    // Some pages (sandboxed frames, blocked storage) refuse; they simply have nothing to read.
  }
  return { url: window.location.href, items };
}

/** Reads the named keys of one kind of storage on a tab, or undefined if the page cannot be read. */
export async function readPageStorage(
  tabId: number,
  area: StorageArea,
  keys: string[],
): Promise<StorageObservation | undefined> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readKeys,
      args: [area, keys],
    });
    const result = injection?.result;
    if (!result) return undefined;
    return { url: result.url, area, items: Object.fromEntries(result.items) };
  } catch {
    // The tab closed, moved on, or is a page the person has not allowed Conduit to read.
    return undefined;
  }
}

/** The open tabs on the given sites (match patterns). Needs the person's access to those sites. */
export async function tabsOnSites(patterns: string[]): Promise<{ id: number; url: string }[]> {
  const tabs = await chrome.tabs.query({ url: patterns });
  return tabs.flatMap((tab) =>
    tab.id === undefined || tab.url === undefined ? [] : [{ id: tab.id, url: tab.url }],
  );
}

/** Calls `listener` when a tab finishes loading a page. The address is only given for allowed sites. */
export function onPageLoaded(listener: (tabId: number, url: string) => void): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url !== undefined) listener(tabId, tab.url);
  });
}
