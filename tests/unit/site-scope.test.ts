import { describe, expect, it } from 'vitest';
import { siteScopeFor } from '../../src/core/cookies/site';

describe('US-001: which site a page belongs to', () => {
  it('uses the main domain, and asks for it and its subdomains', () => {
    expect(siteScopeFor('https://www.example.com/some/page?x=1')).toEqual({
      supported: true,
      site: 'example.com',
      patterns: ['*://*.example.com/*'],
    });
  });

  it('treats a deeper subdomain as part of the same site', () => {
    expect(siteScopeFor('https://a.b.example.com/')).toMatchObject({ site: 'example.com' });
  });

  it('keeps three labels for common country-style suffixes', () => {
    expect(siteScopeFor('https://shop.example.co.uk/')).toMatchObject({
      site: 'example.co.uk',
      patterns: ['*://*.example.co.uk/*'],
    });
    expect(siteScopeFor('https://www.example.com.au/')).toMatchObject({
      site: 'example.com.au',
    });
  });

  it('keeps a plain two-letter country domain at two labels', () => {
    expect(siteScopeFor('https://www.example.de/')).toMatchObject({ site: 'example.de' });
  });

  it('uses the exact host for localhost, IP addresses and single-label hosts', () => {
    expect(siteScopeFor('http://localhost:3000/app')).toEqual({
      supported: true,
      site: 'localhost',
      patterns: ['*://localhost/*'],
    });
    expect(siteScopeFor('http://127.0.0.1:8080/')).toMatchObject({
      site: '127.0.0.1',
      patterns: ['*://127.0.0.1/*'],
    });
    expect(siteScopeFor('http://[::1]:8080/')).toMatchObject({
      site: '[::1]',
      patterns: ['*://[::1]/*'],
    });
    expect(siteScopeFor('http://intranet/')).toMatchObject({ site: 'intranet' });
  });

  it('ignores case and a trailing dot in the host name', () => {
    expect(siteScopeFor('https://WWW.Example.COM./')).toMatchObject({ site: 'example.com' });
  });

  it.each([
    'chrome://extensions',
    'about:blank',
    'file:///C:/notes.txt',
    'chrome-extension://abc/popup.html',
    'not a url',
    '',
  ])('does not support %j', (url) => {
    expect(siteScopeFor(url)).toEqual({ supported: false });
  });

  it('does not support a missing address', () => {
    expect(siteScopeFor(undefined)).toEqual({ supported: false });
  });
});
