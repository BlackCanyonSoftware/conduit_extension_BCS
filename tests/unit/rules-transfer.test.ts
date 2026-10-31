import { describe, expect, it } from 'vitest';
import {
  RuleImportError,
  exportRules,
  importRules,
  readStoredRules,
} from '../../src/core/rules/transfer';
import { makeRule } from '../fixtures/rules';

const NOW = '2026-11-01T09:00:00.000Z';
let counter = 0;
const newId = (): string => `new-${String((counter += 1))}`;

function file(rules: unknown, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ conduit: 1, kind: 'rules', rules, ...overrides });
}

const validRule = {
  kind: 'cookie',
  site: 'example.com',
  names: ['sid'],
  destination: { kind: 'log' },
};

describe('US-007: exporting rules', () => {
  it('writes only what a rule does, never its approval', () => {
    const { text, skipped } = exportRules([makeRule({ names: ['sid', 'theme'] })]);

    expect(skipped).toBe(0);
    expect(JSON.parse(text)).toEqual({
      conduit: 1,
      kind: 'rules',
      rules: [
        {
          kind: 'cookie',
          site: 'example.com',
          names: ['sid', 'theme'],
          destination: { kind: 'log' },
        },
      ],
    });
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('US-007: rules that send to an app are not shared in a file', () => {
  it('leaves them out and says how many, because an app is set up from its own request', () => {
    const toApp = makeRule({
      id: 'r2',
      destination: { kind: 'sink', sinkId: 's1', wantId: 'w1' },
    });

    const { text, skipped } = exportRules([makeRule(), toApp]);

    expect(skipped).toBe(1);
    expect((JSON.parse(text) as { rules: unknown[] }).rules).toHaveLength(1);
  });
});

describe('US-007: importing rules', () => {
  it('brings rules in disabled and unapproved, with new ids', () => {
    const rules = importRules(exportRules([makeRule()]).text, newId, () => NOW);

    expect(rules).toEqual([
      {
        id: expect.stringMatching(/^new-/) as string,
        kind: 'cookie',
        site: 'example.com',
        names: ['sid'],
        destination: { kind: 'log' },
        enabled: false,
        createdAt: NOW,
      },
    ]);
    expect(rules[0]).not.toHaveProperty('approvedAt');
  });

  it('ignores a file that claims its rules are already approved or enabled', () => {
    const text = file([
      { ...validRule, enabled: true, approvedAt: '2026-01-01T00:00:00Z', id: 'chosen-id' },
    ]);

    const [rule] = importRules(text, newId, () => NOW);

    expect(rule).toMatchObject({ enabled: false });
    expect(rule).not.toHaveProperty('approvedAt');
    expect(rule?.id).not.toBe('chosen-id');
  });

  it('drops fields it does not know', () => {
    const [rule] = importRules(file([{ ...validRule, webhook: 'http://x' }]), newId, () => NOW);

    expect(rule).not.toHaveProperty('webhook');
  });

  it('reduces a site given as an address to its site', () => {
    const [rule] = importRules(
      file([{ ...validRule, site: 'https://WWW.Example.com/x' }]),
      newId,
      () => NOW,
    );

    expect(rule?.site).toBe('example.com');
  });

  it.each([
    ['text that is not JSON', 'nope', /not valid JSON/],
    ['no Conduit marker', JSON.stringify({ rules: [] }), /not a Conduit rules file/],
    ['a newer file version', file([], { conduit: 2 }), /version/],
    ['rules that are not a list', file('x'), /list of rules/],
    ['an unknown kind', file([{ ...validRule, kind: 'storage' }]), /Rule 1.*kind/],
    ['a bad site', file([validRule, { ...validRule, site: 'not a site' }]), /Rule 2.*site/],
    ['no names', file([{ ...validRule, names: [] }]), /Rule 1.*cookie name/],
    ['a bad name', file([{ ...validRule, names: ['a=b'] }]), /Rule 1.*cookie name/],
    [
      'another destination',
      file([{ ...validRule, destination: { kind: 'sink' } }]),
      /Rule 1.*destination/,
    ],
    ['something that is not a rule', file([5]), /Rule 1/],
  ])('refuses %s, and imports nothing', (_label, text, message) => {
    expect(() => importRules(text, newId, () => NOW)).toThrow(RuleImportError);
    expect(() => importRules(text, newId, () => NOW)).toThrow(message);
  });

  it('refuses a very large file or a very long list', () => {
    expect(() => importRules('x'.repeat(1_000_001), newId, () => NOW)).toThrow(/too large/);
    const many = Array.from({ length: 201 }, () => validRule);
    expect(() => importRules(file(many), newId, () => NOW)).toThrow(/at most 200/);
  });
});

describe('reading rules back from storage', () => {
  it('keeps a rule that sends to an app, which a file can never carry', () => {
    const toApp = makeRule({ destination: { kind: 'sink', sinkId: 's1', wantId: 'w1' } });

    expect(readStoredRules([toApp])).toEqual([toApp]);
  });

  it('skips a stored rule whose app reference is incomplete', () => {
    const broken = { ...makeRule(), destination: { kind: 'sink', sinkId: 's1' } };

    expect(readStoredRules([broken])).toEqual([]);
  });

  it('keeps valid stored rules exactly as saved', () => {
    const rule = makeRule({ names: ['sid', 'theme'] });

    expect(readStoredRules([rule])).toEqual([rule]);
  });

  it('skips records that are damaged, and copes with a missing list', () => {
    const good = makeRule();

    expect(readStoredRules([good, { id: 5 }, null, 'x', { ...good, names: [] }])).toEqual([good]);
    expect(readStoredRules(undefined)).toEqual([]);
    expect(readStoredRules('nope')).toEqual([]);
  });
});
