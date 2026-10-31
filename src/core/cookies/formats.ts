import type { Cookie, ExportFormat } from './types';

/** Thrown when a cookie cannot be written faithfully in the chosen format. */
export class CookieFormatError extends Error {
  override name = 'CookieFormatError';
}

export interface ExportFile {
  text: string;
  filename: string;
  mime: string;
}

const NETSCAPE_HEADER = [
  '# Netscape HTTP Cookie File',
  '# https://curl.se/docs/http-cookies.html',
  '# Exported by Conduit. Treat this file like a password.',
  '',
  '',
].join('\n');

const LINE_BREAKING = /[\t\r\n]/;

/** Rejects fields that would corrupt a tab-separated line or add a second header line. */
function assertWritable(cookie: Cookie): void {
  for (const [field, text] of [
    ['name', cookie.name],
    ['value', cookie.value],
    ['domain', cookie.domain],
    ['path', cookie.path],
  ] as const) {
    if (LINE_BREAKING.test(text)) {
      throw new CookieFormatError(
        `The ${field} of cookie "${cookie.name.replace(LINE_BREAKING, ' ')}" contains a tab or line break, so it cannot be exported.`,
      );
    }
  }
}

/** Netscape `cookies.txt`, as read by curl, wget and yt-dlp. HttpOnly cookies get the `#HttpOnly_` prefix. */
export function toNetscape(cookies: readonly Cookie[]): string {
  const lines = cookies.map((cookie) => {
    assertWritable(cookie);
    const domain =
      cookie.hostOnly || cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`;
    return [
      `${cookie.httpOnly ? '#HttpOnly_' : ''}${domain}`,
      cookie.hostOnly ? 'FALSE' : 'TRUE',
      cookie.path,
      cookie.secure ? 'TRUE' : 'FALSE',
      cookie.session ? 0 : Math.floor(cookie.expirationDate ?? 0),
      cookie.name,
      cookie.value,
    ].join('\t');
  });
  return NETSCAPE_HEADER + lines.map((line) => `${line}\n`).join('');
}

/** A JSON array in the shape the EditThisCookie extension uses; expiry is omitted for session cookies. */
export function toJson(cookies: readonly Cookie[]): string {
  const entries = cookies.map((cookie, index) => {
    assertWritable(cookie);
    return {
      domain: cookie.domain,
      ...(cookie.session || cookie.expirationDate === undefined
        ? {}
        : { expirationDate: cookie.expirationDate }),
      hostOnly: cookie.hostOnly,
      httpOnly: cookie.httpOnly,
      name: cookie.name,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      session: cookie.session,
      storeId: cookie.storeId,
      value: cookie.value,
      id: index + 1,
    };
  });
  return `${JSON.stringify(entries, null, 2)}\n`;
}

/** A single `Cookie: a=1; b=2` line, ready to paste into a request. */
export function toHeader(cookies: readonly Cookie[]): string {
  const pairs = cookies.map((cookie) => {
    assertWritable(cookie);
    return `${cookie.name}=${cookie.value}`;
  });
  return `Cookie: ${pairs.join('; ')}\n`;
}

/** Builds the text, file name and media type for one export. `site` names the file. */
export function exportCookies(
  cookies: readonly Cookie[],
  format: ExportFormat,
  site: string,
): ExportFile {
  const safeSite = site.replace(/[^a-z0-9.-]/gi, '_');
  switch (format) {
    case 'netscape':
      return { text: toNetscape(cookies), filename: `cookies-${safeSite}.txt`, mime: 'text/plain' };
    case 'json':
      return {
        text: toJson(cookies),
        filename: `cookies-${safeSite}.json`,
        mime: 'application/json',
      };
    case 'header':
      return {
        text: toHeader(cookies),
        filename: `cookie-header-${safeSite}.txt`,
        mime: 'text/plain',
      };
  }
}
