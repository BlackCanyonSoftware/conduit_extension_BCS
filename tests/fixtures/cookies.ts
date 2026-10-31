import type { Cookie } from '../../src/core/cookies/types';

/** Three cookies covering host-only/domain, session/persistent, HttpOnly and a non-root path. */
export const SAMPLE_COOKIES: Cookie[] = [
  {
    name: 'sid',
    value: 'abc123',
    domain: 'www.example.com',
    hostOnly: true,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    session: true,
    storeId: '0',
  },
  {
    name: 'theme',
    value: 'dark',
    domain: '.example.com',
    hostOnly: false,
    path: '/',
    secure: false,
    httpOnly: false,
    sameSite: 'unspecified',
    session: false,
    expirationDate: 1893456000.5,
    storeId: '0',
  },
  {
    name: 'prefs',
    value: 'a=b',
    domain: '.example.com',
    hostOnly: false,
    path: '/app',
    secure: true,
    httpOnly: false,
    sameSite: 'no_restriction',
    session: false,
    expirationDate: 1900000000,
    storeId: '0',
  },
];
