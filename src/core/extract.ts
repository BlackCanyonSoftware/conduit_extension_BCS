import type { Observed } from './capture';
import { isRecord } from './records';
import type { Rule } from './rules/types';

/** Keeps one part of a captured value: what a pattern matches, or one field of JSON. */
export type Extractor = { type: 'regex'; pattern: string } | { type: 'jsonpath'; path: string };

export type ExtractorChoice = 'none' | Extractor['type'];

const MAX_PATTERN_LENGTH = 200;
const MAX_PATH_LENGTH = 200;
const MAX_PATH_STEPS = 20;
/** A pattern is only tried on values up to this long, so a huge value cannot keep the worker busy. */
const MAX_REGEX_INPUT = 20_000;
const MAX_JSON_INPUT = 200_000;

/** A group that repeats something and is itself repeated, such as `(a+)+`: it can take forever. */
const REPEATED_REPEAT =
  /\((?:[^()\\]|\\.)*(?:[+*]|\{\d*,\d*\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,?\d*\})/;
const BACK_REFERENCE = /\\[1-9]|\\k</;

type Step = string | number;

/** Splits `$.a.b[0]['c d']` into steps, or says what is wrong with it. */
function parsePath(path: string): { steps: Step[] } | { error: string } {
  if (path === '') return { error: 'Enter a path, for example $.user.token.' };
  if (!path.startsWith('$'))
    return { error: 'A path must start with $, for example $.user.token.' };
  if (path === '$') return { error: 'Name a field after $, for example $.user.token.' };
  if (path.length > MAX_PATH_LENGTH) {
    return { error: `A path can be at most ${String(MAX_PATH_LENGTH)} characters.` };
  }
  const invalid = {
    error: "That is not a valid path. Use forms like $.a.b, $.list[0] or $['key'].",
  };
  const steps: Step[] = [];
  let index = 1;
  while (index < path.length) {
    const here = path.charAt(index);
    if (here === '.') {
      let end = index + 1;
      while (end < path.length && path.charAt(end) !== '.' && path.charAt(end) !== '[') end += 1;
      if (end === index + 1) return invalid;
      steps.push(path.slice(index + 1, end));
      index = end;
    } else if (here === '[') {
      const quote = path.charAt(index + 1);
      if (quote === "'" || quote === '"') {
        const close = path.indexOf(quote, index + 2);
        if (close === -1 || path.charAt(close + 1) !== ']') return invalid;
        steps.push(path.slice(index + 2, close));
        index = close + 2;
      } else {
        const close = path.indexOf(']', index + 1);
        const digits = close === -1 ? '' : path.slice(index + 1, close);
        if (!/^\d{1,9}$/.test(digits)) return invalid;
        steps.push(Number(digits));
        index = close + 1;
      }
    } else {
      return invalid;
    }
  }
  if (steps.length > MAX_PATH_STEPS) {
    return { error: `That path is too deep (more than ${String(MAX_PATH_STEPS)} steps).` };
  }
  return { steps };
}

/** A message saying what is wrong with an extractor, or undefined when it can be used. */
export function checkExtractor(extractor: Extractor): string | undefined {
  if (extractor.type === 'jsonpath') {
    const parsed = parsePath(extractor.path);
    return 'error' in parsed ? parsed.error : undefined;
  }
  const { pattern } = extractor;
  if (pattern === '') return 'Enter a pattern, for example id=(\\d+).';
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `A pattern can be at most ${String(MAX_PATTERN_LENGTH)} characters.`;
  }
  try {
    new RegExp(pattern);
  } catch {
    return 'That is not a valid pattern.';
  }
  if (BACK_REFERENCE.test(pattern)) return 'A pattern cannot use a back-reference such as \\1.';
  if (REPEATED_REPEAT.test(pattern)) {
    return 'This pattern repeats a repeat, such as (a+)+, which can make Conduit hang. Simplify it.';
  }
  return undefined;
}

/** What the person typed into the form: nothing to extract, or a checked extractor. */
export function parseExtractorInput(
  choice: ExtractorChoice,
  text: string,
): { ok: true; extractor?: Extractor } | { ok: false; error: string } {
  if (choice === 'none') return { ok: true };
  const trimmed = text.trim();
  const extractor: Extractor =
    choice === 'regex' ? { type: 'regex', pattern: trimmed } : { type: 'jsonpath', path: trimmed };
  const error = checkExtractor(extractor);
  return error === undefined ? { ok: true, extractor } : { ok: false, error };
}

/** Reads an extractor from a rules file, an app's request or storage, checking it. */
export function readExtractor(
  raw: unknown,
): { ok: true; extractor: Extractor } | { ok: false; problem: string } {
  const bad = {
    ok: false as const,
    problem:
      'the extractor must be a pattern ({"type":"regex","pattern":"..."}) or a JSON path ({"type":"jsonpath","path":"..."}).',
  };
  if (!isRecord(raw)) return bad;
  let extractor: Extractor;
  if (raw.type === 'regex' && typeof raw.pattern === 'string') {
    extractor = { type: 'regex', pattern: raw.pattern };
  } else if (raw.type === 'jsonpath' && typeof raw.path === 'string') {
    extractor = { type: 'jsonpath', path: raw.path };
  } else {
    return bad;
  }
  const problem = checkExtractor(extractor);
  return problem === undefined ? { ok: true, extractor } : { ok: false, problem };
}

/** What an extractor keeps, as it reads inside a rule's sentence. */
export function describeExtractor(extractor: Extractor): string {
  return extractor.type === 'jsonpath'
    ? `the field ${extractor.path}`
    : `what matches /${extractor.pattern}/`;
}

function lookUp(root: unknown, steps: readonly Step[]): unknown {
  let current = root;
  for (const step of steps) {
    if (typeof step === 'number') {
      if (!Array.isArray(current) || step >= current.length) return undefined;
      current = current[step] as unknown;
    } else {
      // Own properties only: a path like $.constructor must not reach the built-ins.
      if (!isRecord(current) || Array.isArray(current) || !Object.hasOwn(current, step)) {
        return undefined;
      }
      current = current[step];
    }
  }
  return current;
}

/**
 * The part of a value an extractor keeps, or undefined when there is nothing to keep (no
 * match, not JSON, no such field). A pattern with a group keeps the first group.
 */
export function extractValue(extractor: Extractor, value: string): string | undefined {
  if (extractor.type === 'regex') {
    if (value.length > MAX_REGEX_INPUT || checkExtractor(extractor) !== undefined) return undefined;
    const match = new RegExp(extractor.pattern).exec(value);
    if (!match) return undefined;
    const kept = match.length > 1 ? match[1] : match[0];
    return kept === undefined || kept === '' ? undefined : kept;
  }
  const parsed = parsePath(extractor.path);
  if ('error' in parsed || value.length > MAX_JSON_INPUT) return undefined;
  let root: unknown;
  try {
    root = JSON.parse(value);
  } catch {
    return undefined;
  }
  const found = lookUp(root, parsed.steps);
  if (found === undefined || found === null) return undefined;
  if (typeof found === 'string') return found;
  if (typeof found === 'number' || typeof found === 'boolean') return String(found);
  return JSON.stringify(found);
}

/** Applies the rule's extractor, if it has one, dropping values it cannot be applied to. */
export function extractFrom(
  rule: Pick<Rule, 'extract'>,
  observed: readonly Observed[],
): Observed[] {
  const { extract } = rule;
  if (extract === undefined) return [...observed];
  return observed.flatMap((item) => {
    const value = extractValue(extract, item.value);
    return value === undefined ? [] : [{ ...item, value }];
  });
}
