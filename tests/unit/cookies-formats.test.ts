import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CookieFormatError,
  exportCookies,
  toHeader,
  toJson,
  toNetscape,
} from '../../src/core/cookies/formats';
import { cookieKey, sortCookies } from '../../src/core/cookies/types';
import { SAMPLE_COOKIES } from '../fixtures/cookies';

const golden = (name: string): string => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('US-001: cookie export formats', () => {
  it('writes Netscape cookies.txt, marking HttpOnly cookies and session expiry', () => {
    expect(toNetscape(SAMPLE_COOKIES)).toBe(golden('cookies.netscape.txt'));
  });

  it('writes the EditThisCookie-style JSON array, omitting expiry for session cookies', () => {
    expect(toJson(SAMPLE_COOKIES)).toBe(golden('cookies.json'));
  });

  it('writes a single Cookie header line', () => {
    expect(toHeader(SAMPLE_COOKIES)).toBe(golden('cookies.header.txt'));
  });

  it('writes valid, parseable JSON', () => {
    expect(JSON.parse(toJson(SAMPLE_COOKIES))).toHaveLength(3);
  });

  it('gives a domain cookie a leading dot even if the browser omitted it', () => {
    const [cookie] = SAMPLE_COOKIES;
    if (!cookie) throw new Error('fixture missing');
    const line = toNetscape([{ ...cookie, domain: 'example.com', hostOnly: false }]);

    // The fixture's first cookie is HttpOnly, so the prefix comes before the dotted domain.
    expect(line).toContain('\n#HttpOnly_.example.com\tTRUE\t');
  });

  it('exports an empty selection without any cookie lines', () => {
    const [header] = golden('cookies.netscape.txt').split('\n\n');
    expect(toNetscape([])).toBe(`${header ?? ''}\n\n`);
    expect(toJson([])).toBe('[]\n');
    expect(toHeader([])).toBe('Cookie: \n');
  });

  it('refuses a cookie whose fields would break a tab-separated line', () => {
    const [cookie] = SAMPLE_COOKIES;
    if (!cookie) throw new Error('fixture missing');

    expect(() => toNetscape([{ ...cookie, value: 'a\tb' }])).toThrow(CookieFormatError);
    expect(() => toNetscape([{ ...cookie, name: 'a\nb' }])).toThrow(CookieFormatError);
    expect(() => toHeader([{ ...cookie, value: 'a\r\nInjected: 1' }])).toThrow(CookieFormatError);
  });
});

describe('exportCookies', () => {
  it.each([
    ['netscape', 'cookies-example.com.txt', 'text/plain'],
    ['json', 'cookies-example.com.json', 'application/json'],
    ['header', 'cookie-header-example.com.txt', 'text/plain'],
  ] as const)('names and types the %s file', (format, filename, mime) => {
    const file = exportCookies(SAMPLE_COOKIES, format, 'example.com');

    expect(file.filename).toBe(filename);
    expect(file.mime).toBe(mime);
    expect(file.text.length).toBeGreaterThan(0);
  });

  it('keeps unusual site names safe to use as a file name', () => {
    expect(exportCookies(SAMPLE_COOKIES, 'json', '[::1]').filename).toBe('cookies-___1_.json');
  });
});

describe('US-002: cookie identity and order', () => {
  it('tells cookies with the same name apart by store, domain and path', () => {
    const [a, , c] = SAMPLE_COOKIES;
    if (!a || !c) throw new Error('fixture missing');

    expect(cookieKey(a)).not.toBe(cookieKey(c));
    expect(cookieKey({ ...c, path: '/other' })).not.toBe(cookieKey(c));
    expect(cookieKey({ ...c })).toBe(cookieKey(c));
  });

  it('orders by domain, then longer paths first, then name, without changing the input', () => {
    const [a, b, c] = SAMPLE_COOKIES;
    if (!a || !b || !c) throw new Error('fixture missing');
    const input = [b, c, a];

    expect(sortCookies(input).map((cookie) => cookie.name)).toEqual(['prefs', 'theme', 'sid']);
    expect(input.map((cookie) => cookie.name)).toEqual(['theme', 'prefs', 'sid']);
  });
});
