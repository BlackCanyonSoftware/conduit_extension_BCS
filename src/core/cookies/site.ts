import { publicSuffixes } from './public-suffix';

export type SiteScope =
  | { supported: false }
  | {
      supported: true;
      /** The registrable domain (or exact host for localhost, IP addresses and public suffixes). */
      site: string;
      /** Match patterns to ask the browser for, covering the site and its subdomains. */
      patterns: string[];
    };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** True for hosts that are used exactly as written: IP addresses and single-label names. */
function isExactHost(host: string): boolean {
  return host.startsWith('[') || IPV4.test(host) || !host.includes('.');
}

/**
 * True when a site is taken as the one host only, with no subdomains: an exact host, or a name
 * that is itself a public suffix (`github.io`), whose subdomains belong to other people.
 */
function isWholeHost(site: string): boolean {
  return isExactHost(site) || publicSuffixes().isPublicSuffix(site);
}

/** The match patterns to ask the browser for so a site and its subdomains can be read. */
export function patternsForSite(site: string): string[] {
  return isWholeHost(site) ? [`*://${site}/*`] : [`*://*.${site}/*`];
}

/**
 * Whether a host (or a cookie's domain, with or without its leading dot) is the site or one of
 * its subdomains. A site that is itself a public suffix covers only that host.
 */
export function hostBelongsToSite(host: string, site: string): boolean {
  const domain = host.replace(/^\./, '').replace(/\.$/, '').toLowerCase();
  const wanted = site.toLowerCase();
  return domain === wanted || (!isWholeHost(wanted) && domain.endsWith(`.${wanted}`));
}

/**
 * Works out which site a page address belongs to, for reading its cookies: the registrable
 * domain from the Public Suffix List (so `alice.github.io` is its own site, not a part of
 * `github.io`), or the exact host where there is no such thing.
 */
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
  const site = isExactHost(host) ? host : (publicSuffixes().registrableDomain(host) ?? host);
  return { supported: true, site, patterns: patternsForSite(site) };
}
