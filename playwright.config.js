import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: 'tests/e2e',
  // One shared database: specs must not run in parallel.
  workers: 1,
  fullyParallel: false,
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:8080/api/ping',
    reuseExistingServer: true,
  },
});
