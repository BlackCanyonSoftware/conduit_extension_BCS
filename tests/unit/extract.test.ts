import { describe, expect, it } from 'vitest';
import {
  checkExtractor,
  describeExtractor,
  extractFrom,
  extractValue,
  parseExtractorInput,
  readExtractor,
  type Extractor,
} from '../../src/core/extract';
import { makeRule } from '../fixtures/rules';

const regex = (pattern: string): Extractor => ({ type: 'regex', pattern });
const path = (value: string): Extractor => ({ type: 'jsonpath', path: value });

describe('US-014: pulling a field out with a pattern', () => {
  it('keeps the whole match when the pattern has no group', () => {
    expect(extractValue(regex('[0-9]+'), 'user-12345-x')).toBe('12345');
  });

  it('keeps only the first group when there is one', () => {
    expect(extractValue(regex('token=([a-z0-9]+);'), 'a=1; token=abc123; b=2')).toBe('abc123');
  });

  it('gives nothing when the pattern does not match, or matches nothing', () => {
    expect(extractValue(regex('token=([a-z]+)'), 'no such thing')).toBeUndefined();
    expect(extractValue(regex('x*'), 'abc')).toBeUndefined();
  });

  it('does not look inside very long values', () => {
    expect(extractValue(regex('a'), 'a'.repeat(20_001))).toBeUndefined();
    expect(extractValue(regex('a'), 'a'.repeat(20_000))).toBe('a');
  });
});

describe('US-014: pulling a field out of JSON', () => {
  const blob = JSON.stringify({
    user: { id: 42, name: 'Ada', admin: false, tags: ['a', 'b'], extra: null },
    'odd key': 'spaced',
    list: [{ token: 'first' }, { token: 'second' }],
  });

  it.each([
    ['$.user.name', 'Ada'],
    ['$.user.id', '42'],
    ['$.user.admin', 'false'],
    ['$.user.tags[1]', 'b'],
    ['$.list[1].token', 'second'],
    ["$['odd key']", 'spaced'],
    ['$["user"]["name"]', 'Ada'],
    ['$.user.tags', '["a","b"]'],
  ])('%s', (jsonPath, expected) => {
    expect(extractValue(path(jsonPath), blob)).toBe(expected);
  });

  it.each(['$.user.missing', '$.user.extra', '$.list[5]', '$.user.name.deeper', '$.user[0]'])(
    'finds nothing at %s',
    (jsonPath) => {
      expect(extractValue(path(jsonPath), blob)).toBeUndefined();
    },
  );

  it('finds nothing when the value is not JSON', () => {
    expect(extractValue(path('$.a'), 'not json')).toBeUndefined();
  });

  it('never reaches into the built-in properties of an object', () => {
    for (const jsonPath of ['$.constructor', '$.__proto__', '$.toString', '$.user.constructor']) {
      expect(extractValue(path(jsonPath), blob)).toBeUndefined();
    }
  });
});

describe('US-014: checking an extractor before it is saved', () => {
  it('accepts ordinary patterns and paths', () => {
    expect(checkExtractor(regex('id=(\\d+)'))).toBeUndefined();
    expect(checkExtractor(path('$.a.b[0]'))).toBeUndefined();
  });

  it.each([
    ['', /Enter a pattern/],
    ['(', /not a valid pattern/],
    ['x'.repeat(201), /at most 200/],
    ['(a+)+$', /repeats a repeat/],
    ['(.*)*x', /repeats a repeat/],
    ['(\\w{1,5})+', /repeats a repeat/],
    ['(a)\\1', /back-reference/],
  ])('refuses the pattern %j', (pattern, message) => {
    expect(checkExtractor(regex(pattern))).toMatch(message);
  });

  it.each([
    ['', /Enter a path/],
    ['user.name', /start with \$/],
    ['$', /field after/],
    ['$.', /not a valid path/],
    ['$.a[', /not a valid path/],
    ["$['a", /not a valid path/],
    ['$.a[-1]', /not a valid path/],
    ['$..a', /not a valid path/],
    [`$${'.a'.repeat(21)}`, /too deep/],
    [`$.${'a'.repeat(201)}`, /at most 200/],
  ])('refuses the path %j', (jsonPath, message) => {
    expect(checkExtractor(path(jsonPath))).toMatch(message);
  });

  it('is what a form or file is checked with', () => {
    expect(parseExtractorInput('none', '')).toEqual({ ok: true });
    expect(parseExtractorInput('regex', '  id=(\\d+) ')).toEqual({
      ok: true,
      extractor: regex('id=(\\d+)'),
    });
    expect(parseExtractorInput('jsonpath', '$.a')).toEqual({ ok: true, extractor: path('$.a') });
    expect(parseExtractorInput('regex', '(')).toEqual({
      ok: false,
      error: expect.stringMatching(/not a valid pattern/) as string,
    });
  });

  it('reads an extractor from a file or a handshake, and says what is wrong', () => {
    expect(readExtractor({ type: 'regex', pattern: 'a(b)' })).toEqual({
      ok: true,
      extractor: regex('a(b)'),
    });
    expect(readExtractor({ type: 'jsonpath', path: '$.a' })).toEqual({
      ok: true,
      extractor: path('$.a'),
    });
    for (const bad of [
      null,
      'regex',
      { type: 'xpath', path: '/a' },
      { type: 'regex' },
      { type: 'jsonpath', path: 3 },
    ]) {
      expect(readExtractor(bad)).toMatchObject({ ok: false });
    }
    expect(readExtractor({ type: 'regex', pattern: '(a+)+' })).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/repeats a repeat/) as string,
    });
  });
});

describe('US-014: saying what an extractor keeps', () => {
  it('describes a field and a pattern', () => {
    expect(describeExtractor(path('$.user.token'))).toBe('the field $.user.token');
    expect(describeExtractor(regex('id=(\\d+)'))).toBe('what matches /id=(\\d+)/');
  });
});

describe('US-014: applying an extractor to what a rule captured', () => {
  const observed = [
    { name: 'session', value: '{"token":"abc","other":"zzz"}', origin: 'https://example.com' },
    { name: 'plain', value: 'not json', origin: 'https://example.com' },
  ];

  it('leaves values alone when the rule has no extractor', () => {
    expect(extractFrom(makeRule(), observed)).toEqual(observed);
  });

  it('keeps only the extracted field, and drops values it cannot be applied to', () => {
    const rule = makeRule({ extract: path('$.token') });

    expect(extractFrom(rule, observed)).toEqual([
      { name: 'session', value: 'abc', origin: 'https://example.com' },
    ]);
  });
});
