import type { Rule } from '../../src/core/rules/types';

/** An approved, enabled rule for one cookie; override any field. */
export function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    kind: 'cookie',
    site: 'example.com',
    names: ['sid'],
    destination: { kind: 'log' },
    enabled: true,
    createdAt: '2026-10-30T12:00:00.000Z',
    approvedAt: '2026-10-30T12:01:00.000Z',
    ...overrides,
  };
}
