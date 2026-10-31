import { describe, expect, it } from 'vitest';
import {
  deliveryUrl,
  handshakeUrl,
  isLoopbackHost,
  matchesConfirmation,
  parseRoute,
  parseSinkUrl,
  permissionPatterns,
} from '../../src/core/sinks/host';

describe('US-010: which hosts are on this computer', () => {
  it.each(['localhost', 'LOCALHOST', 'localhost.', '127.0.0.1', '127.255.255.254', '[::1]', '::1'])(
    '%s is on this computer',
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each([
    'localhost.evil.test',
    '127.0.0.1.evil.test',
    'example.com',
    '0.0.0.0',
    '128.0.0.1',
    '10.0.0.1',
    '192.168.1.5',
    'foo.localhost',
    '[::ffff:7f00:1]',
    '',
  ])('%s is not treated as on this computer', (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe('US-008, US-010: reading the address of an app', () => {
  it('adds http to a bare address and keeps the port', () => {
    expect(parseSinkUrl('127.0.0.1:8778')).toEqual({
      ok: true,
      url: 'http://127.0.0.1:8778',
      host: '127.0.0.1',
      label: '127.0.0.1:8778',
      loopback: true,
    });
  });

  it('drops a trailing slash and keeps a path the app lives under', () => {
    expect(parseSinkUrl('http://localhost:8778/')).toMatchObject({ url: 'http://localhost:8778' });
    expect(parseSinkUrl('http://127.0.0.1:8778/my-app/')).toMatchObject({
      url: 'http://127.0.0.1:8778/my-app',
    });
  });

  it('understands IPv6 loopback', () => {
    expect(parseSinkUrl('http://[::1]:8778')).toMatchObject({
      loopback: true,
      label: '[::1]:8778',
      host: '[::1]',
    });
  });

  it('sees through alternative spellings of 127.0.0.1', () => {
    expect(parseSinkUrl('http://127.1:8778')).toMatchObject({
      url: 'http://127.0.0.1:8778',
      loopback: true,
    });
    expect(parseSinkUrl('http://0x7f.0.0.1:8778')).toMatchObject({ loopback: true });
  });

  it('accepts an https address on another computer and marks it', () => {
    expect(parseSinkUrl('https://sink.example.net')).toEqual({
      ok: true,
      url: 'https://sink.example.net',
      host: 'sink.example.net',
      label: 'sink.example.net',
      loopback: false,
    });
  });

  it.each([
    ['', 'Enter the address of the app, for example http://127.0.0.1:8778.'],
    ['   ', 'Enter the address of the app, for example http://127.0.0.1:8778.'],
    ['http://not a url', 'That does not look like an address.'],
    ['ftp://127.0.0.1', 'Use an http or https address.'],
    ['http://user:pw@127.0.0.1:8778', 'Leave out the user name and password.'],
    ['http://127.0.0.1:8778/?a=1', 'Leave out anything after a ? or #.'],
    ['http://127.0.0.1:8778/#x', 'Leave out anything after a ? or #.'],
    ['http://sink.example.net', 'Apps on other computers must use https.'],
  ])('refuses %j', (text, error) => {
    expect(parseSinkUrl(text)).toEqual({ ok: false, error });
  });
});

describe('US-010: the typed confirmation for other computers', () => {
  it('matches the host name, ignoring case and spaces around it', () => {
    expect(matchesConfirmation(' Sink.Example.net ', 'sink.example.net')).toBe(true);
  });

  it.each(['', 'sink', 'sink.example.net.evil.test', 'yes'])('does not match %j', (typed) => {
    expect(matchesConfirmation(typed, 'sink.example.net')).toBe(false);
  });
});

describe('US-011: a custom delivery path', () => {
  it('accepts a plain path, or none', () => {
    expect(parseRoute('/api/integrity')).toEqual({ ok: true, route: '/api/integrity' });
    expect(parseRoute('  ')).toEqual({ ok: true, route: undefined });
  });

  it.each([
    ['api/integrity', 'Start the path with /, for example /api/integrity.'],
    ['//other.test/x', 'The path must stay on the same app.'],
    ['/a/../b', 'The path must stay on the same app.'],
    ['/a?x=1', 'Use a path only, without ? or #.'],
    ['/a#x', 'Use a path only, without ? or #.'],
    ['/a b', 'The path may not contain spaces.'],
    [`/${'a'.repeat(200)}`, 'The path is too long (over 200 characters).'],
  ])('refuses %j', (text, error) => {
    expect(parseRoute(text)).toEqual({ ok: false, error });
  });
});

describe('where Conduit talks to an app', () => {
  it('asks for the handshake at the well-known path', () => {
    expect(handshakeUrl('http://127.0.0.1:8778')).toBe('http://127.0.0.1:8778/.well-known/conduit');
    expect(handshakeUrl('http://127.0.0.1:8778/my-app')).toBe(
      'http://127.0.0.1:8778/my-app/.well-known/conduit',
    );
  });

  it('delivers to /conduit/deliver unless the app has its own path', () => {
    expect(deliveryUrl('http://127.0.0.1:8778')).toBe('http://127.0.0.1:8778/conduit/deliver');
    expect(deliveryUrl('http://127.0.0.1:8778', '/api/integrity')).toBe(
      'http://127.0.0.1:8778/api/integrity',
    );
  });

  it('asks the browser for access to the app and nothing else', () => {
    expect(permissionPatterns('http://127.0.0.1:8778')).toEqual(['http://127.0.0.1/*']);
    expect(permissionPatterns('https://sink.example.net/my-app')).toEqual([
      'https://sink.example.net/*',
    ]);
    expect(permissionPatterns('http://[::1]:8778')).toEqual(['http://[::1]/*']);
  });
});
