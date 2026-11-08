import { createServer } from 'node:http';

// The local servers the end-to-end tests use, shared by the Chromium and the Firefox suites.

/** One POST the test app received. `status` is what it answered. */
export interface Delivered {
  path: string;
  body: unknown;
  status: number;
}

/** A small app that follows the integration contract, with controls for failing on purpose. */
export interface TestSink {
  url: string;
  port: number;
  received: Delivered[];
  /** The next `count` deliveries are answered with `status` instead of 204. */
  failNext: (count: number, status?: number) => void;
  /** What the handshake answers. Replace `wants` or the whole object. */
  handshake: Record<string, unknown>;
  /** Answer the handshake with this exact text (and status) instead. */
  answerHandshakeWith: (text: string, status?: number) => void;
  close: () => Promise<void>;
}

/** Starts a test app on this computer. Port 0 picks a free one. */
export async function startSink(port = 0): Promise<TestSink> {
  const received: Delivered[] = [];
  const failures = { count: 0, status: 500 };
  const raw: { text?: string; status: number } = { status: 200 };
  const sink: TestSink = {
    url: '',
    port: 0,
    received,
    failNext: (count, status = 500) => {
      failures.count = count;
      failures.status = status;
    },
    handshake: {
      conduit: 1,
      name: 'Test App',
      wants: [
        {
          id: 'sid-want',
          kind: 'cookie',
          origin: 'http://localhost',
          names: ['sid'],
          why: 'The test app wants the sid cookie to check delivery.',
        },
        {
          id: 'theme-want',
          kind: 'cookie',
          origin: 'http://localhost',
          names: ['theme'],
          why: 'The test app also wants the theme cookie.',
        },
      ],
    },
    answerHandshakeWith: (text, status = 200) => {
      raw.text = text;
      raw.status = status;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        // The browser keeps connections open between requests; close() alone waits for them.
        server.closeAllConnections();
      }),
  };
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://app.test').pathname;
    if (request.method === 'GET' && path === '/.well-known/conduit') {
      response.statusCode = raw.status;
      response.setHeader('Content-Type', 'application/json');
      response.end(raw.text ?? JSON.stringify(sink.handshake));
      return;
    }
    if (request.method === 'POST') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          body = undefined;
        }
        let status = 204;
        if (failures.count > 0) {
          failures.count -= 1;
          status = failures.status;
        }
        received.push({ path, body, status });
        response.statusCode = status;
        response.end();
      });
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test app has no port');
  sink.port = address.port;
  sink.url = `http://127.0.0.1:${String(address.port)}`;
  return sink;
}

/** A local test website: sets cookies, headers and storage values that tests can change. */
export async function startSite(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const address = new URL(request.url ?? '/', 'http://localhost');
    if (address.pathname === '/favicon.ico') {
      // Browsers ask for this after a page loads; it must not touch the cookies.
      response.statusCode = 404;
      response.end();
      return;
    }
    // `?resp=value` changes the value of the x-conduit-resp header the site answers with.
    const resp = address.searchParams.get('resp') ?? 'page-response-value-1';
    if (address.pathname === '/ping') {
      // Answers the page's own fetch; sets no cookies.
      response.setHeader('X-Ping', 'pong');
      response.end('pong');
      return;
    }
    response.setHeader('X-Conduit-Resp', resp);
    response.setHeader('X-Other', 'not-asked-for');
    // `?sid=value` lets a test change the value of the sid cookie.
    const sid = address.searchParams.get('sid');
    response.setHeader('Set-Cookie', [
      `sid=${sid ?? 'abc123def456ghi789'}; Path=/; HttpOnly; SameSite=Lax`,
      'theme=dark; Path=/; Max-Age=31536000',
      'token=0123456789abcdefXYZ; Path=/app; Secure',
    ]);
    response.setHeader('Content-Type', 'text/html');
    // The page asks for /ping with a header of its own, and keeps some values in its storage.
    // `?req=`, `?local=`, `?session=` and `?tok=` change them.
    response.end(
      '<!doctype html><title>Test site</title><h1>Test site</h1><script>' +
        'const q = new URLSearchParams(location.search);' +
        "fetch('/ping', { headers: { 'X-Conduit-Req': q.get('req') ?? 'request-value-1234', 'X-Not-Asked': 'x' } });" +
        "localStorage.setItem('conduit-local', q.get('local') ?? 'local-value-1234');" +
        "localStorage.setItem('conduit-json', JSON.stringify({ token: q.get('tok') ?? 'json-token-1', visits: Date.now() }));" +
        "localStorage.setItem('conduit-other', 'not-asked-for');" +
        "sessionStorage.setItem('conduit-session', q.get('session') ?? 'session-value-1234');" +
        '</script>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test server has no port');
  return {
    url: `http://localhost:${String(address.port)}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        // The browser keeps connections open between requests, so close() alone can wait
        // forever and time the test out.
        server.closeAllConnections();
      }),
  };
}
