import { describe, expect, it } from 'vitest';
import { capturesForObserved } from '../../src/core/capture';
import { headerOrigin, matchRuleHeaders, type HeaderObservation } from '../../src/core/headers';
import { describeRule } from '../../src/core/rules/describe';
import { exportRules, importRules, readStoredRules } from '../../src/core/rules/transfer';
import { checkHeaderNames, parseHeaderRuleDraft } from '../../src/core/rules/validate';
import { planSinkDeliveriesFor } from '../../src/core/sinks/delivery';
import { parseHandshake } from '../../src/core/sinks/handshake';
import type { Sink } from '../../src/core/sinks/types';
import { makeRule } from '../fixtures/rules';

const NOW = '2026-11-01T09:00:00.000Z';
let counter = 0;
const ctx = () => ({
  now: NOW,
  newId: () => `id-${String((counter += 1))}`,
});

const headerRule = (overrides: Parameters<typeof makeRule>[0] = {}) =>
  makeRule({ kind: 'header', direction: 'request', names: ['authorization'], ...overrides });

function sent(url: string, headers: Record<string, string>): HeaderObservation {
  return {
    url,
    direction: 'request',
    headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
  };
}

describe('US-012: picking out the headers a rule names', () => {
  it('keeps only the named headers and nothing else of the request', () => {
    const observed = matchRuleHeaders(
      headerRule({ names: ['authorization', 'x-token'] }),
      sent('https://api.example.com/v1/me', {
        Authorization: 'Bearer abc',
        'X-Token': 't1',
        Accept: 'application/json',
        Cookie: 'sid=secret',
      }),
    );

    expect(observed).toEqual([
      { name: 'authorization', value: 'Bearer abc', origin: 'https://api.example.com' },
      { name: 'x-token', value: 't1', origin: 'https://api.example.com' },
    ]);
  });

  it('ignores header names in any letter case', () => {
    const observed = matchRuleHeaders(
      headerRule(),
      sent('https://example.com/', { AUTHORIZATION: 'Bearer abc' }),
    );

    expect(observed.map((item) => item.name)).toEqual(['authorization']);
  });

  it('looks only at requests to the rule’s site and its subdomains', () => {
    const rule = headerRule();
    const send = (url: string) => matchRuleHeaders(rule, sent(url, { authorization: 'x' }));

    expect(send('https://example.com/')).toHaveLength(1);
    expect(send('https://deep.api.example.com/')).toHaveLength(1);
    expect(send('https://notexample.com/')).toHaveLength(0);
    expect(send('https://example.com.evil.test/')).toHaveLength(0);
  });

  it('keeps requests and responses apart', () => {
    const response: HeaderObservation = {
      url: 'https://example.com/',
      direction: 'response',
      headers: [{ name: 'authorization', value: 'x' }],
    };

    expect(matchRuleHeaders(headerRule({ direction: 'request' }), response)).toEqual([]);
    expect(matchRuleHeaders(headerRule({ direction: 'response' }), response)).toHaveLength(1);
  });

  it('joins a header that appears more than once, as HTTP does', () => {
    const observed = matchRuleHeaders(headerRule({ direction: 'response', names: ['x-seen'] }), {
      url: 'https://example.com/',
      direction: 'response',
      headers: [
        { name: 'X-Seen', value: 'a' },
        { name: 'x-seen', value: 'b' },
      ],
    });

    expect(observed).toEqual([{ name: 'x-seen', value: 'a, b', origin: 'https://example.com' }]);
  });

  it('skips headers with no text value and addresses that are not web pages', () => {
    const rule = headerRule();

    expect(
      matchRuleHeaders(rule, {
        url: 'https://example.com/',
        direction: 'request',
        headers: [{ name: 'authorization' }],
      }),
    ).toEqual([]);
    expect(
      matchRuleHeaders(rule, sent('chrome-extension://abc/page.html', { authorization: 'x' })),
    ).toEqual([]);
    expect(matchRuleHeaders(rule, sent('not an address', { authorization: 'x' }))).toEqual([]);
  });

  it('never matches a cookie rule', () => {
    expect(
      matchRuleHeaders(
        makeRule({ names: ['authorization'] }),
        sent('https://example.com/', { authorization: 'x' }),
      ),
    ).toEqual([]);
  });

  it('reports where a request went, without the path or query', () => {
    expect(headerOrigin('https://api.example.com:8443/v1/me?token=secret')).toBe(
      'https://api.example.com:8443',
    );
  });
});

describe('US-012: header rules in one sentence', () => {
  it('says request or response, and the header names', () => {
    expect(describeRule(headerRule())).toBe(
      "Save the request header authorization from example.com to Conduit's local log.",
    );
    expect(describeRule(headerRule({ direction: 'response', names: ['etag', 'x-token'] }))).toBe(
      "Save the response headers etag and x-token from example.com to Conduit's local log.",
    );
  });

  it('names the app a header rule sends to', () => {
    const sink: Pick<Sink, 'name' | 'url' | 'loopback'> = {
      name: 'Test App',
      url: 'http://127.0.0.1:8778',
      loopback: true,
    };

    expect(
      describeRule(headerRule({ destination: { kind: 'sink', sinkId: 's', wantId: 'w' } }), sink),
    ).toBe('Send the request header authorization from example.com to 127.0.0.1:8778 (Test App).');
  });
});

describe('US-012: checking header names', () => {
  it('accepts ordinary header names', () => {
    expect(checkHeaderNames(['authorization', 'X-Api-Key', 'x_custom.1'])).toBeUndefined();
  });

  it.each([
    [[], /at least one header name/],
    [['bad name'], /not a valid header name/],
    [['a:b'], /not a valid header name/],
    [['ünï'], /not a valid header name/],
    [['x'.repeat(201)], /at most 200/],
  ])('rejects %j', (names, message) => {
    expect(checkHeaderNames(names)).toMatch(message);
  });

  it('allows at most 50 names', () => {
    const names = Array.from({ length: 51 }, (_, index) => `x-${String(index)}`);

    expect(checkHeaderNames(names)).toMatch(/at most 50/);
  });
});

describe('US-012: the new-rule form for headers', () => {
  it('reads the site, the direction and the names, in lower case without repeats', () => {
    expect(
      parseHeaderRuleDraft({
        site: 'https://www.example.com/page',
        names: 'Authorization, X-Token authorization',
        direction: 'request',
      }),
    ).toEqual({
      ok: true,
      draft: { site: 'example.com', names: ['authorization', 'x-token'], direction: 'request' },
    });
  });

  it('says what is wrong, field by field', () => {
    const result = parseHeaderRuleDraft({ site: '', names: 'bad:name', direction: 'response' });

    expect(result).toEqual({
      ok: false,
      errors: {
        site: 'Enter a site, for example example.com.',
        names: expect.stringMatching(/not a valid header name/) as string,
      },
    });
  });
});

describe('US-012: saving captured headers to the log', () => {
  const observed = (value: string) => [
    { name: 'authorization', value, origin: 'https://example.com' },
  ];

  it('records one entry per header, with the rule as it read at the time', () => {
    const [entry, ...rest] = capturesForObserved(headerRule(), observed('Bearer abc'), [], ctx());

    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      ruleId: 'rule-1',
      ruleText: "Save the request header authorization from example.com to Conduit's local log.",
      site: 'example.com',
      origin: 'https://example.com',
      destination: 'log',
      data: { authorization: 'Bearer abc' },
    });
  });

  it('leaves out a header whose value has not changed since last time', () => {
    const rule = headerRule();
    const first = capturesForObserved(rule, observed('Bearer abc'), [], ctx());

    expect(capturesForObserved(rule, observed('Bearer abc'), first, ctx())).toEqual([]);
    expect(capturesForObserved(rule, observed('Bearer def'), first, ctx())).toHaveLength(1);
  });
});

describe('US-012: sending captured headers to an app', () => {
  const sink: Sink = {
    id: 's1',
    name: 'Test App',
    url: 'http://127.0.0.1:8778',
    loopback: true,
    addedAt: NOW,
  };
  const rule = headerRule({ destination: { kind: 'sink', sinkId: 's1', wantId: 'auth' } });
  const observed = [{ name: 'authorization', value: 'Bearer abc', origin: 'https://example.com' }];

  it('queues the header with the request id and where it was seen', async () => {
    const plan = await planSinkDeliveriesFor(
      rule,
      sink,
      observed,
      {},
      { now: 0, newId: () => 'p1' },
    );

    expect(plan.pending).toMatchObject([
      {
        id: 'p1',
        wantId: 'auth',
        origin: 'https://example.com',
        data: { authorization: 'Bearer abc' },
        ruleText:
          'Send the request header authorization from example.com to 127.0.0.1:8778 (Test App).',
      },
    ]);
  });

  it('does not queue the same value twice, unless sending is forced', async () => {
    const first = await planSinkDeliveriesFor(rule, sink, observed, {}, ctxFor());
    const again = await planSinkDeliveriesFor(rule, sink, observed, first.seen, ctxFor());
    const forced = await planSinkDeliveriesFor(rule, sink, observed, first.seen, ctxFor(), {
      force: true,
    });

    expect(again.pending).toEqual([]);
    expect(forced.pending).toHaveLength(1);
  });

  function ctxFor() {
    return { now: 0, newId: () => `p-${String((counter += 1))}` };
  }
});

describe('US-012: header rules in a rules file', () => {
  it('exports the direction with the names, and never the approval', () => {
    const { text } = exportRules([headerRule({ direction: 'response', names: ['etag'] })]);

    expect((JSON.parse(text) as { rules: unknown[] }).rules).toEqual([
      {
        kind: 'header',
        direction: 'response',
        site: 'example.com',
        names: ['etag'],
        destination: { kind: 'log' },
      },
    ]);
  });

  it('imports a header rule disabled and unapproved, with the names in lower case', () => {
    const text = JSON.stringify({
      conduit: 1,
      kind: 'rules',
      rules: [
        {
          kind: 'header',
          direction: 'request',
          site: 'example.com',
          names: ['Authorization'],
          destination: { kind: 'log' },
          enabled: true,
          approvedAt: NOW,
        },
      ],
    });

    expect(
      importRules(
        text,
        () => 'new-1',
        () => NOW,
      ),
    ).toEqual([
      {
        id: 'new-1',
        kind: 'header',
        direction: 'request',
        site: 'example.com',
        names: ['authorization'],
        destination: { kind: 'log' },
        enabled: false,
        createdAt: NOW,
      },
    ]);
  });

  it.each([
    ['no direction', { kind: 'header', site: 'example.com', names: ['x-a'] }, /direction/],
    [
      'a bad direction',
      { kind: 'header', direction: 'both', site: 'example.com', names: ['x-a'] },
      /direction/,
    ],
    [
      'a bad header name',
      { kind: 'header', direction: 'request', site: 'example.com', names: ['a b'] },
      /header name/,
    ],
  ])('refuses a file with %s', (_label, rule, message) => {
    const text = JSON.stringify({
      conduit: 1,
      kind: 'rules',
      rules: [{ ...rule, destination: { kind: 'log' } }],
    });

    expect(() =>
      importRules(
        text,
        () => 'x',
        () => NOW,
      ),
    ).toThrow(message);
  });

  it('reads header rules back from storage', () => {
    expect(readStoredRules([headerRule({ direction: 'response' })])).toEqual([
      headerRule({ direction: 'response' }),
    ]);
  });
});

describe('US-012: an app asking for headers', () => {
  const headerWant = {
    id: 'auth',
    kind: 'header',
    origin: 'https://api.example.com',
    names: ['Authorization'],
    why: 'The app calls the API as you.',
  };

  function wantFrom(want: Record<string, unknown>) {
    const result = parseHandshake({ conduit: 1, name: 'App', wants: [want] });
    if (!result.ok) throw new Error(result.error);
    const [first] = result.wants;
    if (!first) throw new Error('no request');
    return first;
  }

  it('can be approved, defaulting to request headers, with names in lower case', () => {
    expect(wantFrom(headerWant)).toMatchObject({
      id: 'auth',
      kind: 'header',
      direction: 'request',
      site: 'example.com',
      names: ['authorization'],
    });
    expect(wantFrom(headerWant).problem).toBeUndefined();
  });

  it('can ask for response headers', () => {
    expect(wantFrom({ ...headerWant, direction: 'response' })).toMatchObject({
      direction: 'response',
    });
  });

  it('cannot be approved with an unknown direction or an invalid header name', () => {
    expect(wantFrom({ ...headerWant, direction: 'sideways' }).problem).toMatch(/direction/);
    expect(wantFrom({ ...headerWant, names: ['bad name'] }).problem).toMatch(/header name/);
  });

  it('still needs a reason', () => {
    expect(wantFrom({ ...headerWant, why: '' }).problem).toMatch(/no reason/);
  });
});
