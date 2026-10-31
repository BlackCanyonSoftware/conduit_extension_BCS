import type { Rule } from '../rules/types';
import type { Want } from './types';

/**
 * The parts of a rule that say what it captures, taken from an app's approved request.
 * The same fields feed the one-sentence description shown before approval and the rule itself.
 */
export function ruleFieldsFor(
  want: Pick<Want, 'kind' | 'direction' | 'area' | 'extract'>,
): Pick<Rule, 'kind' | 'direction' | 'area' | 'extract'> {
  const kind = want.kind === 'header' || want.kind === 'storage' ? want.kind : 'cookie';
  return {
    kind,
    ...(kind === 'header' ? { direction: want.direction ?? 'request' } : {}),
    ...(kind === 'storage' ? { area: want.area ?? 'local' } : {}),
    ...(want.extract === undefined ? {} : { extract: want.extract }),
  };
}
