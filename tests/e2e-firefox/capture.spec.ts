import type { CaptureEntry } from '../../src/core/capture';
import type { Rule } from '../../src/core/rules/types';
import { makeRule } from '../fixtures/rules';
import { expect, test, type Extension } from './fixtures';

// US-017: what the Chrome end-to-end tests check about capturing (US-004 to US-014), checked in
// Firefox. These cover the background code, which is where the two browsers differ. They reach
// the extension through a test-only content script, so the rules are put straight into its
// storage; approving a rule through its page is the same code as in Chrome.

async function log(extension: Extension): Promise<CaptureEntry[]> {
  return ((await extension.get(['log'])).log ?? []) as CaptureEntry[];
}

const logged = (extension: Extension) => async (): Promise<number> => (await log(extension)).length;

const rule = (overrides: Partial<Rule> = {}): Rule => makeRule({ site: 'localhost', ...overrides });

test.describe('capturing cookies in Firefox', () => {
  test('a fresh install captures nothing', async ({ extension, visit }) => {
    await visit();
    await new Promise((wait) => setTimeout(wait, 1000));

    expect(await log(extension)).toEqual([]);
  });

  test('an approved rule saves the named cookie, and only that one', async ({
    extension,
    visit,
  }) => {
    await extension.set({ rules: [rule()] });

    await visit('?sid=first-value-123456');

    await expect.poll(logged(extension)).toBe(1);
    const [entry] = await log(extension);
    expect(entry).toMatchObject({
      ruleText: "Save the cookie sid from localhost to Conduit's local log.",
      origin: 'http://localhost',
      data: { sid: 'first-value-123456' },
    });
  });

  test('saves a changed value, and not the same value twice', async ({ extension, visit }) => {
    await extension.set({ rules: [rule()] });

    await visit('?sid=same-value-123456');
    await expect.poll(logged(extension)).toBe(1);
    await visit('?sid=same-value-123456');
    await new Promise((wait) => setTimeout(wait, 1000));
    expect(await log(extension)).toHaveLength(1);

    await visit('?sid=other-value-654321');
    await expect.poll(logged(extension)).toBe(2);
  });

  test('"Capture now" saves the cookie as it is right now, once', async ({ extension, visit }) => {
    await visit('?sid=current-value-123456');
    await extension.set({ rules: [rule({ id: 'cookie' })] });

    expect(await extension.worker({ type: 'capture-now', ruleId: 'cookie' })).toEqual({
      ok: true,
      count: 1,
    });
    expect(await extension.worker({ type: 'capture-now', ruleId: 'cookie' })).toEqual({
      ok: true,
      count: 0,
    });
    expect((await log(extension))[0]?.data).toEqual({ sid: 'current-value-123456' });
  });

  test('a rule that is off, not approved, or paused captures nothing', async ({
    extension,
    visit,
  }) => {
    const unapproved = rule({ id: 'unapproved' });
    delete unapproved.approvedAt;
    await extension.set({
      rules: [rule({ id: 'off', enabled: false }), unapproved],
      killSwitch: false,
    });
    await visit('?sid=value-for-nobody-1');
    await new Promise((wait) => setTimeout(wait, 1000));
    expect(await log(extension)).toEqual([]);

    await extension.set({ rules: [rule()], killSwitch: true });
    await visit('?sid=value-while-paused-1');
    await new Promise((wait) => setTimeout(wait, 1000));
    expect(await log(extension)).toEqual([]);

    await extension.set({ killSwitch: false });
    await visit('?sid=value-after-resume-1');
    await expect.poll(logged(extension)).toBe(1);
  });

  test('a pattern keeps only the first group of a cookie (US-014)', async ({
    extension,
    visit,
  }) => {
    await extension.set({
      rules: [rule({ extract: { type: 'regex', pattern: 'def(\\d+)' } })],
    });

    await visit('?sid=abc123def456ghi789');

    await expect.poll(logged(extension)).toBe(1);
    expect((await log(extension))[0]?.data).toEqual({ sid: '456' });
  });
});

test.describe('capturing headers in Firefox (US-012)', () => {
  test('saves the named response header, and not the others', async ({ extension, visit }) => {
    await extension.set({
      rules: [rule({ kind: 'header', direction: 'response', names: ['x-conduit-resp'] })],
    });

    await visit('?resp=firefox-response-0001');

    await expect.poll(logged(extension)).toBe(1);
    expect((await log(extension))[0]?.data).toEqual({
      'x-conduit-resp': 'firefox-response-0001',
    });
  });

  test('saves the named request header a page sends, and not the others', async ({
    extension,
    visit,
  }) => {
    await extension.set({
      rules: [rule({ kind: 'header', direction: 'request', names: ['x-conduit-req'] })],
    });

    await visit('?req=firefox-request-0001');

    await expect.poll(logged(extension)).toBe(1);
    const entries = await log(extension);
    expect(entries[0]?.data).toEqual({ 'x-conduit-req': 'firefox-request-0001' });
    expect(JSON.stringify(entries)).not.toContain('x-not-asked');
  });
});

test.describe('reading page storage in Firefox (US-013)', () => {
  test('reads the named localStorage key when a page loads', async ({ extension, visit }) => {
    await extension.set({
      rules: [rule({ kind: 'storage', area: 'local', names: ['conduit-local'] })],
    });

    await visit('?local=firefox-local-0001');

    await expect.poll(logged(extension)).toBe(1);
    expect((await log(extension))[0]?.data).toEqual({
      'conduit-local': 'firefox-local-0001',
    });
  });

  test('reads sessionStorage separately, and one field of JSON (US-014)', async ({
    extension,
    visit,
  }) => {
    await extension.set({
      rules: [
        rule({ id: 'session', kind: 'storage', area: 'session', names: ['conduit-session'] }),
        rule({
          id: 'json',
          kind: 'storage',
          area: 'local',
          names: ['conduit-json'],
          extract: { type: 'jsonpath', path: '$.token' },
        }),
      ],
    });

    await visit('?session=firefox-session-0001&tok=firefox-token-0001');

    await expect.poll(logged(extension)).toBe(2);
    const data = (await log(extension)).map((entry) => entry.data);
    expect(data).toContainEqual({ 'conduit-session': 'firefox-session-0001' });
    expect(data).toContainEqual({ 'conduit-json': 'firefox-token-0001' });
  });

  test('"Capture now" reads the page that is open', async ({ extension, visit }) => {
    await extension.set({
      rules: [rule({ id: 'storage', kind: 'storage', area: 'local', names: ['conduit-local'] })],
    });
    // The page the tests use to reach the extension is itself open on localhost, and holds none of this rule's keys.
    expect(await extension.worker({ type: 'capture-now', ruleId: 'storage' })).toEqual({
      ok: true,
      count: 0,
    });

    await visit('?local=firefox-open-0001');
    await expect.poll(logged(extension)).toBe(1);
    // Nothing has changed since the page load recorded it, so there is nothing new to capture.
    expect(await extension.worker({ type: 'capture-now', ruleId: 'storage' })).toEqual({
      ok: true,
      count: 0,
    });
  });
});
