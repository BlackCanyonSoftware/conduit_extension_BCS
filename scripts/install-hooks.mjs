// Points git at the committed hooks in .githooks/. Runs from `npm install`; it does
// nothing outside a git checkout (for example a source archive or a CI cache restore).
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (existsSync('.git')) {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
}
