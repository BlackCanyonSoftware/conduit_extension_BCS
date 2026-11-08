import { defineConfig } from '@playwright/test';

// The Firefox tests reach the extension through a test-only content script (see
// tests/support/bridge-content.ts), because Playwright's Firefox cannot open an extension's own
// pages. They cover what happens in the background (capture, headers, storage reads, delivery);
// the popup and rules page are the same code as in Chrome and are checked by hand.
export default defineConfig({
  testDir: 'tests/e2e-firefox',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
