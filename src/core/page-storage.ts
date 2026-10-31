import { cookieBelongsToSite, type Observed } from './capture';
import { extractFrom } from './extract';
import type { Rule, StorageArea } from './rules/types';

/** What a page's storage held for the keys that were asked for, and where it was read. */
export interface StorageObservation {
  url: string;
  area: StorageArea;
  items: Readonly<Record<string, string>>;
}

/** The web address as a URL when it is an ordinary page, otherwise undefined. */
function webPage(address: string): URL | undefined {
  try {
    const url = new URL(address);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The storage keys a rule names, taken from what was read on one page of the rule's site.
 * Only the rule's own kind of storage and its own keys are looked at.
 */
export function matchRuleStorage(rule: Rule, observation: StorageObservation): Observed[] {
  if (rule.kind !== 'storage' || rule.area !== observation.area) return [];
  const url = webPage(observation.url);
  if (!url || !cookieBelongsToSite(url.hostname, rule.site)) return [];
  return extractFrom(
    rule,
    rule.names.flatMap((name) => {
      const value = Object.hasOwn(observation.items, name) ? observation.items[name] : undefined;
      return typeof value === 'string' ? [{ name, value, origin: url.origin }] : [];
    }),
  );
}

/**
 * For a page, which kind of storage to read and which keys, from the given rules: the keys
 * of every storage rule for the page's site, once each. Nothing else is asked of the page.
 */
export function storageNeeds(
  rules: readonly Rule[],
  address: string,
): { area: StorageArea; keys: string[] }[] {
  const url = webPage(address);
  if (!url) return [];
  const needs: { area: StorageArea; keys: string[] }[] = [];
  for (const rule of rules) {
    if (rule.kind !== 'storage' || rule.area === undefined) continue;
    if (!cookieBelongsToSite(url.hostname, rule.site)) continue;
    const { area } = rule;
    let need = needs.find((candidate) => candidate.area === area);
    if (!need) {
      need = { area, keys: [] };
      needs.push(need);
    }
    for (const name of rule.names) if (!need.keys.includes(name)) need.keys.push(name);
  }
  return needs;
}
