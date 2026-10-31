import type { Cookie } from './cookies/types';
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
  destination: 'log';
  data: Record<string, string>;
  bytes: number;
}

/** The log keeps this many of the newest entries. */
export const LOG_CAP = 1000;

/** Whether a cookie's domain is the site or one of its subdomains. */
export function cookieBelongsToSite(cookieDomain: string, site: string): boolean {
  const domain = cookieDomain.replace(/^\./, '').toLowerCase();
  const wanted = site.toLowerCase();
  return domain === wanted || domain.endsWith(`.${wanted}`);
}

/** The cookies a rule names, on the rule's site. */
export function matchRuleCookies(rule: Rule, cookies: readonly Cookie[]): Cookie[] {
  return cookies.filter(
    (cookie) => rule.names.includes(cookie.name) && cookieBelongsToSite(cookie.domain, rule.site),
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
  const created: CaptureEntry[] = [];
  for (const cookie of matchRuleCookies(rule, cookies)) {
    if (repeatsLastValue([...log, ...created], rule.id, cookie.name, cookie.value)) continue;
    const data = { [cookie.name]: cookie.value };
    created.push({
      id: context.newId(),
      at: context.now,
      ruleId: rule.id,
      ruleText: describeRule(rule),
      site: rule.site,
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
        destination: 'log',
        data: item.data,
        bytes: item.bytes,
      });
    }
  }
  return entries;
}
