import { isRecord } from '../records';
import type { Destination, Rule } from './types';
import { checkNames, normalizeSite } from './validate';

/** Thrown when a rules file cannot be imported. The message says what to fix. */
export class RuleImportError extends Error {
  override name = 'RuleImportError';
}

const FILE_VERSION = 1;
const MAX_FILE_CHARACTERS = 1_000_000;
const MAX_RULES = 200;

type Definition = Pick<Rule, 'kind' | 'site' | 'names' | 'destination'>;

/**
 * Writes the rules' definitions as a file. Approval and on/off state are never shared.
 * Rules that send to an app are left out (and counted): an app is set up from its own
 * request, on the computer that will run it.
 */
export function exportRules(rules: readonly Rule[]): { text: string; skipped: number } {
  const shareable = rules.filter((rule) => rule.destination.kind === 'log');
  const definitions: Definition[] = shareable.map((rule) => ({
    kind: rule.kind,
    site: rule.site,
    names: [...rule.names],
    destination: { kind: 'log' },
  }));
  return {
    text: `${JSON.stringify({ conduit: FILE_VERSION, kind: 'rules', rules: definitions }, null, 2)}\n`,
    skipped: rules.length - shareable.length,
  };
}

/** Reads a rule's destination; an app destination is accepted only from our own storage. */
function readDestination(raw: unknown, allowSink: boolean): Destination | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.kind === 'log') return { kind: 'log' };
  if (
    allowSink &&
    raw.kind === 'sink' &&
    typeof raw.sinkId === 'string' &&
    raw.sinkId !== '' &&
    typeof raw.wantId === 'string' &&
    raw.wantId !== ''
  ) {
    return { kind: 'sink', sinkId: raw.sinkId, wantId: raw.wantId };
  }
  return undefined;
}

/** Checks the part of a rule that says what it does, returning it or what is wrong. */
function readDefinition(
  raw: unknown,
  allowSink: boolean,
): { definition: Definition } | { problem: string } {
  if (!isRecord(raw)) return { problem: 'it is not a rule.' };
  if (raw.kind !== 'cookie') return { problem: 'the kind must be "cookie".' };

  const site = typeof raw.site === 'string' ? normalizeSite(raw.site) : undefined;
  if (site === undefined) return { problem: 'the site is not a website address.' };

  const names = raw.names;
  if (!Array.isArray(names) || !names.every((name): name is string => typeof name === 'string')) {
    return { problem: 'the cookie names must be a list of text.' };
  }
  const namesProblem = checkNames(names);
  if (namesProblem) return { problem: namesProblem };

  const destination = readDestination(raw.destination, allowSink);
  if (!destination) return { problem: "the destination must be Conduit's local log." };
  return { definition: { kind: 'cookie', site, names: [...names], destination } };
}

/**
 * Reads a rules file. Every rule comes in disabled and unapproved, whatever the file
 * says, so it needs the same approval as a rule made by hand (US-007). Nothing is
 * returned unless the whole file is valid.
 */
export function importRules(text: string, newId: () => string, now: () => string): Rule[] {
  if (text.length > MAX_FILE_CHARACTERS) {
    throw new RuleImportError('That file is too large to be a rules file.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RuleImportError('That file is not valid JSON.');
  }
  if (!isRecord(parsed) || parsed.kind !== 'rules' || typeof parsed.conduit !== 'number') {
    throw new RuleImportError('That is not a Conduit rules file.');
  }
  if (parsed.conduit !== FILE_VERSION) {
    throw new RuleImportError(
      `That rules file is from a different version of Conduit (version ${String(parsed.conduit)}).`,
    );
  }
  const list = parsed.rules;
  if (!Array.isArray(list)) throw new RuleImportError('The file does not contain a list of rules.');
  if (list.length > MAX_RULES) {
    throw new RuleImportError(`A rules file can hold at most ${String(MAX_RULES)} rules.`);
  }

  const createdAt = now();
  return list.map((raw: unknown, index) => {
    const result = readDefinition(raw, false);
    if ('problem' in result) {
      throw new RuleImportError(`Rule ${String(index + 1)}: ${result.problem}`);
    }
    return { id: newId(), ...result.definition, enabled: false, createdAt };
  });
}

/** Reads the rules saved in browser storage, skipping any record that is damaged. */
export function readStoredRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  const rules: Rule[] = [];
  for (const item of raw as unknown[]) {
    if (!isRecord(item)) continue;
    const result = readDefinition(item, true);
    const { id, enabled, createdAt, approvedAt } = item;
    if (
      'problem' in result ||
      typeof id !== 'string' ||
      typeof enabled !== 'boolean' ||
      typeof createdAt !== 'string' ||
      (approvedAt !== undefined && typeof approvedAt !== 'string')
    ) {
      continue;
    }
    rules.push({
      id,
      ...result.definition,
      enabled,
      createdAt,
      ...(approvedAt === undefined ? {} : { approvedAt }),
    });
  }
  return rules;
}
