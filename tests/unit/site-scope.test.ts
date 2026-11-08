import { describe, expect, it } from 'vitest';
import { hostBelongsToSite, patternsForSite, siteScopeFor } from '../../src/core/cookies/site';

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

  it('uses the Public Suffix List, so a shared suffix is not one site', () => {
    expect(siteScopeFor('https://alice.github.io/blog')).toEqual({
      supported: true,
      site: 'alice.github.io',
      patterns: ['*://*.alice.github.io/*'],
    });
    expect(siteScopeFor('https://shop.alice.github.io/')).toMatchObject({
      site: 'alice.github.io',
    });
    expect(siteScopeFor('https://carol.blogspot.com/')).toMatchObject({
      site: 'carol.blogspot.com',
    });
    expect(siteScopeFor('https://www.example.com.br/')).toMatchObject({ site: 'example.com.br' });
    expect(siteScopeFor('https://www.example.ck/')).toMatchObject({ site: 'www.example.ck' });
    expect(siteScopeFor('https://www.city.kobe.jp/')).toMatchObject({ site: 'city.kobe.jp' });
  });

  it('uses the exact host when the host is itself a public suffix', () => {
    expect(siteScopeFor('https://github.io/')).toEqual({
      supported: true,
      site: 'github.io',
      patterns: ['*://github.io/*'],
    });
    expect(siteScopeFor('https://co.uk/')).toMatchObject({
      site: 'co.uk',
      patterns: ['*://co.uk/*'],
    });
  });

  it('copes with names that are not in ASCII', () => {
    expect(siteScopeFor('https://www.münchen.de/')).toMatchObject({ site: 'xn--mnchen-3ya.de' });
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

describe('which hosts belong to a site', () => {
  it('includes subdomains of an ordinary site, but not look-alikes', () => {
    expect(hostBelongsToSite('example.com', 'example.com')).toBe(true);
    expect(hostBelongsToSite('.www.Example.com', 'example.com')).toBe(true);
    expect(hostBelongsToSite('notexample.com', 'example.com')).toBe(false);
    expect(hostBelongsToSite('example.com.evil.test', 'example.com')).toBe(false);
  });

  it('is exact for a site that is itself a public suffix, so its tenants are not swept in', () => {
    expect(hostBelongsToSite('github.io', 'github.io')).toBe(true);
    expect(hostBelongsToSite('alice.github.io', 'github.io')).toBe(false);
    expect(patternsForSite('github.io')).toEqual(['*://github.io/*']);
  });

  it('is exact for localhost and IP addresses', () => {
    expect(hostBelongsToSite('localhost', 'localhost')).toBe(true);
    expect(hostBelongsToSite('a.localhost', 'localhost')).toBe(false);
    expect(hostBelongsToSite('127.0.0.1', '127.0.0.1')).toBe(true);
  });
});
