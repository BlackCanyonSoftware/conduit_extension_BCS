export type SiteScope =
  | { supported: false }
  | {
      supported: true;
      /** The main domain (or exact host for localhost and IP addresses). */
      site: string;
      /** Match patterns to ask the browser for, covering the site and its subdomains. */
      patterns: string[];
    };

/**
 * Second-level labels that, under a two-letter country code, belong to the suffix
 * (`example.co.uk` is the site, not `co.uk`). A short list of the common ones; see
 * docs/ROADMAP.md (tech debt) for replacing it with the Public Suffix List.
 */
const SECOND_LEVEL_LABELS = new Set([
  'co',
  'com',
  'org',
  'net',
  'gov',
  'edu',
  'ac',
  'or',
  'ne',
  'go',
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Works out which site a page address belongs to, for reading its cookies. */
export function siteScopeFor(address: string | undefined): SiteScope {
  if (!address) return { supported: false };
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { supported: false };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { supported: false };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (host.startsWith('[') || IPV4.test(host) || labels.length < 2) {
    return { supported: true, site: host, patterns: [`*://${host}/*`] };
  }

  const last = labels.at(-1) ?? '';
  const secondLast = labels.at(-2) ?? '';
  const keep =
    last.length === 2 && SECOND_LEVEL_LABELS.has(secondLast) && labels.length >= 3 ? 3 : 2;
  const site = labels.slice(-keep).join('.');
  return { supported: true, site, patterns: [`*://*.${site}/*`] };
}
