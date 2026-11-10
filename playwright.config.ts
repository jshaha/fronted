import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['line']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['chromium'] },
    },
  ],
  globalSetup: path.resolve(__dirname, './e2e/global-setup.ts'),
  globalTeardown: path.resolve(__dirname, './e2e/global-teardown.ts'),
  webServer: [
    {
      command: 'npx next dev -p 3100',
      url: 'http://localhost:3100/api/state',
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        CLAUDE_MODE: 'replay',
        REPLAY_LATENCY_MS: '0',
        DB_PATH: 'data/e2e.sqlite',
        PORT: '3100',
        PORTAL_URL: 'http://localhost:3100/mock-portal',
        PORTAL_ALLOWED_ORIGINS: 'http://localhost:3100,http://127.0.0.1:3100',
        PORTAL_RUNNER: 'headless',
        MOCK_PORTAL_FAST: '1',
        PORTAL_STEP_DELAY_MS: '0',
      },
    },
  ],
});
