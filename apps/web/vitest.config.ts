import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// This is the web-only Vitest entry point. The repository root owns the primary
// Vitest CLI/version; keep this config focused on apps/web unit tests so the
// accessibility/diagram checks can run without a risky root toolchain upgrade.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
  },
});
