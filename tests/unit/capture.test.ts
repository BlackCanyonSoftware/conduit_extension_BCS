import { describe, expect, it } from 'vitest';
import {
  LOG_CAP,
  appendCapture,
  captureBytes,
  capturesFor,
  cookieBelongsToSite,
  logToJson,
  matchRuleCookies,
  readStoredLog,
  type CaptureEntry,
} from '../../src/core/capture';
import type { Cookie } from '../../src/core/cookies/types';
import { SAMPLE_COOKIES } from '../fixtures/cookies';
import { makeRule } from '../fixtures/rules';

function cookie(overrides: Partial<Cookie>): Cookie {
  const [first] = SAMPLE_COOKIES;
  if (!first) throw new Error('fixture missing');
  return { ...first, ...overrides };
}

let counter = 0;
const ctx = () => ({
  now: '2026-11-01T09:00:00.000Z',
  newId: () => `id-${String((counter += 1))}`,
});

function entry(overrides: Partial<CaptureEntry> = {}): CaptureEntry {
  return {
    id: 'e1',
    at: '2026-11-01T08:00:00.000Z',
    ruleId: 'rule-1',
    ruleText: "Save the cookie sid from example.com to Conduit's local log.",
    site: 'example.com',
    origin: 'https://www.example.com',
    destination: 'log',
    data: { sid: 'old' },
    bytes: 13,
    ...overrides,
  };
}

describe('which cookies belong to a site', () => {
  it.each([
    ['example.com', true],
    ['.example.com', true],
    ['www.example.com', true],
    ['.WWW.Example.com', true],
    ['notexample.com', false],
    ['example.com.evil.test', false],
    ['.evil.test', false],
  ])('%s', (domain, expected) => {
    expect(cookieBelongsToSite(domain, 'example.com')).toBe(expected);
  });
});

describe('US-004: picking out the cookies a rule names', () => {
  it("keeps only the named cookies on the rule's site", () => {
    const cookies = [
      cookie({ name: 'sid', domain: 'www.example.com' }),
      cookie({ name: 'theme', domain: '.example.com' }),
      cookie({ name: 'sid', domain: '.other.test' }),
    ];

    expect(matchRuleCookies(makeRule(), cookies).map((c) => `${c.name}@${c.domain}`)).toEqual([
      'sid@www.example.com',
    ]);
  });
});

describe('US-006: what a capture records', () => {
  it('records the time, the rule as it read then, the value and its size', () => {
    const entries = capturesFor(
      makeRule(),
      [cookie({ name: 'sid', value: 'abc', domain: 'www.example.com', secure: true })],
      [],
      ctx(),
    );

    expect(entries).toEqual([
      {
        id: expect.stringMatching(/^id-/) as string,
        at: '2026-11-01T09:00:00.000Z',
        ruleId: 'rule-1',
        ruleText: "Save the cookie sid from example.com to Conduit's local log.",
        site: 'example.com',
        origin: 'https://www.example.com',
        destination: 'log',
        data: { sid: 'abc' },
        bytes: 13,
      },
    ]);
  });

  it('counts bytes, not characters', () => {
    expect(captureBytes({ a: 'é' })).toBe(10);
  });

  it('skips a value that is the same as the last one captured for that rule', () => {
    const log = [entry({ data: { sid: 'same' } })];

    expect(capturesFor(makeRule(), [cookie({ name: 'sid', value: 'same' })], log, ctx())).toEqual(
      [],
    );
    expect(
      capturesFor(makeRule(), [cookie({ name: 'sid', value: 'changed' })], log, ctx()),
    ).toHaveLength(1);
  });

  it('compares against the same rule only', () => {
    const log = [entry({ ruleId: 'other-rule', data: { sid: 'same' } })];

    expect(
      capturesFor(makeRule(), [cookie({ name: 'sid', value: 'same' })], log, ctx()),
    ).toHaveLength(1);
  });

  it('does not record the same value twice within one batch', () => {
    const twice = [
      cookie({ name: 'sid', value: 'v' }),
      cookie({ name: 'sid', value: 'v', path: '/a' }),
    ];

    expect(capturesFor(makeRule(), twice, [], ctx())).toHaveLength(1);
  });
});

describe('US-006: keeping the log to a sensible size', () => {
  it('keeps the newest entries when the cap is passed', () => {
    const log = [entry({ id: 'a' }), entry({ id: 'b' })];

    expect(appendCapture(log, [entry({ id: 'c' })], 2).map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('defaults to a cap of 1000', () => {
    expect(LOG_CAP).toBe(1000);
  });

  it('writes the whole log as a JSON file', () => {
    const parsed = JSON.parse(logToJson([entry()])) as {
      conduit: number;
      kind: string;
      entries: unknown[];
    };

    expect(parsed).toMatchObject({ conduit: 1, kind: 'capture-log' });
    expect(parsed.entries).toHaveLength(1);
  });

  it('reads an older entry that has no origin, filling it in from the site', () => {
    const older: Record<string, unknown> = { ...entry() };
    delete older.origin;

    expect(readStoredLog([older])).toEqual([entry({ origin: 'https://example.com' })]);
  });

  it('reads a stored log back, skipping damaged entries', () => {
    expect(readStoredLog([entry(), { id: 1 }, null])).toEqual([entry()]);
    expect(readStoredLog(undefined)).toEqual([]);
  });
});
