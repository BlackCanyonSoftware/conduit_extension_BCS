import type { Extractor } from '../extract';

/** Captures are saved to Conduit's own log. */
export interface LogDestination {
  kind: 'log';
}

/** Captures are sent to an app the person added, as the request `wantId` it made. */
export interface SinkDestination {
  kind: 'sink';
  sinkId: string;
  wantId: string;
}

export type Destination = LogDestination | SinkDestination;

export type RuleKind = 'cookie' | 'header' | 'storage';

/** Whether a header rule looks at what the browser sends or at what it gets back. */
export type HeaderDirection = 'request' | 'response';

/** Which of a page's two key-value stores a storage rule reads. */
export type StorageArea = 'local' | 'session';

/**
 * An approved statement of what to capture, from where, and where to put it.
 * `approvedAt` is set only when the person approves the rule; it is never read from a file.
 */
export interface Rule {
  id: string;
  kind: RuleKind;
  /** The main domain (or exact host) whose cookies or headers the rule watches, subdomains included. */
  site: string;
  /** The cookie names, header names or storage keys to capture. At least one. Header names are lower case. */
  names: string[];
  /** For a header rule: request or response headers. */
  direction?: HeaderDirection;
  /** For a storage rule: localStorage or sessionStorage. */
  area?: StorageArea;
  /** Keep only part of each captured value, before it is saved or sent. */
  extract?: Extractor;
  destination: Destination;
  enabled: boolean;
  createdAt: string;
  approvedAt?: string;
}

export type RuleStatus = 'active' | 'disabled' | 'needs-approval' | 'paused';

/** What a rule is doing right now. Only an approved, enabled rule captures, and never while paused. */
export function ruleStatus(rule: Rule, killSwitch: boolean): RuleStatus {
  if (!rule.approvedAt) return 'needs-approval';
  if (!rule.enabled) return 'disabled';
  return killSwitch ? 'paused' : 'active';
}
