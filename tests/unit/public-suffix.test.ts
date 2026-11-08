import { describe, expect, it } from 'vitest';
import { createSuffixMatcher } from '../../src/core/cookies/public-suffix';

// A small list with the shapes the Public Suffix List uses: plain rules, a rule under a
// plain one, wildcards, and exceptions to wildcards.
const matcher = createSuffixMatcher(
  [
    'com',
    'biz',
    'uk.com',
    'ac',
    'jp',
    'ac.jp',
    'kyoto.jp',
    'ide.kyoto.jp',
    '*.kobe.jp',
    '!city.kobe.jp',
    '*.mm',
    '*.ck',
    '!www.ck',
    'us',
    'ak.us',
    'k12.ak.us',
  ].join(' '),
);

describe('the registrable domain of a host', () => {
  it.each([
    // a bare suffix has none
    ['com', undefined],
    ['uk.com', undefined],
    ['ac.jp', undefined],
    ['kyoto.jp', undefined],
    ['mm', undefined],
    ['c.mm', undefined],
    ['ck', undefined],
    ['test.ck', undefined],
    ['us', undefined],
    ['k12.ak.us', undefined],
    // one label above the suffix
    ['example.com', 'example.com'],
    ['www.example.com', 'example.com'],
    ['a.b.example.com', 'example.com'],
    ['domain.biz', 'domain.biz'],
    ['b.domain.biz', 'domain.biz'],
    ['example.uk.com', 'example.uk.com'],
    ['a.b.example.uk.com', 'example.uk.com'],
    ['test.ac', 'test.ac'],
    ['test.jp', 'test.jp'],
    ['www.test.jp', 'test.jp'],
    ['test.ac.jp', 'test.ac.jp'],
    ['test.kyoto.jp', 'test.kyoto.jp'],
    ['b.ide.kyoto.jp', 'b.ide.kyoto.jp'],
    ['a.b.ide.kyoto.jp', 'b.ide.kyoto.jp'],
    ['test.k12.ak.us', 'test.k12.ak.us'],
    ['www.test.us', 'test.us'],
    // a wildcard makes any one label a suffix
    ['b.c.mm', 'b.c.mm'],
    ['a.b.c.mm', 'b.c.mm'],
    ['b.test.ck', 'b.test.ck'],
    ['b.c.kobe.jp', 'b.c.kobe.jp'],
    // an exception takes the wildcard back for one name
    ['www.ck', 'www.ck'],
    ['www.www.ck', 'www.ck'],
    ['city.kobe.jp', 'city.kobe.jp'],
    ['www.city.kobe.jp', 'city.kobe.jp'],
  ])('%s -> %s', (host, expected) => {
    expect(matcher.registrableDomain(host)).toBe(expected);
  });

  it('treats a name with an unknown ending as having a one-label suffix', () => {
    expect(matcher.registrableDomain('example.nosuchtld')).toBe('example.nosuchtld');
    expect(matcher.registrableDomain('www.example.nosuchtld')).toBe('example.nosuchtld');
    expect(matcher.registrableDomain('nosuchtld')).toBeUndefined();
  });

  it('ignores case and a trailing dot', () => {
    expect(matcher.registrableDomain('WwW.Example.COM.')).toBe('example.com');
  });

  it('has nothing for an empty or malformed name', () => {
    for (const host of ['', '.', '..', '.com', 'a..com']) {
      expect(matcher.registrableDomain(host)).toBeUndefined();
    }
  });
});

describe('whether a host is itself a public suffix', () => {
  it.each([
    ['com', true],
    ['uk.com', true],
    ['c.mm', true],
    ['test.ck', true],
    ['example.com', false],
    ['www.ck', false],
    ['city.kobe.jp', false],
    ['nosuchtld', true],
    ['example.nosuchtld', false],
  ])('%s -> %s', (host, expected) => {
    expect(matcher.isPublicSuffix(host)).toBe(expected);
  });
});

describe('reading a list', () => {
  it('ignores blank entries and repeats', () => {
    const small = createSuffixMatcher('  com   com  uk.com ');

    expect(small.registrableDomain('a.uk.com')).toBe('a.uk.com');
    expect(small.registrableDomain('a.com')).toBe('a.com');
  });
});
