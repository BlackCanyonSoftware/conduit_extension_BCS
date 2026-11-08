import { hostBelongsToSite } from './cookies/site';
import type { Cookie } from './cookies/types';
import { extractFrom } from './extract';
import { isRecord } from './records';
import { describeRule } from './rules/describe';
import type { Rule } from './rules/types';

/** One recorded capture: a value a rule saved, with the rule as it read at the time. */
export interface CaptureEntry {
  id: string;
  at: string;
  ruleId: string;
  ruleText: string;
  site: string;
  /** Where the cookie was set, for example `https://www.example.com`. */
  origin: string;
  destination: 'log';
  data: Record<string, string>;
  bytes: number;
}

/** The log keeps this many of the newest entries. */
export const LOG_CAP = 1000;

/** The origin a cookie belongs to: https if it is Secure, and its domain without a leading dot. */
export function cookieOrigin(cookie: Pick<Cookie, 'secure' | 'domain'>): string {
  return `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}`;
}

/** Whether a cookie's domain is the site or one of its subdomains. */
export function cookieBelongsToSite(cookieDomain: string, site: string): boolean {
  return hostBelongsToSite(cookieDomain, site);
}

/** The cookies a rule names, on the rule's site. A header rule names no cookies. */
export function matchRuleCookies(rule: Rule, cookies: readonly Cookie[]): Cookie[] {
  if (rule.kind !== 'cookie') return [];
  return cookies.filter(
    (cookie) => rule.names.includes(cookie.name) && cookieBelongsToSite(cookie.domain, rule.site),
  );
}

/** One value a rule picked out of the browser's data: a cookie or a header, and where it came from. */
export interface Observed {
  name: string;
  value: string;
  origin: string;
}

/** The cookies a rule names, in the shape shared with header captures. */
export function observedCookies(rule: Rule, cookies: readonly Cookie[]): Observed[] {
  return extractFrom(
    rule,
    matchRuleCookies(rule, cookies).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      origin: cookieOrigin(cookie),
    })),
  );
}

/** The size of a capture: the UTF-8 length of its data as JSON. */
export function captureBytes(data: Record<string, string>): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

/** True when the last value captured for this rule and cookie name is the same as this one. */
function repeatsLastValue(
  log: readonly CaptureEntry[],
  ruleId: string,
  name: string,
  value: string,
): boolean {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index];
    if (entry?.ruleId === ruleId && name in entry.data) return entry.data[name] === value;
  }
  return false;
}

/**
 * The new log entries a rule produces for these cookies, leaving out any whose value is
 * unchanged since the rule last captured that cookie.
 */
export function capturesFor(
  rule: Rule,
  cookies: readonly Cookie[],
  log: readonly CaptureEntry[],
  context: { now: string; newId: () => string },
): CaptureEntry[] {
  return capturesForObserved(rule, observedCookies(rule, cookies), log, context);
}

/** The same for values already picked out by a rule, whether cookies or headers. */
export function capturesForObserved(
  rule: Rule,
  observed: readonly Observed[],
  log: readonly CaptureEntry[],
  context: { now: string; newId: () => string },
): CaptureEntry[] {
  const created: CaptureEntry[] = [];
  for (const item of observed) {
    if (repeatsLastValue([...log, ...created], rule.id, item.name, item.value)) continue;
    const data = { [item.name]: item.value };
    created.push({
      id: context.newId(),
      at: context.now,
      ruleId: rule.id,
      ruleText: describeRule(rule),
      site: rule.site,
      origin: item.origin,
      destination: 'log',
      data,
      bytes: captureBytes(data),
    });
  }
  return created;
}

/** Adds entries to the log and drops the oldest beyond the cap. Returns a new array. */
export function appendCapture(
  log: readonly CaptureEntry[],
  entries: readonly CaptureEntry[],
  cap: number = LOG_CAP,
): CaptureEntry[] {
  return [...log, ...entries].slice(-cap);
}

/** The whole log as a file, values included: treat it like a password. */
export function logToJson(entries: readonly CaptureEntry[]): string {
  return `${JSON.stringify({ conduit: 1, kind: 'capture-log', entries }, null, 2)}\n`;
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

/** Reads the log saved in browser storage, skipping any entry that is damaged. */
export function readStoredLog(raw: unknown): CaptureEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: CaptureEntry[] = [];
  for (const item of raw as unknown[]) {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.at === 'string' &&
      typeof item.ruleId === 'string' &&
      typeof item.ruleText === 'string' &&
      typeof item.site === 'string' &&
      item.destination === 'log' &&
      isStringMap(item.data) &&
      typeof item.bytes === 'number'
    ) {
      entries.push({
        id: item.id,
        at: item.at,
        ruleId: item.ruleId,
        ruleText: item.ruleText,
        site: item.site,
        origin: typeof item.origin === 'string' ? item.origin : `https://${item.site}`,
        destination: 'log',
        data: item.data,
        bytes: item.bytes,
      });
    }
  }
  return entries;
}
