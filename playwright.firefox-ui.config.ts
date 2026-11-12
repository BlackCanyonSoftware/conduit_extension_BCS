import { defineConfig } from '@playwright/test';

// Drives Conduit's own pages (the popup and the rules page) in the Firefox installed on this
// computer, through Marionette (tests/support/marionette.ts). Playwright is only the test runner
// here: its own Firefox cannot open an extension's pages.
export default defineConfig({
  testDir: 'tests/e2e-firefox-ui',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
});
