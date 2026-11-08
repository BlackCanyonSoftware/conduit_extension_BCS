import { PUBLIC_SUFFIX_RULES } from './public-suffix-data';

export interface SuffixMatcher {
  /** The suffix plus one more label (`www.example.co.uk` -> `example.co.uk`), or undefined. */
  registrableDomain(host: string): string | undefined;
  /** True when the host is itself a public suffix (`com`, `co.uk`, `github.io`). */
  isPublicSuffix(host: string): boolean;
}

/**
 * Reads a list of Public Suffix List rules (lower-case ASCII, separated by white space: plain
 * names, `*.name` wildcards and `!name` exceptions) into something that can answer questions
 * about a host. Rules are applied as the list's own algorithm says: an exception beats
 * everything, otherwise the longest matching rule wins, and a name no rule matches is treated as
 * having a one-label suffix.
 */
export function createSuffixMatcher(rulesText: string): SuffixMatcher {
  const normal = new Set<string>();
  const wildcardBases = new Set<string>();
  const exceptions = new Set<string>();
  for (const rule of rulesText.split(/\s+/)) {
    if (rule === '') continue;
    if (rule.startsWith('!')) exceptions.add(rule.slice(1));
    else if (rule.startsWith('*.')) wildcardBases.add(rule.slice(2));
    else normal.add(rule);
  }

  /** The labels of a host, or undefined if it is empty or has an empty label. */
  function labelsOf(host: string): string[] | undefined {
    const labels = host.toLowerCase().replace(/\.$/, '').split('.');
    return labels.some((label) => label === '') ? undefined : labels;
  }

  /** The index of the first label of the host's public suffix. */
  function suffixStart(labels: readonly string[]): number {
    // An exception rule means the name just right of its first label is the suffix.
    for (let index = 0; index < labels.length; index += 1) {
      if (exceptions.has(labels.slice(index).join('.'))) return index + 1;
    }
    // Otherwise the longest rule, which is the one that starts furthest left.
    for (let index = 0; index < labels.length; index += 1) {
      const candidate = labels.slice(index).join('.');
      if (normal.has(candidate)) return index;
      if (index + 1 < labels.length && wildcardBases.has(labels.slice(index + 1).join('.'))) {
        return index;
      }
    }
    return labels.length - 1;
  }

  return {
    registrableDomain(host) {
      const labels = labelsOf(host);
      if (!labels) return undefined;
      const start = suffixStart(labels);
      return start === 0 ? undefined : labels.slice(start - 1).join('.');
    },
    isPublicSuffix(host) {
      const labels = labelsOf(host);
      return labels !== undefined && suffixStart(labels) === 0;
    },
  };
}

let shared: SuffixMatcher | undefined;

/** The matcher for the list that ships with Conduit, built the first time it is needed. */
export function publicSuffixes(): SuffixMatcher {
  shared ??= createSuffixMatcher(PUBLIC_SUFFIX_RULES);
  return shared;
}
