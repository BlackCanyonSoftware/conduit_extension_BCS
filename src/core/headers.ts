import { cookieBelongsToSite, type Observed } from './capture';
import type { HeaderDirection, Rule } from './rules/types';

/** The headers of one web request or response, as the browser reports them. */
export interface HeaderObservation {
  url: string;
  direction: HeaderDirection;
  headers: readonly { name: string; value?: string | undefined }[];
}

/** Where a request went: scheme, host and port, never the path or query. */
export function headerOrigin(url: string): string {
  return new URL(url).origin;
}

/**
 * The headers a rule names, taken from one request or response to the rule's site.
 * Nothing else of the request is read: other headers are never copied out of the observation.
 */
export function matchRuleHeaders(rule: Rule, observation: HeaderObservation): Observed[] {
  if (rule.kind !== 'header' || rule.direction !== observation.direction) return [];
  let url: URL;
  try {
    url = new URL(observation.url);
  } catch {
    return [];
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];
  if (!cookieBelongsToSite(url.hostname, rule.site)) return [];

  const values = new Map<string, string[]>();
  for (const { name, value } of observation.headers) {
    const lower = name.toLowerCase();
    if (value === undefined || !rule.names.includes(lower)) continue;
    values.set(lower, [...(values.get(lower) ?? []), value]);
  }
  return [...values].map(([name, parts]) => ({
    name,
    value: parts.join(', '),
    origin: url.origin,
  }));
}
