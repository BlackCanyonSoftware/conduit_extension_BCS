export type ParsedSinkUrl =
  | { ok: true; url: string; host: string; label: string; loopback: boolean }
  | { ok: false; error: string };

export type ParsedRoute = { ok: true; route: string | undefined } | { ok: false; error: string };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const MAX_ROUTE_LENGTH = 200;

/**
 * True for names that always mean this computer: `localhost`, 127.x.x.x and `::1`.
 * Look-alike names such as `localhost.example.test` are not.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host === '[::1]' || host === '::1') return true;
  const parts = host.split('.');
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

/** Reads the address of an app, as typed. Apps on other computers must use https (US-010). */
export function parseSinkUrl(text: string): ParsedSinkUrl {
  const typed = text.trim();
  if (typed === '') {
    return { ok: false, error: 'Enter the address of the app, for example http://127.0.0.1:8778.' };
  }
  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(typed) ? typed : `http://${typed}`);
  } catch {
    return { ok: false, error: 'That does not look like an address.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Use an http or https address.' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, error: 'Leave out the user name and password.' };
  }
  if (url.search !== '' || url.hash !== '') {
    return { ok: false, error: 'Leave out anything after a ? or #.' };
  }
  const loopback = isLoopbackHost(url.hostname);
  if (!loopback && url.protocol !== 'https:') {
    return { ok: false, error: 'Apps on other computers must use https.' };
  }
  return {
    ok: true,
    url: `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
    host: url.hostname,
    label: url.host,
    loopback,
  };
}

/** Whether what the person typed is the host name they were asked to type. */
export function matchesConfirmation(typed: string, host: string): boolean {
  const wanted = host.toLowerCase().replace(/\.$/, '');
  return wanted !== '' && typed.trim().toLowerCase() === wanted;
}

/** Reads an app's own delivery path. Empty means "use the standard one". */
export function parseRoute(text: string): ParsedRoute {
  const route = text.trim();
  if (route === '') return { ok: true, route: undefined };
  if (!route.startsWith('/')) {
    return { ok: false, error: 'Start the path with /, for example /api/integrity.' };
  }
  if (route.startsWith('//') || route.includes('\\') || route.split('/').includes('..')) {
    return { ok: false, error: 'The path must stay on the same app.' };
  }
  if (route.includes('?') || route.includes('#')) {
    return { ok: false, error: 'Use a path only, without ? or #.' };
  }
  if (/\s/.test(route)) return { ok: false, error: 'The path may not contain spaces.' };
  if (route.length > MAX_ROUTE_LENGTH) {
    return {
      ok: false,
      error: `The path is too long (over ${String(MAX_ROUTE_LENGTH)} characters).`,
    };
  }
  return { ok: true, route };
}

/** Where an app says who it is and what it asks for. */
export function handshakeUrl(base: string): string {
  return `${base}/.well-known/conduit`;
}

/** Where captured values are posted: the app's own path if it has one. */
export function deliveryUrl(base: string, route?: string): string {
  return `${base}${route ?? '/conduit/deliver'}`;
}

/** The browser permission patterns that cover an app's address, and nothing else. */
export function permissionPatterns(url: string): string[] {
  const parsed = new URL(url);
  return [`${parsed.protocol}//${parsed.hostname}/*`];
}
