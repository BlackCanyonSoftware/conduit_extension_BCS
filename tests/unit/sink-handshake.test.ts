import { describe, expect, it } from 'vitest';
import { parseHandshake } from '../../src/core/sinks/handshake';

const cookieWant = {
  id: 'session',
  kind: 'cookie',
  origin: 'https://*.example.com',
  names: ['sid'],
  why: 'The app reads your own account page.',
};

function shake(wants: unknown, overrides: Record<string, unknown> = {}): unknown {
  return { conduit: 1, name: 'Test App', wants, ...overrides };
}

describe('US-008: reading what an app says about itself', () => {
  it('returns the name and a request for cookies, with its reason unchanged', () => {
    expect(parseHandshake(shake([cookieWant]))).toEqual({
      ok: true,
      name: 'Test App',
      wants: [
        {
          id: 'session',
          kind: 'cookie',
          origin: 'https://*.example.com',
          names: ['sid'],
          why: 'The app reads your own account page.',
          site: 'example.com',
        },
      ],
    });
  });

  it('works out the site from an address or a bare domain', () => {
    const result = parseHandshake(
      shake([
        { ...cookieWant, id: 'a', origin: 'https://www.example.com' },
        { ...cookieWant, id: 'b', origin: 'example.org' },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      wants: [{ site: 'example.com' }, { site: 'example.org' }],
    });
  });

  it('accepts an app that asks for nothing yet', () => {
    expect(parseHandshake(shake([]))).toEqual({ ok: true, name: 'Test App', wants: [] });
    expect(parseHandshake({ conduit: 1, name: 'Test App' })).toMatchObject({ ok: true, wants: [] });
  });

  it('keeps a request it cannot approve, with the reason, so you can see it', () => {
    const result = parseHandshake(
      shake([
        { ...cookieWant, id: 's', kind: 'storage' },
        { ...cookieWant, id: 'w', kind: 'weird' },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      wants: [
        { id: 's', problem: 'Requests for page storage are not supported yet.' },
        { id: 'w', problem: 'This kind of request is not supported.' },
      ],
    });
  });

  it('requires a reason, because it is what you read before approving', () => {
    const problem = 'The app gave no reason for this request, so it cannot be approved.';

    expect(parseHandshake(shake([{ ...cookieWant, why: '' }]))).toMatchObject({
      wants: [{ problem }],
    });
    expect(parseHandshake(shake([{ ...cookieWant, why: '   ' }]))).toMatchObject({
      wants: [{ problem }],
    });
    const withoutWhy: Record<string, unknown> = { ...cookieWant };
    delete withoutWhy.why;
    expect(parseHandshake(shake([withoutWhy]))).toMatchObject({ wants: [{ problem }] });
  });

  it('flags a reason that is too long to read', () => {
    expect(parseHandshake(shake([{ ...cookieWant, why: 'x'.repeat(501) }]))).toMatchObject({
      wants: [{ problem: 'The reason is too long (over 500 characters).' }],
    });
  });

  it('flags bad cookie names and a bad site', () => {
    expect(parseHandshake(shake([{ ...cookieWant, names: [] }]))).toMatchObject({
      wants: [{ problem: 'Enter at least one cookie name.' }],
    });
    expect(parseHandshake(shake([{ ...cookieWant, names: ['a=b'] }]))).toMatchObject({
      wants: [{ problem: expect.stringContaining('not a valid cookie name') as string }],
    });
    expect(parseHandshake(shake([{ ...cookieWant, origin: 'not a site' }]))).toMatchObject({
      wants: [{ problem: 'The site in this request is not a website address.' }],
    });
  });

  it('flags a second request that reuses an id, and one with no usable id', () => {
    const result = parseHandshake(
      shake([cookieWant, cookieWant, { ...cookieWant, id: 'bad id!' }]),
    );

    expect(result).toMatchObject({
      wants: [
        { id: 'session' },
        { id: 'session', problem: 'Another request already uses this id.' },
        { id: 'invalid-3', problem: 'The request has no usable id.' },
      ],
    });
  });

  it.each([
    ['text', 'That address answered, but not as a Conduit app.'],
    ['null', 'That address answered, but not as a Conduit app.'],
    [{ name: 'x' }, 'That address answered, but not as a Conduit app.'],
    [{ conduit: 2, name: 'x' }, 'This app speaks a different version of Conduit (version 2).'],
    [{ conduit: 1 }, 'The app did not give its name.'],
    [{ conduit: 1, name: '  ' }, 'The app did not give its name.'],
    [{ conduit: 1, name: 'n'.repeat(81) }, "The app's name is too long (over 80 characters)."],
    [{ conduit: 1, name: 'x', wants: 'all' }, "The app's list of requests is not a list."],
  ])('refuses %j', (raw, error) => {
    expect(parseHandshake(raw)).toEqual({ ok: false, error });
  });

  it('refuses an app that asks for more than fifty things', () => {
    const many = Array.from({ length: 51 }, (_, index) => ({
      ...cookieWant,
      id: `want-${String(index)}`,
    }));

    expect(parseHandshake(shake(many))).toEqual({
      ok: false,
      error: 'The app asks for too many things (more than 50).',
    });
  });
});
