import { defineConfig } from '@playwright/test';

// Each test launches its own headless Chromium with the built extension loaded
// (see tests/e2e/fixtures.ts), so nothing opens on screen.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
