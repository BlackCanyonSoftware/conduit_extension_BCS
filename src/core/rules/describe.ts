import type { Rule } from './types';

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** The rule in one sentence: what is saved, from where, and to where (US-004). */
export function describeRule(rule: Pick<Rule, 'names' | 'site' | 'destination'>): string {
  const noun = rule.names.length === 1 ? 'cookie' : 'cookies';
  return `Save the ${noun} ${joinNames(rule.names)} from ${rule.site} to Conduit's local log.`;
}
