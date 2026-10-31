import { isRecord } from '../records';
import { readExtractor } from '../extract';
import { checkHeaderNames, checkNames, checkStorageKeys, normalizeSite } from '../rules/validate';
import type { Want } from './types';

export type ParsedHandshake =
  { ok: true; name: string; wants: Want[] } | { ok: false; error: string };

const MAX_NAME_LENGTH = 80;
const MAX_WHY_LENGTH = 500;
const MAX_WANTS = 50;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Control characters become spaces, so an app cannot garble the screen with its name. */
function printable(text: string): string {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  })
    .join('')
    .trim();
}

/** Works out the site a request covers from the way an app wrote its origin. */
function siteFromOrigin(origin: unknown): string | undefined {
  if (typeof origin !== 'string') return undefined;
  const host = origin
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^\*\./, '')
    .split('/')[0];
  return host === undefined ? undefined : normalizeSite(host);
}

function readWant(raw: unknown, index: number, seenIds: Set<string>): Want {
  const record = isRecord(raw) ? raw : {};
  const id = typeof record.id === 'string' && ID_PATTERN.test(record.id) ? record.id : undefined;
  const origin = typeof record.origin === 'string' ? record.origin : '';
  const why = typeof record.why === 'string' ? record.why : '';
  const kind = typeof record.kind === 'string' ? record.kind : '';
  const names =
    Array.isArray(record.names) &&
    record.names.every((name): name is string => typeof name === 'string')
      ? record.names
      : [];
  const want: Want = { id: id ?? `invalid-${String(index + 1)}`, kind, origin, names, why };

  if (id === undefined) return { ...want, problem: 'The request has no usable id.' };
  if (seenIds.has(id)) return { ...want, problem: 'Another request already uses this id.' };
  seenIds.add(id);

  if (kind !== 'cookie' && kind !== 'header' && kind !== 'storage') {
    return { ...want, problem: 'This kind of request is not supported.' };
  }
  if (kind === 'header') {
    const direction = record.direction ?? 'request';
    if (direction !== 'request' && direction !== 'response') {
      return { ...want, problem: 'The direction must be "request" or "response".' };
    }
    want.direction = direction;
    want.names = [...new Set(names.map((name) => name.toLowerCase()))];
  }
  if (kind === 'storage') {
    const area = record.area ?? 'local';
    if (area !== 'local' && area !== 'session') {
      return { ...want, problem: 'The storage area must be "local" or "session".' };
    }
    want.area = area;
  }
  if (record.extract !== undefined) {
    const read = readExtractor(record.extract);
    if (!read.ok) {
      return { ...want, problem: `The ${read.problem.replace(/^the /, '')}` };
    }
    want.extract = read.extractor;
  }
  if (why.trim() === '') {
    return {
      ...want,
      problem: 'The app gave no reason for this request, so it cannot be approved.',
    };
  }
  if (why.length > MAX_WHY_LENGTH) {
    return {
      ...want,
      problem: `The reason is too long (over ${String(MAX_WHY_LENGTH)} characters).`,
    };
  }
  const site = siteFromOrigin(origin);
  if (site === undefined) {
    return { ...want, problem: 'The site in this request is not a website address.' };
  }
  const namesProblem =
    kind === 'header'
      ? checkHeaderNames(want.names)
      : kind === 'storage'
        ? checkStorageKeys(names)
        : checkNames(names);
  if (namesProblem) return { ...want, site, problem: namesProblem };
  return { ...want, site };
}

/** Reads an app's answer to the handshake. Requests that cannot be approved are kept, with the reason. */
export function parseHandshake(raw: unknown): ParsedHandshake {
  if (!isRecord(raw) || typeof raw.conduit !== 'number') {
    return { ok: false, error: 'That address answered, but not as a Conduit app.' };
  }
  if (raw.conduit !== 1) {
    return {
      ok: false,
      error: `This app speaks a different version of Conduit (version ${String(raw.conduit)}).`,
    };
  }
  const name = typeof raw.name === 'string' ? printable(raw.name) : '';
  if (name === '') return { ok: false, error: 'The app did not give its name.' };
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `The app's name is too long (over ${String(MAX_NAME_LENGTH)} characters).`,
    };
  }
  const list: unknown = raw.wants ?? [];
  if (!Array.isArray(list))
    return { ok: false, error: "The app's list of requests is not a list." };
  if (list.length > MAX_WANTS) {
    return {
      ok: false,
      error: `The app asks for too many things (more than ${String(MAX_WANTS)}).`,
    };
  }
  const seenIds = new Set<string>();
  return {
    ok: true,
    name,
    wants: (list as unknown[]).map((item, index) => readWant(item, index, seenIds)),
  };
}
