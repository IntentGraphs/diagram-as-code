import { defineConfig } from 'vitest/config';

// Vitest 4 uses `test.projects` for the workspace boundary. Keeping the
// project roots explicit prevents linked worktrees and browser E2E files from
// being collected by the root unit/coverage command.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
  },
});
