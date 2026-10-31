import { siteScopeFor } from '../cookies/site';
import type { HeaderDirection, StorageArea } from './types';

export const MAX_NAMES = 50;
export const MAX_NAME_LENGTH = 200;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const FORBIDDEN_IN_NAME = ' ;=,"\\';

export interface RuleDraft {
  site: string;
  names: string[];
}

export type DraftResult =
  { ok: true; draft: RuleDraft } | { ok: false; errors: { site?: string; names?: string } };

/** Reduces a typed or pasted site (a bare domain or a full address) to its site, or undefined. */
export function normalizeSite(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const scope = siteScopeFor(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  return scope.supported ? scope.site : undefined;
}

/** Splits typed text on commas and white space, dropping empty parts and repeats. */
export function splitNames(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((name) => name !== ''))];
}

/** A message describing what is wrong with a list of cookie names, or undefined when it is fine. */
export function checkNames(names: readonly string[]): string | undefined {
  if (names.length === 0) return 'Enter at least one cookie name.';
  if (names.length > MAX_NAMES) return `Use at most ${String(MAX_NAMES)} cookie names per rule.`;
  for (const name of names) {
    if (name.length > MAX_NAME_LENGTH) {
      return `A cookie name can be at most ${String(MAX_NAME_LENGTH)} characters.`;
    }
    const bad = Array.from(name).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || FORBIDDEN_IN_NAME.includes(character);
    });
    if (bad) {
      return `"${name.replace(/[^\x20-\x7e]/g, '?')}" is not a valid cookie name: use no spaces, quotes, commas, semicolons, equals signs or control characters.`;
    }
  }
  return undefined;
}

/** The characters HTTP allows in a header name. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** A message describing what is wrong with a list of header names, or undefined when it is fine. */
export function checkHeaderNames(names: readonly string[]): string | undefined {
  if (names.length === 0) return 'Enter at least one header name.';
  if (names.length > MAX_NAMES) return `Use at most ${String(MAX_NAMES)} header names per rule.`;
  for (const name of names) {
    if (name.length > MAX_NAME_LENGTH) {
      return `A header name can be at most ${String(MAX_NAME_LENGTH)} characters.`;
    }
    if (!HEADER_NAME.test(name)) {
      return `"${name.replace(/[^\x20-\x7e]/g, '?')}" is not a valid header name: use letters, digits and these marks only: - _ . ! # $ % & ' * + ^ \` | ~`;
    }
  }
  return undefined;
}

/** A message describing what is wrong with a list of storage keys, or undefined when it is fine. */
export function checkStorageKeys(names: readonly string[]): string | undefined {
  if (names.length === 0) return 'Enter at least one key.';
  if (names.length > MAX_NAMES) return `Use at most ${String(MAX_NAMES)} keys per rule.`;
  for (const name of names) {
    if (name.length > MAX_NAME_LENGTH) {
      return `A key can be at most ${String(MAX_NAME_LENGTH)} characters.`;
    }
    const bad = Array.from(name).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
    if (bad) {
      return `"${name.replace(/[^\x20-\x7e]/g, '?')}" is not a valid key: it has control characters.`;
    }
  }
  return undefined;
}

export interface StorageRuleDraft extends RuleDraft {
  area: StorageArea;
}

export type StorageDraftResult =
  { ok: true; draft: StorageRuleDraft } | { ok: false; errors: { site?: string; names?: string } };

/** Checks what the person typed into the new-rule form for a storage rule. Keys keep their case. */
export function parseStorageRuleDraft(input: {
  site: string;
  names: string;
  area: StorageArea;
}): StorageDraftResult {
  const errors: { site?: string; names?: string } = {};

  const site = normalizeSite(input.site);
  if (input.site.trim() === '') errors.site = 'Enter a site, for example example.com.';
  else if (site === undefined) errors.site = 'That does not look like a website address.';

  const names = splitNames(input.names);
  const namesError = checkStorageKeys(names);
  if (namesError) errors.names = namesError;

  if (errors.site !== undefined || errors.names !== undefined || site === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, draft: { site, names, area: input.area } };
}

/** Header names are not case sensitive; Conduit keeps them in lower case. */
export function splitHeaderNames(text: string): string[] {
  return [...new Set(splitNames(text).map((name) => name.toLowerCase()))];
}

export interface HeaderRuleDraft extends RuleDraft {
  direction: HeaderDirection;
}

export type HeaderDraftResult =
  { ok: true; draft: HeaderRuleDraft } | { ok: false; errors: { site?: string; names?: string } };

/** Checks what the person typed into the new-rule form for a header rule. */
export function parseHeaderRuleDraft(input: {
  site: string;
  names: string;
  direction: HeaderDirection;
}): HeaderDraftResult {
  const errors: { site?: string; names?: string } = {};

  const site = normalizeSite(input.site);
  if (input.site.trim() === '') errors.site = 'Enter a site, for example example.com.';
  else if (site === undefined) errors.site = 'That does not look like a website address.';

  const names = splitHeaderNames(input.names);
  const namesError = checkHeaderNames(names);
  if (namesError) errors.names = namesError;

  if (errors.site !== undefined || errors.names !== undefined || site === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, draft: { site, names, direction: input.direction } };
}

/** Checks what the person typed into the new-rule form. */
export function parseRuleDraft(input: { site: string; names: string }): DraftResult {
  const errors: { site?: string; names?: string } = {};

  const site = normalizeSite(input.site);
  if (input.site.trim() === '') errors.site = 'Enter a site, for example example.com.';
  else if (site === undefined) errors.site = 'That does not look like a website address.';

  const names = splitNames(input.names);
  const namesError = checkNames(names);
  if (namesError) errors.names = namesError;

  if (errors.site !== undefined || errors.names !== undefined || site === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, draft: { site, names } };
}
