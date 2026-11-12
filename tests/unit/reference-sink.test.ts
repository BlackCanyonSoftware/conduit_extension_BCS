import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

// The example app has to be easy to start on a computer where something else already uses a port
// (Docker Desktop holds 8778 on some machines). "Look on this computer" checks 8778 to 8787, so
// the app takes the first free port in that range when no port is given.

const python = process.platform === 'win32' ? 'python' : 'python3';
const hasPython = spawnSync(python, ['--version']).error === undefined;

const running: (ChildProcess | Server)[] = [];

afterEach(() => {
  for (const item of running.splice(0)) {
    if ('kill' in item) item.kill();
    else item.close();
  }
});

/** Starts the app and resolves with the first line it prints, and the process. */
function start(args: string[]): Promise<{ line: string; app: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const app = spawn(python, ['-u', 'examples/reference_sink.py', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    running.push(app);
    let output = '';
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /listening on http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) resolve({ line: match[0], app });
    };
    app.stdout.on('data', onData);
    app.stderr.on('data', onData);
    app.once('exit', () => {
      reject(new Error(`the app stopped before it was listening:\n${output}`));
    });
  });
}

const portOf = (line: string): number => Number(line.slice(line.lastIndexOf(':') + 1));

describe.skipIf(!hasPython)('the example app chooses a port', () => {
  it('takes a free port from 8778 to 8787 when none is given, and a second copy takes another', async () => {
    const first = await start([]);
    const second = await start([]);

    const [a, b] = [portOf(first.line), portOf(second.line)];
    expect(a).toBeGreaterThanOrEqual(8778);
    expect(a).toBeLessThanOrEqual(8787);
    expect(b).toBeGreaterThanOrEqual(8778);
    expect(b).toBeLessThanOrEqual(8787);
    expect(b).not.toBe(a);
  }, 20_000);

  it('uses the port it is asked for, and says so plainly when that port is taken', async () => {
    const blocker = createServer();
    running.push(blocker);
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const taken = typeof address === 'object' && address ? address.port : 0;

    const result = spawnSync(python, ['examples/reference_sink.py', '--port', String(taken)], {
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain(`port ${String(taken)} is not free`);
    expect(result.stderr).not.toContain('Traceback');
  }, 20_000);
});
