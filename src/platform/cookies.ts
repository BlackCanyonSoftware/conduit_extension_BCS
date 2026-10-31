import type { Cookie } from '../core/cookies/types';

/** The address of the tab the person opened Conduit from (allowed by `activeTab`). */
export async function getActiveTabUrl(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url;
}

/** Whether the person has already allowed Conduit to read these sites. */
export function hasSiteAccess(patterns: string[]): Promise<boolean> {
  return chrome.permissions.contains({ origins: patterns });
}

/**
 * Asks the browser to show its own permission prompt for these sites.
 * Must be called from a click or key press.
 */
export function requestSiteAccess(patterns: string[]): Promise<boolean> {
  return chrome.permissions.request({ origins: patterns });
}

/** Every cookie the browser holds for a domain and its subdomains, including HttpOnly ones. */
export async function getSiteCookies(domain: string): Promise<Cookie[]> {
  const cookies = await chrome.cookies.getAll({ domain });
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    hostOnly: cookie.hostOnly,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    ...(cookie.expirationDate === undefined ? {} : { expirationDate: cookie.expirationDate }),
    storeId: cookie.storeId,
  }));
}
