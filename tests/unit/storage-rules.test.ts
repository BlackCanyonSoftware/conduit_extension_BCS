import { describe, expect, it } from 'vitest';
import { capturesForObserved, observedCookies } from '../../src/core/capture';
import { matchRuleHeaders } from '../../src/core/headers';
import {
  matchRuleStorage,
  storageNeeds,
  type StorageObservation,
} from '../../src/core/page-storage';
import { describeRule } from '../../src/core/rules/describe';
import { exportRules, importRules, readStoredRules } from '../../src/core/rules/transfer';
import { checkStorageKeys, parseStorageRuleDraft } from '../../src/core/rules/validate';
import { parseHandshake } from '../../src/core/sinks/handshake';
import { ruleFieldsFor } from '../../src/core/sinks/want';
import { SAMPLE_COOKIES } from '../fixtures/cookies';
import { makeRule } from '../fixtures/rules';

const NOW = '2026-11-01T09:00:00.000Z';

const storageRule = (overrides: Parameters<typeof makeRule>[0] = {}) =>
  makeRule({ kind: 'storage', area: 'local', names: ['token'], ...overrides });

function read(
  url: string,
  items: Record<string, string>,
  area: StorageObservation['area'] = 'local',
): StorageObservation {
  return { url, area, items };
}

describe('US-013: picking out the storage keys a rule names', () => {
  it('keeps only the named keys, from the rule’s own kind of storage', () => {
    const observed = matchRuleStorage(
      storageRule({ names: ['token', 'theme'] }),
      read('https://app.example.com/page?x=1', { token: 't-1', theme: 'dark', other: 'no' }),
    );

    expect(observed).toEqual([
      { name: 'token', value: 't-1', origin: 'https://app.example.com' },
      { name: 'theme', value: 'dark', origin: 'https://app.example.com' },
    ]);
  });

  it('keeps localStorage and sessionStorage apart', () => {
    const items = { token: 'x' };

    expect(
      matchRuleStorage(storageRule({ area: 'session' }), read('https://example.com/', items)),
    ).toEqual([]);
    expect(
      matchRuleStorage(
        storageRule({ area: 'session' }),
        read('https://example.com/', items, 'session'),
      ),
    ).toHaveLength(1);
  });

  it('keys are case sensitive', () => {
    expect(matchRuleStorage(storageRule(), read('https://example.com/', { Token: 'x' }))).toEqual(
      [],
    );
  });

  it('looks only at pages on the rule’s site, and never at a cookie or header rule', () => {
    const items = { token: 'x' };

    expect(matchRuleStorage(storageRule(), read('https://example.com.evil.test/', items))).toEqual(
      [],
    );
    expect(matchRuleStorage(storageRule(), read('chrome://settings/', items))).toEqual([]);
    expect(
      matchRuleStorage(makeRule({ names: ['token'] }), read('https://example.com/', items)),
    ).toEqual([]);
  });
});

describe('US-013: asking a page for only the keys it needs', () => {
  const rules = [
    storageRule({ id: 'a', names: ['token'] }),
    storageRule({ id: 'b', names: ['theme', 'token'] }),
    storageRule({ id: 'c', area: 'session', names: ['draft'] }),
    storageRule({ id: 'd', site: 'other.test', names: ['nope'] }),
    makeRule({ id: 'e', names: ['sid'] }),
  ];

  it('lists each kind of storage with the keys the rules for this page name, once', () => {
    expect(storageNeeds(rules, 'https://www.example.com/')).toEqual([
      { area: 'local', keys: ['token', 'theme'] },
      { area: 'session', keys: ['draft'] },
    ]);
  });

  it('lists nothing for a page no rule watches', () => {
    expect(storageNeeds(rules, 'https://unrelated.test/')).toEqual([]);
    expect(storageNeeds(rules, 'about:blank')).toEqual([]);
  });
});

describe('US-013: the sentence for a storage rule', () => {
  it('names the kind of storage and the keys', () => {
    expect(describeRule(storageRule())).toBe(
      "Save the localStorage key token from example.com to Conduit's local log.",
    );
    expect(describeRule(storageRule({ area: 'session', names: ['a', 'b'] }))).toBe(
      "Save the sessionStorage keys a and b from example.com to Conduit's local log.",
    );
  });
});

describe('US-013: checking storage keys', () => {
  it('accepts ordinary keys, including ones with punctuation', () => {
    expect(checkStorageKeys(['token', 'user:1', 'a=b', 'Mixed.Case_key'])).toBeUndefined();
  });

  it.each([
    [[], /at least one key/],
    [['a\u0000b'], /not a valid key/],
    [['x'.repeat(201)], /at most 200/],
  ])('refuses %j', (names, message) => {
    expect(checkStorageKeys(names)).toMatch(message);
  });

  it('reads the new-rule form, keeping the case of each key', () => {
    expect(
      parseStorageRuleDraft({
        site: 'https://Example.com/x',
        names: 'Token, theme Token',
        area: 'session',
      }),
    ).toEqual({
      ok: true,
      draft: { site: 'example.com', names: ['Token', 'theme'], area: 'session' },
    });
    expect(parseStorageRuleDraft({ site: '', names: '', area: 'local' })).toEqual({
      ok: false,
      errors: {
        site: 'Enter a site, for example example.com.',
        names: 'Enter at least one key.',
      },
    });
  });
});

describe('US-014: an extractor on each kind of rule', () => {
  const blob = '{"token":"abc","other":"zzz"}';
  const extract = { type: 'jsonpath', path: '$.token' } as const;

  it('keeps only the field of a cookie', () => {
    const [first] = SAMPLE_COOKIES;
    if (!first) throw new Error('fixture missing');
    const cookie = { ...first, name: 'sid', value: blob };

    expect(observedCookies(makeRule({ extract }), [cookie]).map((item) => item.value)).toEqual([
      'abc',
    ]);
  });

  it('keeps only the field of a header', () => {
    const rule = makeRule({ kind: 'header', direction: 'request', names: ['x-data'], extract });

    expect(
      matchRuleHeaders(rule, {
        url: 'https://example.com/',
        direction: 'request',
        headers: [{ name: 'X-Data', value: blob }],
      }).map((item) => item.value),
    ).toEqual(['abc']);
  });

  it('keeps only the field of a storage value', () => {
    expect(
      matchRuleStorage(storageRule({ extract }), read('https://example.com/', { token: blob })).map(
        (item) => item.value,
      ),
    ).toEqual(['abc']);
  });

  it('records a change only when the extracted field changes', () => {
    const rule = storageRule({ extract });
    const at = (value: string) =>
      matchRuleStorage(rule, read('https://example.com/', { token: value }));
    const ctx = { now: NOW, newId: () => 'id' };
    const first = capturesForObserved(rule, at('{"token":"abc","n":1}'), [], ctx);

    expect(first[0]?.data).toEqual({ token: 'abc' });
    expect(capturesForObserved(rule, at('{"token":"abc","n":2}'), first, ctx)).toEqual([]);
    expect(capturesForObserved(rule, at('{"token":"def","n":2}'), first, ctx)).toHaveLength(1);
  });

  it('says what is kept in the sentence', () => {
    expect(describeRule(makeRule({ extract }))).toBe(
      "Save the cookie sid from example.com, keeping only the field $.token, to Conduit's local log.",
    );
    expect(describeRule(storageRule({ extract: { type: 'regex', pattern: 'id=(\\d+)' } }))).toBe(
      "Save the localStorage key token from example.com, keeping only what matches /id=(\\d+)/, to Conduit's local log.",
    );
  });
});

describe('US-013 and US-014: storage and extractor rules in a rules file', () => {
  const file = (rule: Record<string, unknown>) =>
    JSON.stringify({
      conduit: 1,
      kind: 'rules',
      rules: [{ destination: { kind: 'log' }, ...rule }],
    });
  const load = (rule: Record<string, unknown>) =>
    importRules(
      file(rule),
      () => 'n1',
      () => NOW,
    );

  it('exports the storage area and the extractor, and never the approval', () => {
    const extract = { type: 'regex', pattern: 'a(b)' } as const;
    const { text } = exportRules([storageRule({ area: 'session', extract })]);

    expect((JSON.parse(text) as { rules: unknown[] }).rules).toEqual([
      {
        kind: 'storage',
        area: 'session',
        extract,
        site: 'example.com',
        names: ['token'],
        destination: { kind: 'log' },
      },
    ]);
  });

  it('imports them switched off and unapproved', () => {
    expect(
      load({
        kind: 'storage',
        area: 'local',
        site: 'example.com',
        names: ['Token'],
        extract: { type: 'jsonpath', path: '$.a' },
        enabled: true,
        approvedAt: NOW,
      }),
    ).toEqual([
      {
        id: 'n1',
        kind: 'storage',
        area: 'local',
        site: 'example.com',
        names: ['Token'],
        extract: { type: 'jsonpath', path: '$.a' },
        destination: { kind: 'log' },
        enabled: false,
        createdAt: NOW,
      },
    ]);
  });

  it('can carry an extractor on a cookie rule', () => {
    const [rule] = load({
      kind: 'cookie',
      site: 'example.com',
      names: ['sid'],
      extract: { type: 'jsonpath', path: '$.a' },
    });

    expect(rule?.extract).toEqual({ type: 'jsonpath', path: '$.a' });
  });

  it.each([
    ['no area', { kind: 'storage', site: 'example.com', names: ['a'] }, /area/],
    ['a bad area', { kind: 'storage', area: 'cookie', site: 'example.com', names: ['a'] }, /area/],
    [
      'a bad key',
      { kind: 'storage', area: 'local', site: 'example.com', names: ['a\u0000'] },
      /key/,
    ],
    [
      'a pattern that could hang',
      {
        kind: 'cookie',
        site: 'example.com',
        names: ['a'],
        extract: { type: 'regex', pattern: '(a+)+' },
      },
      /Rule 1.*repeats a repeat/,
    ],
    [
      'an unknown extractor',
      { kind: 'cookie', site: 'example.com', names: ['a'], extract: { type: 'xpath' } },
      /Rule 1.*extractor/,
    ],
  ])('refuses a file with %s', (_label, rule, message) => {
    expect(() => load(rule)).toThrow(message);
  });

  it('reads storage rules back from storage', () => {
    const rule = storageRule({ extract: { type: 'jsonpath', path: '$.a' } });

    expect(readStoredRules([rule])).toEqual([rule]);
  });
});

describe('US-013 and US-014: an app asking for storage and fields', () => {
  const want = {
    id: 'tok',
    kind: 'storage',
    origin: 'https://app.example.com',
    names: ['Token'],
    why: 'The app signs in as you.',
  };

  function wantFrom(raw: Record<string, unknown>) {
    const result = parseHandshake({ conduit: 1, name: 'App', wants: [raw] });
    if (!result.ok) throw new Error(result.error);
    const [first] = result.wants;
    if (!first) throw new Error('no request');
    return first;
  }

  it('can ask for storage, defaulting to localStorage, keeping the case of keys', () => {
    expect(wantFrom(want)).toMatchObject({
      kind: 'storage',
      area: 'local',
      names: ['Token'],
      site: 'example.com',
    });
    expect(wantFrom(want).problem).toBeUndefined();
    expect(wantFrom({ ...want, area: 'session' })).toMatchObject({ area: 'session' });
  });

  it('cannot be approved with an unknown area or a bad key', () => {
    expect(wantFrom({ ...want, area: 'indexeddb' }).problem).toMatch(/area/);
    expect(wantFrom({ ...want, names: ['a\u0000'] }).problem).toMatch(/key/);
  });

  it('can ask for only a field of the value', () => {
    const extract = { type: 'jsonpath', path: '$.token' };

    expect(wantFrom({ ...want, extract })).toMatchObject({ extract });
    expect(wantFrom({ ...want, kind: 'cookie', extract })).toMatchObject({ extract });
  });

  it('shows why an extractor cannot be approved', () => {
    expect(wantFrom({ ...want, extract: { type: 'regex', pattern: '(a+)+' } }).problem).toMatch(
      /repeats a repeat/,
    );
    expect(wantFrom({ ...want, extract: 'nope' }).problem).toMatch(/extractor/);
  });

  it('still shows kinds it does not know as not supported', () => {
    expect(wantFrom({ ...want, kind: 'indexeddb' }).problem).toBe(
      'This kind of request is not supported.',
    );
  });
});

describe('US-013 and US-014: turning an approved request into a rule', () => {
  it('carries what the request captures', () => {
    const extract = { type: 'jsonpath', path: '$.a' } as const;

    expect(ruleFieldsFor({ kind: 'cookie' })).toEqual({ kind: 'cookie' });
    expect(ruleFieldsFor({ kind: 'header' })).toEqual({ kind: 'header', direction: 'request' });
    expect(ruleFieldsFor({ kind: 'header', direction: 'response' })).toEqual({
      kind: 'header',
      direction: 'response',
    });
    expect(ruleFieldsFor({ kind: 'storage' })).toEqual({ kind: 'storage', area: 'local' });
    expect(ruleFieldsFor({ kind: 'storage', area: 'session', extract })).toEqual({
      kind: 'storage',
      area: 'session',
      extract,
    });
  });
});
