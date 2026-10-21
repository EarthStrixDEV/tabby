import { defineConfig, devices } from '@playwright/test';

const PHP_S = 'http://127.0.0.1:8080';
const baseURL = process.env.BASE_URL || PHP_S;
// php -S is started only when the tests target it. Any other BASE_URL (e.g. serve:apache on :8081) must already be running.
const usePhpS = new URL(baseURL).origin === PHP_S;

export default defineConfig({
  testDir: 'tests/e2e',
  // One shared database: specs must not run in parallel.
  workers: 1,
  fullyParallel: false,
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: usePhpS
    ? {
        command: 'npm run serve',
        url: `${PHP_S}/api/ping`,
        reuseExistingServer: true,
        // php -S writes its per-request access log to stderr; keep the test output readable.
        stdout: 'ignore',
        stderr: 'ignore',
      }
    : undefined,
});
