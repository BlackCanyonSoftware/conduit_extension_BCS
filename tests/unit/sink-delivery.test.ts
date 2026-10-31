import { describe, expect, it } from 'vitest';
import type { Cookie } from '../../src/core/cookies/types';
import {
  DELIVERY_LOG_CAP,
  QUEUE_CAP,
  afterFailure,
  appendDelivery,
  deliveryLogToJson,
  deliveryPayload,
  digestOf,
  dueDeliveries,
  nextWake,
  planSinkDeliveries,
  readStoredDeliveries,
  readStoredQueue,
  readStoredSinks,
  retryDelay,
  trimQueue,
  type DeliveryEntry,
  type PendingDelivery,
} from '../../src/core/sinks/delivery';
import type { Sink } from '../../src/core/sinks/types';
import { SAMPLE_COOKIES } from '../fixtures/cookies';
import { makeRule } from '../fixtures/rules';

const NOW = Date.parse('2026-11-01T09:00:00.000Z');
const sink: Sink = {
  id: 'sink-1',
  name: 'Test App',
  url: 'http://127.0.0.1:8778',
  loopback: true,
  addedAt: '2026-11-01T08:00:00.000Z',
};
const rule = makeRule({
  destination: { kind: 'sink', sinkId: 'sink-1', wantId: 'session' },
  names: ['sid'],
});

function cookie(overrides: Partial<Cookie>): Cookie {
  const [first] = SAMPLE_COOKIES;
  if (!first) throw new Error('fixture missing');
  return { ...first, ...overrides };
}

let counter = 0;
const ctx = (now = NOW) => ({ now, newId: () => `p-${String((counter += 1))}` });

function pending(overrides: Partial<PendingDelivery> = {}): PendingDelivery {
  return {
    id: 'p1',
    ruleId: 'rule-1',
    ruleText: 'Send the cookie sid from example.com to 127.0.0.1:8778 (Test App).',
    sinkId: 'sink-1',
    wantId: 'session',
    origin: 'https://www.example.com',
    capturedAt: '2026-11-01T08:59:00.000Z',
    data: { sid: 'abc' },
    bytes: 13,
    attempts: 0,
    gaveUp: false,
    ...overrides,
  };
}

describe('US-009: what is sent to an app', () => {
  it('is the contract body: version, request id, time, origin and the values', () => {
    expect(deliveryPayload(pending())).toEqual({
      conduit: 1,
      id: 'session',
      captured_at: '2026-11-01T08:59:00.000Z',
      origin: 'https://www.example.com',
      data: { sid: 'abc' },
    });
  });
});

describe('US-009: what to do when an app does not answer', () => {
  it.each([
    [1, 30_000],
    [2, 120_000],
    [3, 600_000],
    [4, 1_800_000],
    [5, undefined],
  ])('after %i failed attempts, wait %s ms', (attempts, delay) => {
    expect(retryDelay(attempts)).toBe(delay);
  });

  it('records the failure and schedules the next try', () => {
    expect(afterFailure(pending(), NOW, 'The app answered 500.')).toMatchObject({
      attempts: 1,
      lastError: 'The app answered 500.',
      gaveUp: false,
      nextAttemptAt: new Date(NOW + 30_000).toISOString(),
    });
  });

  it('gives up after the last scheduled try, keeping the reason', () => {
    const last = afterFailure(pending({ attempts: 4 }), NOW, 'The app answered 500.');

    expect(last).toMatchObject({ attempts: 5, gaveUp: true, lastError: 'The app answered 500.' });
    expect(last).not.toHaveProperty('nextAttemptAt');
  });

  it('picks the deliveries that are due now, never one that gave up', () => {
    const fresh = pending({ id: 'fresh' });
    const dueAgain = pending({
      id: 'due',
      attempts: 1,
      nextAttemptAt: new Date(NOW - 1000).toISOString(),
    });
    const later = pending({
      id: 'later',
      attempts: 1,
      nextAttemptAt: new Date(NOW + 60_000).toISOString(),
    });
    const gaveUp = pending({ id: 'gone', attempts: 5, gaveUp: true });

    expect(dueDeliveries([fresh, dueAgain, later, gaveUp], NOW).map((item) => item.id)).toEqual([
      'fresh',
      'due',
    ]);
  });

  it('says when to wake next: the earliest time a waiting delivery is due', () => {
    const queue = [
      pending({ id: 'a', attempts: 1, nextAttemptAt: new Date(NOW + 90_000).toISOString() }),
      pending({ id: 'b', attempts: 1, nextAttemptAt: new Date(NOW + 30_000).toISOString() }),
      pending({ id: 'c', attempts: 5, gaveUp: true }),
    ];

    expect(nextWake(queue)).toBe(NOW + 30_000);
    expect(nextWake([pending({ attempts: 5, gaveUp: true }), pending()])).toBeUndefined();
  });
});

describe('US-009: choosing what to send for a rule', () => {
  it('queues the named cookies that changed, with the rule written out in full', async () => {
    const plan = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', value: 'abc', domain: 'www.example.com', secure: true })],
      {},
      ctx(),
    );

    expect(plan.pending).toEqual([
      {
        id: expect.stringMatching(/^p-/) as string,
        ruleId: 'rule-1',
        ruleText: 'Send the cookie sid from example.com to 127.0.0.1:8778 (Test App).',
        sinkId: 'sink-1',
        wantId: 'session',
        origin: 'https://www.example.com',
        capturedAt: new Date(NOW).toISOString(),
        data: { sid: 'abc' },
        bytes: 13,
        attempts: 0,
        gaveUp: false,
      },
    ]);
  });

  it('uses http as the origin for a cookie that is not Secure, and drops a leading dot', async () => {
    const plan = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', domain: '.example.com', secure: false })],
      {},
      ctx(),
    );

    expect(plan.pending[0]?.origin).toBe('http://example.com');
  });

  it('skips a value it has already sent, and remembers only a digest of it', async () => {
    const first = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', value: 'abc' })],
      {},
      ctx(),
    );
    const again = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', value: 'abc' })],
      first.seen,
      ctx(),
    );
    const changed = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', value: 'changed' })],
      first.seen,
      ctx(),
    );

    expect(first.pending).toHaveLength(1);
    expect(again.pending).toHaveLength(0);
    expect(changed.pending).toHaveLength(1);
    expect(JSON.stringify(first.seen)).not.toContain('abc');
    expect(Object.keys(first.seen)).toEqual(['rule-1']);
  });

  it('sends again when asked to, even for a value it has sent', async () => {
    const first = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', value: 'abc' })],
      {},
      ctx(),
    );
    const forced = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', value: 'abc' })],
      first.seen,
      ctx(),
      { force: true },
    );

    expect(forced.pending).toHaveLength(1);
  });

  it('ignores cookies the rule does not name', async () => {
    const plan = await planSinkDeliveries(rule, sink, [cookie({ name: 'theme' })], {}, ctx());

    expect(plan.pending).toEqual([]);
  });

  it('keeps what it has seen for other rules', async () => {
    const plan = await planSinkDeliveries(
      rule,
      sink,
      [cookie({ name: 'sid', value: 'abc' })],
      { 'other-rule': { sid: 'digest' } },
      ctx(),
    );

    expect(plan.seen['other-rule']).toEqual({ sid: 'digest' });
  });

  it('makes a digest that depends on both the name and the value', async () => {
    expect(await digestOf('a\u0000b')).toMatch(/^[0-9a-f]{64}$/);
    expect(await digestOf('a\u0000b')).toBe(await digestOf('a\u0000b'));
    expect(await digestOf('a\u0000b')).not.toBe(await digestOf('ab\u0000'));
  });
});

describe('keeping the delivery log and the queue to a sensible size', () => {
  const entry = (id: string): DeliveryEntry => ({
    id,
    at: '2026-11-01T09:00:00.000Z',
    ruleId: 'rule-1',
    ruleText: 'Send the cookie sid from example.com to 127.0.0.1:8778 (Test App).',
    sinkName: 'Test App',
    target: '127.0.0.1:8778',
    bytes: 13,
    result: 'delivered',
  });

  it('keeps the newest delivery entries', () => {
    expect(appendDelivery([entry('a'), entry('b')], entry('c'), 2).map((item) => item.id)).toEqual([
      'b',
      'c',
    ]);
    expect(DELIVERY_LOG_CAP).toBe(500);
    expect(QUEUE_CAP).toBe(200);
  });

  it('writes the delivery log as a file', () => {
    const parsed = JSON.parse(deliveryLogToJson([entry('a')])) as {
      kind: string;
      entries: unknown[];
    };

    expect(parsed).toMatchObject({ kind: 'delivery-log' });
    expect(parsed.entries).toHaveLength(1);
  });

  it('never stores a value in a delivery entry', () => {
    expect(Object.keys(entry('a'))).not.toContain('data');
  });
});

describe('a queue that has filled up', () => {
  it('keeps the newest deliveries and reports the ones that were pushed out', () => {
    const queue = ['a', 'b', 'c', 'd'].map((id) => pending({ id }));

    const { kept, dropped } = trimQueue(queue, 3);

    expect(kept.map((item) => item.id)).toEqual(['b', 'c', 'd']);
    expect(dropped.map((item) => item.id)).toEqual(['a']);
  });

  it('drops nothing while there is room', () => {
    expect(trimQueue([pending()], 3)).toEqual({ kept: [pending()], dropped: [] });
  });
});

describe('reading saved apps, queue and delivery log', () => {
  it('keeps valid saved apps and skips damaged ones', () => {
    const route = { ...sink, route: '/api/integrity', confirmedAt: '2026-11-01T08:00:00.000Z' };

    expect(readStoredSinks([sink, route, { id: 1 }, null, { ...sink, url: 'ftp://x' }])).toEqual([
      sink,
      route,
    ]);
    expect(readStoredSinks([{ ...sink, route: '//other.test/x' }])).toEqual([]);
    expect(readStoredSinks(undefined)).toEqual([]);
  });

  it('keeps valid queued deliveries and skips damaged ones', () => {
    const waiting = pending({
      id: 'w',
      attempts: 1,
      nextAttemptAt: '2026-11-01T09:00:30.000Z',
      lastError: 'The app answered 500.',
    });

    expect(readStoredQueue([pending(), waiting, { id: 'x' }, 7])).toEqual([pending(), waiting]);
  });

  it('keeps valid delivery entries and skips damaged ones', () => {
    const good: DeliveryEntry = {
      id: 'a',
      at: '2026-11-01T09:00:00.000Z',
      ruleId: 'rule-1',
      ruleText: 'text',
      sinkName: 'Test App',
      target: '127.0.0.1:8778',
      bytes: 13,
      result: 'retrying',
      detail: 'The app answered 500.',
    };

    expect(readStoredDeliveries([good, { ...good, result: 'weird' }, null])).toEqual([good]);
  });
});
