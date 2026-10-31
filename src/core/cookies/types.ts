export type SameSite = 'no_restriction' | 'lax' | 'strict' | 'unspecified';

/** A browser cookie, as Conduit sees it. Mirrors the fields of `chrome.cookies.Cookie` we use. */
export interface Cookie {
  name: string;
  value: string;
  /** With a leading dot for cookies that apply to subdomains (`hostOnly` is false). */
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: SameSite;
  /** True for a cookie that ends with the browser session; it has no `expirationDate`. */
  session: boolean;
  /** Seconds since the Unix epoch. */
  expirationDate?: number;
  storeId: string;
}

export type ExportFormat = 'netscape' | 'json' | 'header';

/** A stable identity for a cookie: the same name can exist on several domains and paths. */
export function cookieKey(cookie: Cookie): string {
  return [cookie.storeId, cookie.domain, cookie.path, cookie.name].join('|');
}

/**
 * Orders cookies by domain, then longer paths first (the order a browser sends them in),
 * then name. Returns a new array.
 */
export function sortCookies(cookies: readonly Cookie[]): Cookie[] {
  return [...cookies].sort(
    (a, b) =>
      a.domain.localeCompare(b.domain) ||
      b.path.length - a.path.length ||
      a.name.localeCompare(b.name),
  );
}
