import { spawnSync } from "node:child_process";
import process from "node:process";

const vitest = process.platform === "win32"
  ? "node_modules/.bin/vitest.cmd"
  : "node_modules/.bin/vitest";

const result = spawnSync(vitest, [
  "run",
  "--passWithNoTests",
  "--coverage",
  "--coverage.reporter=text",
  "--coverage.reporter=lcov",
  "--coverage.include=packages/*/src/**/*.ts",
  "--coverage.include=apps/web/src/**/*.ts",
  "--coverage.exclude=**/*.d.ts",
  "--coverage.thresholds.lines=60",
  "--coverage.thresholds.statements=60",
  "--coverage.thresholds.functions=65",
  "--coverage.thresholds.branches=55",
], { stdio: "inherit" });

if (result.error) {
  console.error(`Unable to start Vitest coverage: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
