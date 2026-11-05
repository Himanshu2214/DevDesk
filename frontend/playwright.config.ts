// End-to-end tests (Playwright).
//  sample – the app on its sample-data backend: every test gets a fresh browser context, so a fresh data set
//  mobile – layout audit at six viewport sizes (sample data)
//  cloud  – sign-in, sharing, organizations, change history against a dedicated TEST Supabase project. Runs only when
//           frontend/.env.e2e.local exists (never committed; see e2e/README.md). Never point it at production.
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const SAMPLE_PORT = 5191, CLOUD_PORT = 5193;
const cloud = existsSync('.env.e2e.local');
// one id per test run, shared with the workers: test accounts carry it, so the clean-up finds this run's accounts
process.env.E2E_RUN ??= Date.now().toString(36);

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',
  timeout: 45_000,
  // a whole run stops after an hour; the cloud clean-up relies on this to tell abandoned test accounts from those of a
  // run still going (RUN_LIMIT_MS in e2e/cloud/safety.ts)
  globalTimeout: 60 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,              // more parallel browsers than this overload a laptop and make waits flaky
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,                 // a test.only left in by mistake fails CI instead of silently skipping the rest
  reporter: [['list'], ['html', { outputFolder: './e2e-report', open: 'never' }]],
  // locally the installed Chrome (no browser download needed); CI installs Playwright's own Chromium
  use: { channel: process.env.CI ? undefined : (process.env.PW_CHANNEL ?? 'chrome'), trace: 'retain-on-failure', screenshot: 'only-on-failure',
    video: 'off', locale: 'en-GB', timezoneId: 'Asia/Kolkata' },
  projects: [
    { name: 'sample', testMatch: /sample\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${SAMPLE_PORT}` } },
    // the audit saves its own screenshot of every screen; the automatic one on failure can hang on emulated phones
    { name: 'mobile', testMatch: /mobile\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SAMPLE_PORT}`, screenshot: 'off', trace: 'off' } },
    // cloud-setup (safety checks, abandoned accounts) runs first; cloud-teardown removes leftovers afterwards, also after failures
    ...(cloud ? [
      { name: 'cloud-setup', testMatch: /cloud\/setup\.ts/, teardown: 'cloud-teardown' },
      { name: 'cloud-teardown', testMatch: /cloud\/teardown\.ts/ },
      { name: 'cloud', testMatch: /cloud\/.*\.spec\.ts/, workers: 1, dependencies: ['cloud-setup'],
        use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${CLOUD_PORT}` } },
    ] : []),
  ],
  webServer: [
    // a built copy (fast and stable under parallel tests): sample-data mode, served by vite preview
    { command: `npx vite build --mode development --outDir e2e-dist --emptyOutDir && npx vite preview --mode development --outDir e2e-dist --port ${SAMPLE_PORT} --strictPort`,
      url: `http://localhost:${SAMPLE_PORT}`, reuseExistingServer: false, timeout: 180_000 },
    ...(cloud ? [{ command: `npx vite build --mode e2e --outDir e2e-dist-cloud --emptyOutDir && npx vite preview --mode e2e --outDir e2e-dist-cloud --port ${CLOUD_PORT} --strictPort`,
      url: `http://localhost:${CLOUD_PORT}`, reuseExistingServer: false, timeout: 180_000 }] : []),
  ],
});
