import { describe, expect, it } from 'vitest';
import { patternsForSite } from '../../src/core/cookies/site';
import { describeRule } from '../../src/core/rules/describe';
import { ruleStatus } from '../../src/core/rules/types';
import { parseRuleDraft } from '../../src/core/rules/validate';
import { makeRule } from '../fixtures/rules';

describe('US-004: describing a rule in one sentence', () => {
  it('names one cookie', () => {
    expect(describeRule(makeRule())).toBe(
      "Save the cookie sid from example.com to Conduit's local log.",
    );
  });

  it('joins two cookies with "and"', () => {
    expect(describeRule(makeRule({ names: ['sid', 'theme'] }))).toBe(
      "Save the cookies sid and theme from example.com to Conduit's local log.",
    );
  });

  it('joins three or more with commas and a final "and"', () => {
    expect(describeRule(makeRule({ names: ['sid', 'theme', 'token'] }))).toBe(
      "Save the cookies sid, theme and token from example.com to Conduit's local log.",
    );
  });
});

describe('US-008, US-010: describing a rule that sends to an app', () => {
  const sendRule = makeRule({ destination: { kind: 'sink', sinkId: 's1', wantId: 'w1' } });
  const app = { name: 'Test App', url: 'http://127.0.0.1:8778', loopback: true };

  it('names the app and where it is', () => {
    expect(describeRule(sendRule, app)).toBe(
      'Send the cookie sid from example.com to 127.0.0.1:8778 (Test App).',
    );
  });

  it('says so when the app is on another computer', () => {
    expect(
      describeRule(sendRule, {
        name: 'Test App',
        url: 'https://sink.example.net',
        loopback: false,
      }),
    ).toBe(
      'Send the cookie sid from example.com to sink.example.net (Test App), which is not on this computer.',
    );
  });

  it('says so when the app has been removed', () => {
    expect(describeRule(sendRule)).toBe(
      'Send the cookie sid from example.com to an app that is no longer set up.',
    );
  });
});

describe('US-005: what state a rule is in', () => {
  it('is active only when approved, enabled and not paused', () => {
    expect(ruleStatus(makeRule(), false)).toBe('active');
  });

  it('needs approval until the person approves it, even if marked enabled', () => {
    const unapproved = makeRule();
    delete unapproved.approvedAt;

    expect(ruleStatus(unapproved, false)).toBe('needs-approval');
  });

  it('is disabled when switched off', () => {
    expect(ruleStatus(makeRule({ enabled: false }), false)).toBe('disabled');
  });

  it('is paused for every approved, enabled rule while the kill switch is on', () => {
    expect(ruleStatus(makeRule(), true)).toBe('paused');
  });

  it('keeps reporting a disabled or unapproved rule as such under the kill switch', () => {
    expect(ruleStatus(makeRule({ enabled: false }), true)).toBe('disabled');
  });
});

describe('US-004: checking what the person typed', () => {
  it('accepts a bare domain and a list of names', () => {
    expect(parseRuleDraft({ site: 'example.com', names: 'sid, theme' })).toEqual({
      ok: true,
      draft: { site: 'example.com', names: ['sid', 'theme'] },
    });
  });

  it('reduces a pasted page address to its site', () => {
    expect(parseRuleDraft({ site: 'https://WWW.Example.com/account?x=1', names: 'sid' })).toEqual({
      ok: true,
      draft: { site: 'example.com', names: ['sid'] },
    });
  });

  it('accepts localhost with a port', () => {
    expect(parseRuleDraft({ site: 'localhost:3000', names: 'sid' })).toMatchObject({
      ok: true,
      draft: { site: 'localhost' },
    });
  });

  it('splits names on commas, spaces and new lines, and drops repeats', () => {
    expect(parseRuleDraft({ site: 'example.com', names: 'sid,theme  sid\ntoken' })).toMatchObject({
      ok: true,
      draft: { names: ['sid', 'theme', 'token'] },
    });
  });

  it('asks for a site when it is empty', () => {
    expect(parseRuleDraft({ site: '   ', names: 'sid' })).toEqual({
      ok: false,
      errors: { site: 'Enter a site, for example example.com.' },
    });
  });

  it.each(['not a site', 'chrome://extensions', 'file:///C:/x.txt'])(
    'rejects %j as a site',
    (site) => {
      expect(parseRuleDraft({ site, names: 'sid' })).toEqual({
        ok: false,
        errors: { site: 'That does not look like a website address.' },
      });
    },
  );

  it('asks for at least one cookie name', () => {
    expect(parseRuleDraft({ site: 'example.com', names: ' , ' })).toEqual({
      ok: false,
      errors: { names: 'Enter at least one cookie name.' },
    });
  });

  it('reports a bad site and bad names together', () => {
    const result = parseRuleDraft({ site: '', names: '' });

    expect(result).toMatchObject({ ok: false, errors: { site: expect.any(String) as string } });
    expect(result).toMatchObject({ ok: false, errors: { names: expect.any(String) as string } });
  });

  it.each(['a=b', 'a;b', 'a"b', 'a\\b', 'a\u0001b'])('rejects the cookie name %j', (name) => {
    const result = parseRuleDraft({ site: 'example.com', names: name });

    expect(result.ok).toBe(false);
  });

  it('rejects a name that is far too long, and too many names', () => {
    expect(parseRuleDraft({ site: 'example.com', names: 'a'.repeat(201) }).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, index) => `n${String(index)}`).join(',');
    expect(parseRuleDraft({ site: 'example.com', names: many }).ok).toBe(false);
  });
});

describe('patterns for a site', () => {
  it.each([
    ['example.com', ['*://*.example.com/*']],
    ['example.co.uk', ['*://*.example.co.uk/*']],
    ['localhost', ['*://localhost/*']],
    ['127.0.0.1', ['*://127.0.0.1/*']],
    ['[::1]', ['*://[::1]/*']],
  ])('%s', (site, patterns) => {
    expect(patternsForSite(site)).toEqual(patterns);
  });
});
