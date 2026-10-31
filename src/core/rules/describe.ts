import { describeExtractor } from '../extract';
import { sinkTarget, type Sink } from '../sinks/types';
import type { Rule } from './types';

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/**
 * The rule in one sentence: what is saved or sent, from where, and to where (US-004).
 * Pass the app a rule sends to; an app on another computer is named as such.
 */
export function describeRule(
  rule: Pick<Rule, 'names' | 'site' | 'destination'> &
    Partial<Pick<Rule, 'kind' | 'direction' | 'area' | 'extract'>>,
  sink?: Pick<Sink, 'name' | 'url' | 'loopback'>,
): string {
  const single = rule.names.length === 1;
  let noun = single ? 'cookie' : 'cookies';
  if (rule.kind === 'header') {
    noun = `${rule.direction ?? 'request'} ${single ? 'header' : 'headers'}`;
  } else if (rule.kind === 'storage') {
    noun = `${rule.area === 'session' ? 'sessionStorage' : 'localStorage'} ${single ? 'key' : 'keys'}`;
  }
  const keeping = rule.extract ? `, keeping only ${describeExtractor(rule.extract)},` : '';
  const subject = `the ${noun} ${joinNames(rule.names)} from ${rule.site}${keeping}`;
  if (rule.destination.kind === 'log') return `Save ${subject} to Conduit's local log.`;
  if (!sink) return `Send ${subject} to an app that is no longer set up.`;
  const away = sink.loopback ? '' : ', which is not on this computer';
  return `Send ${subject} to ${sinkTarget(sink)} (${sink.name})${away}.`;
}
