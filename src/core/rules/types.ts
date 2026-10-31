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

/**
 * An approved statement of what to capture, from where, and where to put it.
 * `approvedAt` is set only when the person approves the rule; it is never read from a file.
 */
export interface Rule {
  id: string;
  kind: 'cookie';
  /** The main domain (or exact host) whose cookies the rule watches, subdomains included. */
  site: string;
  /** The cookie names to capture. At least one. */
  names: string[];
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
