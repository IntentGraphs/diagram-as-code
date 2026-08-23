import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://127.0.0.1:5173' },
});
