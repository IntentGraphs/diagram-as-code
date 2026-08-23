#!/usr/bin/env node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "bpm-notices-"));
const generated = join(temp, "THIRD-PARTY-NOTICES.md");
try {
  const result = spawnSync(process.execPath, [join(root, "scripts", "generate-third-party-notices.mjs"), generated], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "notice generation failed\n");
    process.exitCode = result.status ?? 1;
  } else {
    const [checkedIn, regenerated] = await Promise.all([
      readFile(join(root, "THIRD-PARTY-NOTICES.md"), "utf8"),
      readFile(generated, "utf8"),
    ]);
    if (checkedIn !== regenerated) {
      console.error("THIRD-PARTY-NOTICES.md is stale; regenerate it from the installed lockfile tree.");
      process.exitCode = 1;
    } else {
      console.log("THIRD-PARTY-NOTICES.md matches deterministic regeneration.");
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
